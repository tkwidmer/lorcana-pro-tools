#!/usr/bin/env python3
# Baseline mulligan and ink models on the rows from scripts/decision-rows.mjs, and the choices they
# flag for coaching.
#   pip install lightgbm pandas scikit-learn
#   python3 scripts/train-decision-models.py [--since 2026-10-08] [--flag 0.1]
# Every decision is scored by a model that never saw its game (5 folds split by game), so the scores
# say how the team's other games would have played that spot. Prints each model next to simple
# baselines and writes decisions/flags.csv (each choice the model gave under --flag chance).
# A flag is a departure from how the team usually plays, not a proven mistake: check it in the replay.
import argparse
import lightgbm as lgb
import numpy as np
import pandas as pd
from scipy.optimize import minimize_scalar
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold

ap = argparse.ArgumentParser()
ap.add_argument('--since', default='2026-10-08')
ap.add_argument('--flag', type=float, default=0.1)
args = ap.parse_args()

NO_INK = 'no ink'
CATEGORICAL = ['card_id', 'type', 'my_colors', 'opp_colors']
CONTEXT = ['account', 'game_id', 'started_at', 'my_colors', 'opp_colors', 'went_first']
CARD = ['card_id', 'copies', 'cost', 'inkable', 'type', 'strength', 'willpower', 'card_lore', 'shift', 'went_first', 'my_colors', 'opp_colors']
DECK = ['deck_inkable', 'deck_avg_cost', 'deck_cost_ge5', 'deck_items', 'deck_actions']
PARAMS = dict(n_estimators=300, learning_rate=0.03, num_leaves=15, min_child_samples=20, verbose=-1)


def load(name):
    d = pd.read_csv(f'decisions/{name}.csv')
    return d[d.started_at >= args.since]


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


def with_matchup_rate(d, label):
    # Each row's rate comes from the other games only, so a choice never explains itself.
    out = np.zeros(len(d))
    for a, b in GroupKFold(5).split(d, groups=d.game_id):
        out[b] = matchup_rate(d.iloc[a], d.iloc[b], label)
    return d.assign(matchup_rate=out)


def out_of_fold(d, label, fit, predict):
    out = np.zeros(len(d))
    for a, b in GroupKFold(5).split(d, groups=d.game_id):
        train, test = d.iloc[a], d.iloc[b]
        out[b] = predict(fit(with_matchup_rate(train, label)), test.assign(matchup_rate=matchup_rate(train, test, label)))
    return out


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
features = CARD + DECK + ['copy', 'matchup_rate', 'hand_inkable', 'hand_cost_le2', 'hand_cost_ge5']
fit = lambda train: lgb.LGBMClassifier(**PARAMS).fit(train[features], train.kept)
m['p_keep'] = out_of_fold(m, 'kept', fit, lambda model, test: model.predict_proba(test[features])[:, 1])
prior = out_of_fold(m, 'kept', card_rate('kept'), lambda rates, test: rate_of(rates, test, 'kept'))
print(f'mulligan: {m.game_id.nunique()} games, {len(m)} cards')
print(f'  accuracy  model {((m.p_keep > 0.5) == m.kept).mean():.3f}   card keep-rate {((prior > 0.5) == m.kept).mean():.3f}   always keep {m.kept.mean():.3f}')
print(f'  AUC       model {roc_auc_score(m.kept, m.p_keep):.3f}   card keep-rate {roc_auc_score(m.kept, prior):.3f}')
print(f'  top features: {top_features(fit(with_matchup_rate(m, "kept")).booster_, features)}')

# Ink: one option per inkable card in hand plus "no ink", ranked within the decision. A softmax over
# the scores gives each option's chance once one temperature, fitted to the choices, stretches them:
# raw, a top pick shown at 25% was the choice 45% of the time.
ink = load('ink')
first = ink.groupby('decision_id', as_index=False).first()
passes = first.assign(card_id=NO_INK, card_name=NO_INK, inked=first.no_ink, copies=np.nan, cost=np.nan, inkable=np.nan,
                      type=np.nan, strength=np.nan, willpower=np.nan, card_lore=np.nan, shift=np.nan, cost_gap=np.nan)
ink = categorize(pd.concat([ink.assign(pass_option=0), passes.assign(pass_option=1)]).sort_values('decision_id', kind='stable'))
features = CARD + DECK + ['pass_option', 'matchup_rate', 'opp_items', 'opp_actions', 'opp_characters', 'opp_shared', 'turn', 'my_turn', 'ink', 'my_lore', 'opp_lore', 'hand_size', 'hand_inkable', 'cost_gap']
sizes = lambda d: d.groupby('decision_id', sort=True).size().to_numpy()
fit = lambda train: lgb.LGBMRanker(objective='rank_xendcg', **PARAMS).fit(train[features], train.inked, group=sizes(train))
score = out_of_fold(ink, 'inked', fit, lambda model, test: model.predict(test[features]))


def softmax(t):
    z = pd.Series(t * score)
    e = np.exp(z - z.groupby(ink.decision_id).transform('max'))
    return e / e.groupby(ink.decision_id).transform('sum')


temperature = minimize_scalar(lambda t: -np.log(softmax(t)[ink.inked == 1]).sum(), bounds=(0.1, 100), method='bounded').x
ink['p'] = softmax(temperature)
ink['prior'] = out_of_fold(ink, 'inked', card_rate('inked'), lambda rates, test: rate_of(rates, test, 'inked'))
ink['tie'] = np.random.default_rng(0).random(len(ink))


def picks(by):
    return ink.sort_values([by, 'tie'], ascending=False).groupby('decision_id').head(1).set_index('decision_id')


model_pick, chosen = picks('p'), ink[ink.inked == 1].set_index('decision_id')
hit = (model_pick.card_id == chosen.card_id.reindex(model_pick.index))
passed = chosen.no_ink.reindex(model_pick.index) == 1
print(f'ink: {len(model_pick)} decisions, {passed.mean():.0%} with no ink, {ink.groupby("decision_id").size().mean():.1f} options each')
print(f'  picked the choice  model {hit.mean():.3f} (inked {hit[~passed].mean():.3f}, no ink {hit[passed].mean():.3f})   '
      f'card ink-rate {picks("prior").inked.mean():.3f}   random {(1 / ink.groupby("decision_id").size()).mean():.3f}')
print(f'  top features: {top_features(fit(with_matchup_rate(ink, "inked")).booster_, features)}')

# Flags: choices the model gave under --flag chance, with every option it weighed.
hand = m.assign(opt=m.card_name + ' ' + np.where(m.kept == 1, 'kept', 'sent') + ' (keep ' + m.p_keep.map(pct) + ')').groupby('game_id').opt.agg(', '.join)
mull = m.assign(kind='mulligan', turn=0, choice=np.where(m.kept == 1, 'kept ', 'sent ') + m.card_name,
                model_pick=np.where(m.p_keep > 0.5, 'keep ', 'send ') + m.card_name,
                choice_p=np.where(m.kept == 1, m.p_keep, 1 - m.p_keep), options=m.game_id.map(hand))
opts = ink.sort_values('p', ascending=False).assign(opt=lambda d: d.card_name + ' ' + d.p.map(pct)).groupby('decision_id').opt.agg(', '.join)
inks = chosen.reset_index().assign(kind='ink', choice=lambda d: d.card_name, model_pick=lambda d: d.decision_id.map(model_pick.card_name),
                                   choice_p=lambda d: d.p, options=lambda d: d.decision_id.map(opts))
cols = CONTEXT + ['kind', 'turn', 'choice', 'model_pick', 'choice_p', 'options']
flags = pd.concat([mull[cols], inks[cols]])
flags = flags[flags.choice_p < args.flag].sort_values(['account', 'started_at', 'turn'])
flags.to_csv('decisions/flags.csv', index=False, float_format='%.3f')
games = m.groupby('account').game_id.nunique()
per = flags.groupby(['account', 'kind']).size().unstack(fill_value=0).reindex(games.index, fill_value=0)
print(f'flags under {pct(args.flag)}: {len(flags)} in decisions/flags.csv, per 10 games: '
      + ', '.join(f'{a} {10 * r.mulligan / games[a]:.1f} mulligan / {10 * r.ink / games[a]:.1f} ink' for a, r in per.iterrows()))
