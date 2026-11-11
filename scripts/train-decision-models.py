#!/usr/bin/env python3
# Baseline mulligan, ink and board (quest / challenge / end turn) models on the rows from
# scripts/decision-rows.mjs, and the choices they flag for coaching.
#   pip install lightgbm pandas scikit-learn
#   python3 scripts/train-decision-models.py [--since 2026-10-08] [--flag 0.1]   (default: every game)
# Every decision is scored by models that never saw its game (5 folds split by game), so the scores
# say how the team's other games would have played that spot. Three models score each decision:
#   card     knows which card it is and how the team plays it in this matchup (best in the current meta)
#   mmr      the same, with each game weighted by its MMR (stronger pilots teach more)
#   generic  only what a card is (cost, type, stats) and the game state, so it carries to a new meta
# The board models have no mmr variant and learn from both players' trusted turns.
# Prints each next to simple baselines and writes decisions/flags.csv (each choice any model gave
# under --flag chance). A flag is a departure from how the team usually plays, not a proven mistake:
# check it in the replay.
import argparse
import lightgbm as lgb
import numpy as np
import pandas as pd
from scipy.optimize import minimize_scalar
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold

ap = argparse.ArgumentParser()
ap.add_argument('--since', default='')
ap.add_argument('--flag', type=float, default=0.1)
args = ap.parse_args()

NO_INK = 'no ink'
CATEGORICAL = ['card_id', 'type', 'my_colors', 'opp_colors']
CONTEXT = ['account', 'game_id', 'started_at', 'my_colors', 'opp_colors', 'went_first']
# What the card does (src/lib/decisionRows.js reads it off the rules text), and how many items the
# opponent's colors are showing in the current meta, alone and against the card's item removal.
TAGS = ['song', 'removes_item', 'removes_location', 'removes_character', 'board_wipe', 'bounce', 'draws', 'ramp', 'makes_discard',
        'kw_alert', 'kw_bodyguard', 'kw_boost', 'kw_challenger', 'kw_evasive', 'kw_reckless', 'kw_resist', 'kw_rush', 'kw_singer',
        'kw_sing_together', 'kw_support', 'kw_vanish', 'kw_ward', 'opp_items_recent', 'item_answer']
GENERIC_CARD = ['copies', 'cost', 'inkable', 'type', 'strength', 'willpower', 'card_lore', 'shift', 'went_first', 'my_colors', 'opp_colors'] + TAGS
CARD = ['card_id'] + GENERIC_CARD
# Card columns the "no ink" option has none of.
NOT_A_CARD = ['copies', 'cost', 'inkable', 'type', 'strength', 'willpower', 'card_lore', 'shift', 'cost_gap'] + [t for t in TAGS if t != 'opp_items_recent']
DECK = ['deck_inkable', 'deck_avg_cost', 'deck_cost_ge5', 'deck_items', 'deck_actions']
PARAMS = dict(n_estimators=300, learning_rate=0.03, num_leaves=15, min_child_samples=20, verbose=-1)


def load(name):
    d = pd.read_csv(f'decisions/{name}.csv')
    d = d[d.started_at >= args.since]
    # The weight doubles every 100 MMR above the median. A game with no MMR (most Bo3) takes the
    # player's median MMR.
    mmr = d.mmr.fillna(d.groupby('account').mmr.transform('median'))
    assert mmr.notna().all(), 'an account has no MMR in any game'
    d = d.assign(weight=2 ** ((mmr - mmr.median()) / 100), strong=mmr >= 1400)
    return d.merge(opp_items_recent(d), on=['account', 'game_id']).assign(item_answer=lambda d: d.removes_item * d.opp_items_recent)


def opp_items_recent(d, days=45, k=10):
    # Items an opponent on these colors showed per game in the other games within `days` either side,
    # pulled toward all opponents in that window while the colors are rare (k games of weight). Decks
    # change with each set: Emerald/Ruby showed 0.5 items a game before set 14 and 3.9 in it.
    g = d.drop_duplicates(['account', 'game_id'])[['account', 'game_id', 'started_at', 'opp_colors', 'opp_items_game']].copy()
    t = pd.to_datetime(g.started_at)
    g['day'] = (t - t.min()) / pd.Timedelta(days=1)

    def window(t, v):  # sum and count of v over each game's window, the game itself left out
        order = np.argsort(t); t, v = t[order], v[order]
        c = np.concatenate([[0], np.cumsum(v)])
        lo, hi = np.searchsorted(t, t - days, 'left'), np.searchsorted(t, t + days, 'right')
        out = np.empty((len(t), 2)); out[order] = np.c_[c[hi] - c[lo] - v, hi - lo - 1]
        return out

    everyone = window(g.day.to_numpy(), g.opp_items_game.to_numpy(float))
    mean = everyone[:, 0] / np.maximum(everyone[:, 1], 1)
    same = np.empty((len(g), 2))
    for _, idx in g.groupby('opp_colors').indices.items():
        same[idx] = window(g.day.to_numpy()[idx], g.opp_items_game.to_numpy(float)[idx])
    return g[['account', 'game_id']].assign(opp_items_recent=(same[:, 0] + k * mean) / (same[:, 1] + k))


def categorize(d):
    for c in CATEGORICAL:
        d[c] = d[c].astype('category')
    return d.reset_index(drop=True)


def matchup_rate(train, test, label):
    # How often the team keeps or inks this card against these opponent colors, pulled toward the
    # card's overall rate while the pair is rare (10 rows of weight).
    key = lambda d: d.card_id.astype(str) + '|' + d.opp_colors.astype(str)
    card = train.groupby(train.card_id.astype(str))[label].mean()
    pair = train.groupby(key(train))[label].agg(['sum', 'count'])
    prior = test.card_id.astype(str).map(card).fillna(train[label].mean()).to_numpy()
    k = key(test)
    return (k.map(pair['sum']).fillna(0).to_numpy() + 10 * prior) / (k.map(pair['count']).fillna(0).to_numpy() + 10)


def encode(train, test, label):
    return test.assign(matchup_rate=matchup_rate(train, test, label))


def encoded(d, label):
    # Each row's encodings come from the other games only, so a choice never explains itself.
    parts = [encode(d.iloc[a], d.iloc[b], label) for a, b in GroupKFold(5).split(d, groups=d.game_id)]
    return pd.concat(parts).loc[d.index]


def out_of_fold(d, label, fit, predict):
    out = np.zeros(len(d))
    for a, b in GroupKFold(5).split(d, groups=d.game_id):
        train, test = d.iloc[a], d.iloc[b]
        out[b] = predict(fit(encoded(train, label)), encode(train, test, label))
    return out


def variants(card_features, generic_features):
    return {'card': (card_features, False), 'mmr': (card_features, True), 'generic': (generic_features, False)}


def card_rate(label):
    return lambda train: train.groupby('card_id', observed=True)[label].mean()


def rate_of(rates, d, label):
    return d.card_id.map(rates).astype(float).fillna(0).to_numpy()


def top_features(model, features):
    return ', '.join(f for _, f in sorted(zip(model.feature_importance('gain'), features), reverse=True)[:8])


def pct(p):
    return f'{100 * p:.0f}%'


# Mulligan: is each opening-hand card kept?
m = categorize(load('mulligan'))
hand = ['copy', 'hand_inkable', 'hand_cost_le2', 'hand_cost_ge5']
print(f'mulligan: {m.game_id.nunique()} games, {len(m)} cards; accuracy on all cards and on games at 1400+ MMR')
for name, (features, weighted) in variants(CARD + DECK + hand + ['matchup_rate'], GENERIC_CARD + DECK + hand).items():
    fit = lambda train: lgb.LGBMClassifier(**PARAMS).fit(train[features], train.kept, sample_weight=train.weight if weighted else None)
    p = m[f'p_{name}'] = out_of_fold(m, 'kept', fit, lambda model, test: model.predict_proba(test[features])[:, 1])
    hit = (p > 0.5) == m.kept
    print(f'  {name:8} {hit.mean():.3f}  strong {hit[m.strong].mean():.3f}  AUC {roc_auc_score(m.kept, p):.3f}   top: {top_features(fit(encoded(m, "kept")).booster_, features)}')
prior = out_of_fold(m, 'kept', card_rate('kept'), lambda rates, test: rate_of(rates, test, 'kept'))
print(f'  baseline card keep-rate {((prior > 0.5) == m.kept).mean():.3f}   always keep {m.kept.mean():.3f}')

# Ink: one option per inkable card in hand plus "no ink", ranked within the decision. A softmax over
# the scores gives each option's chance once one temperature, fitted to the choices, stretches them:
# raw, a top pick shown at 25% was the choice 45% of the time.
ink = load('ink')
first = ink.groupby('decision_id', as_index=False).first()
passes = first.assign(card_id=NO_INK, card_name=NO_INK, inked=first.no_ink, **{c: np.nan for c in NOT_A_CARD})
ink = categorize(pd.concat([ink.assign(pass_option=0), passes.assign(pass_option=1)]).sort_values('decision_id', kind='stable'))
state = ['pass_option', 'opp_items', 'opp_actions', 'opp_characters', 'opp_shared', 'turn', 'my_turn', 'ink', 'my_lore', 'opp_lore', 'hand_size', 'hand_inkable', 'cost_gap']
sizes = lambda d: d.groupby('decision_id', sort=True).size().to_numpy()
ink['tie'] = np.random.default_rng(0).random(len(ink))
chosen = ink[ink.inked == 1].set_index('decision_id')
strong = chosen.strong


def softmax(score, t, groups):
    z = pd.Series(t * score)
    e = np.exp(z - z.groupby(groups).transform('max'))
    return e / e.groupby(groups).transform('sum')


def fitted_chances(score, groups, chosen):
    # One temperature, fitted to the choices, turns ranker scores into each option's chance.
    t = minimize_scalar(lambda t: -np.log(softmax(score, t, groups)[chosen]).sum(), bounds=(0.1, 100), method='bounded').x
    return softmax(score, t, groups)


def picks(by):
    return ink.sort_values([by, 'tie'], ascending=False).groupby('decision_id').head(1).set_index('decision_id')


print(f'ink: {len(chosen)} decisions, {chosen.no_ink.mean():.0%} with no ink, {ink.groupby("decision_id").size().mean():.1f} options each; '
      'picked the choice on all decisions and on games at 1400+ MMR')
for name, (features, weighted) in variants(CARD + DECK + state + ['matchup_rate'], GENERIC_CARD + DECK + state).items():
    fit = lambda train: lgb.LGBMRanker(objective='rank_xendcg', **PARAMS).fit(
        train[features], train.inked, group=sizes(train), sample_weight=train.weight if weighted else None)
    score = out_of_fold(ink, 'inked', fit, lambda model, test: model.predict(test[features]))
    ink[f'p_{name}'] = fitted_chances(score, ink.decision_id, ink.inked == 1)
    hit = picks(f'p_{name}').card_id.reindex(chosen.index) == chosen.card_id
    print(f'  {name:8} {hit.mean():.3f}  strong {hit[strong].mean():.3f}   top: {top_features(fit(encoded(ink, "inked")).booster_, features)}')
ink['prior'] = out_of_fold(ink, 'inked', card_rate('inked'), lambda rates, test: rate_of(rates, test, 'inked'))
print(f'  baseline card ink-rate {picks("prior").inked.mean():.3f}   random {(1 / ink.groupby("decision_id").size()).mean():.3f}')

# Board: at each quest, challenge and end of turn, one option per legal choice (quest with a ready character,
# challenge a legal target, end the turn), ranked within the decision. Rows are both players' turns where the
# rebuilt board agrees with the log (src/lib/boardState.js); the opponents are an MMR-matched population, so
# both train the models and only the team's own choices are flagged. No mmr model here: card and generic only.
ch = pd.read_csv('decisions/choices.csv')
ch = ch[(ch.started_at >= args.since) & (ch.groupby('decision_id').option.transform('size') > 1)]
ch = ch.assign(lore_lead=ch.my_lore - ch.opp_lore, board_lead=ch.my_board_cost - ch.opp_board_cost)
for c in ('option', 'a_card_id', 't_card_id', 'my_colors', 'opp_colors'):
    ch[c] = ch[c].astype('category')
ch = ch.sort_values('decision_id', kind='stable').reset_index(drop=True)
STATE = ['my_turn', 'went_first', 'my_lore', 'opp_lore', 'lore_lead', 'my_chars', 'opp_chars', 'my_board_cost', 'opp_board_cost', 'board_lead',
         'my_board_lore', 'opp_board_lore', 'n_ready', 'n_exerted_opp', 'my_colors', 'opp_colors']
OPTION = ['option', 'a_str', 'a_wp', 'a_lore', 'a_cost', 'a_damage', 't_str', 't_wp', 't_lore', 't_cost', 't_damage', 't_location', 'kills', 'survives']
BOARD_MODELS = {'card': OPTION + ['a_card_id', 't_card_id'] + STATE, 'generic': OPTION + STATE}
board_chosen = ch[ch.chosen == 1].set_index('decision_id')
team = board_chosen.is_me == 1
print(f'board: {len(board_chosen)} decisions ({team.sum()} the team\'s), {ch.groupby("decision_id").size().mean():.1f} options each; '
      'picked the choice, and the right kind (quest / challenge / end), on all decisions and on the team\'s')
for name, features in BOARD_MODELS.items():
    def predict_fold(a, b, features=features):
        train, test = ch.iloc[a], ch.iloc[b]
        model = lgb.LGBMRanker(objective='rank_xendcg', **PARAMS).fit(train[features], train.chosen, group=train.groupby('decision_id', sort=True).size().to_numpy())
        return model.predict(test[features])
    score = np.zeros(len(ch))
    for a, b in GroupKFold(5).split(ch, groups=ch.game_id):
        score[b] = predict_fold(a, b)
    ch[f'p_{name}'] = fitted_chances(score, ch.decision_id, ch.chosen == 1)
    top = ch.sort_values([f'p_{name}'], ascending=False).groupby('decision_id').head(1).set_index('decision_id').reindex(board_chosen.index)
    same = lambda c: top[c].astype(object).fillna('') == board_chosen[c].astype(object).fillna('')
    exact = same('option') & same('a_card_id') & same('t_card_id')
    kind = top.option == board_chosen.option
    print(f'  {name:8} {exact.mean():.3f} kind {kind.mean():.3f}   team {exact[team].mean():.3f} kind {kind[team].mean():.3f}')
quest_best = ch.assign(r=np.where(ch.option == 'quest', ch.a_lore, np.where(ch.option == 'end', -1, -2))).sort_values('r', ascending=False).groupby('decision_id').head(1).set_index('decision_id').reindex(board_chosen.index)
print(f'  baseline quest the most lore, else end {(quest_best.option == board_chosen.option).mean():.3f} kind   random {(1 / ch.groupby("decision_id").size()).mean():.3f}')

# Flags: choices any model gave under --flag chance, with every option and its chance per model.
NAMES = ['card', 'mmr', 'generic']
chances = lambda d: d[[f'p_{n}' for n in NAMES]].apply(lambda r: '/'.join(f'{100 * v:.0f}' for v in r), axis=1) + '%'
hand_key = m.account + ':' + m.game_id
hands = m.assign(opt=m.card_name + ' ' + np.where(m.kept == 1, 'kept', 'sent') + ' (keep ' + chances(m) + ')').groupby(hand_key).opt.agg(', '.join)
mull = m.assign(kind='mulligan', turn=0, choice=np.where(m.kept == 1, 'kept ', 'sent ') + m.card_name, options=hand_key.map(hands),
                **{f'pick_{n}': np.where(m[f'p_{n}'] > 0.5, 'keep ', 'send ') + m.card_name for n in NAMES},
                **{f'p_{n}': np.where(m.kept == 1, m[f'p_{n}'], 1 - m[f'p_{n}']) for n in NAMES})
opts = ink.sort_values('p_card', ascending=False).assign(opt=lambda d: d.card_name + ' ' + chances(d)).groupby('decision_id').opt.agg(', '.join)
inks = ink[ink.inked == 1].assign(kind='ink', choice=lambda d: d.card_name, options=lambda d: d.decision_id.map(opts),
                                   **{f'pick_{n}': lambda d, n=n: d.decision_id.map(picks(f'p_{n}').card_name) for n in NAMES})
BOARD_NAMES = list(BOARD_MODELS)
describe = lambda d: np.where(d.option == 'quest', 'quest ' + d.a_name.astype(str), np.where(d.option == 'end', 'end turn', 'challenge ' + d.t_name.astype(str) + ' with ' + d.a_name.astype(str)))
ch['desc'] = describe(ch)
board_opts = ch.sort_values('p_card', ascending=False).assign(opt=lambda d: d.desc + ' ' + d[[f'p_{n}' for n in BOARD_NAMES]].apply(lambda r: '/'.join(f'{100 * v:.0f}' for v in r), axis=1) + '%').groupby('decision_id').opt.agg(', '.join)
board_pick = {n: ch.sort_values(f'p_{n}', ascending=False).groupby('decision_id').head(1).set_index('decision_id').desc for n in BOARD_NAMES}
# The order of actions within a turn is often arbitrary: a choice is not flagged when the model's pick was also
# taken that turn.
turn_key = lambda d: d.account + ':' + d.game_id + ':' + d.turn.astype(str)
taken = ch[(ch.chosen == 1) & (ch.is_me == 1)].assign(k=lambda d: turn_key(d) + ':' + d.desc).k
boards = ch[(ch.chosen == 1) & (ch.is_me == 1)].assign(kind='board', choice=lambda d: d.desc, options=lambda d: d.decision_id.map(board_opts), p_mmr=np.nan,
                                                       pick_mmr='', **{f'pick_{n}': lambda d, n=n: d.decision_id.map(board_pick[n]) for n in BOARD_NAMES})
# A clean kill left on the table: the turn ended while a challenge that banishes its target and survives was legal.
clean = ch[(ch.option == 'challenge') & (ch.kills == 1) & (ch.survives == 1) & (ch.t_location == 0)].groupby('decision_id').desc.first()
left = boards[(boards.option == 'end') & boards.decision_id.isin(clean.index)]
print(f'clean kill left at end of turn: {len(left)} of the team\'s {(boards.option == "end").sum()} turn ends')
flags = pd.concat([mull, inks, boards]).reset_index(drop=True)
low = flags[[f'p_{n}' for n in NAMES]] < args.flag
flags['flagged_by'] = low.apply(lambda r: '+'.join(n for n in NAMES if r[f'p_{n}']), axis=1)
flags.loc[flags.decision_id.isin(left.decision_id) & (flags.kind == 'board'), 'flagged_by'] = 'clean kill left'
reordered = (flags.kind == 'board') & (turn_key(flags) + ':' + flags.pick_card.astype(str)).isin(taken) & (turn_key(flags) + ':' + flags.pick_generic.astype(str)).isin(taken)
flagged = (low.any(axis=1) & ~reordered) | (flags.flagged_by == 'clean kill left')
print(f'board flags dropped because the models\' pick was taken later that turn: {(low.any(axis=1) & reordered).sum()}')
cols = CONTEXT + ['kind', 'turn', 'choice', 'flagged_by'] + [f'p_{n}' for n in NAMES] + [f'pick_{n}' for n in NAMES] + ['options']
flags = flags[flagged][cols].sort_values(['account', 'started_at', 'turn'])
flags.to_csv('decisions/flags.csv', index=False, float_format='%.3f')
print(f'flags under {pct(args.flag)}: {len(flags)} in decisions/flags.csv (chances in options are card/mmr/generic; card/generic for board), by model:')
print(flags.groupby(['flagged_by', 'kind']).size().unstack(fill_value=0).sort_values('ink', ascending=False).to_string())
