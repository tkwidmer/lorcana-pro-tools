#!/usr/bin/env python3
# Which quest / challenge / end-turn choices cost win chance? Scores every option of every board decision.
#   python3 scripts/decision-value.py [--since 2026-10-08]      (after scripts/decision-rows.mjs)
# A win model is fitted to the state at every decision of both players (decisions/choices.csv), out of
# fold by game. Each option's state after it is built from its printed stats: a quest adds the
# character's lore and exerts it; a challenge exerts the attacker and removes whichever character it
# banishes; ending the turn changes nothing. An option's value is the win chance of that state, and a
# decision's regret is the best option's value minus the chosen one's.
# Two checks come first: how often the built state matches the next logged decision, and whether the
# chosen option's value predicts winning beyond the state, against a random option's (the placebo).
# Without the second, regret is the model's opinion, not a cost. Writes decisions/decision-value.csv (the team's decisions).
import argparse
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.model_selection import GroupKFold
from decision_data import gain, log_loss

ap = argparse.ArgumentParser()
ap.add_argument('--since', default='')
args = ap.parse_args()

PARAMS = dict(n_estimators=400, learning_rate=0.03, num_leaves=31, min_child_samples=100, verbose=-1)
STATE = ['turn', 'my_lore', 'opp_lore', 'my_chars', 'opp_chars', 'my_board_cost', 'opp_board_cost',
         'my_board_lore', 'opp_board_lore', 'n_ready', 'n_exerted_opp']
PRE = ['my_colors', 'opp_colors', 'went_first', 'mmr', 'opp_mmr']
DIFFS = {'lore_diff': ('my_lore', 'opp_lore'), 'chars_diff': ('my_chars', 'opp_chars'),
         'board_cost_diff': ('my_board_cost', 'opp_board_cost'), 'board_lore_diff': ('my_board_lore', 'opp_board_lore')}
FEATURES = PRE + STATE + list(DIFFS) + ['mmr_diff']

ch = pd.read_csv('decisions/choices.csv')
ch = ch[ch.started_at >= args.since].reset_index(drop=True)
mmr = ch.drop_duplicates(['account', 'game_id', 'is_me']).set_index(['account', 'game_id', 'is_me']).mmr.unstack()
ch = ch.join(mmr.rename(columns={0: 'opp_side_mmr', 1: 'me_side_mmr'}), on=['account', 'game_id'])
ch['opp_mmr'] = np.where(ch.is_me == 1, ch.opp_side_mmr, ch.me_side_mmr)
for c in ['my_colors', 'opp_colors']:
    ch[c] = ch[c].astype('category')
ch['seq'] = ch.decision_id.str.rsplit(':', n=1).str[1].astype(int)


def with_diffs(d):
    return d.assign(**{k: d[a] - d[b] for k, (a, b) in DIFFS.items()}, mmr_diff=d.mmr - d.opp_mmr)


def after(o):
    # The state after each option, from printed stats.
    o = o.copy()
    q, c = o.option == 'quest', o.option == 'challenge'
    o.loc[q, 'my_lore'] += o.a_lore[q]
    o.loc[q | c, 'n_ready'] -= 1
    k = c & (o.kills == 1) & (o.t_location != 1)
    o.loc[k, 'opp_chars'] -= 1
    o.loc[k, 'opp_board_cost'] -= o.t_cost[k]
    o.loc[k, 'opp_board_lore'] -= o.t_lore[k]
    o.loc[k, 'n_exerted_opp'] -= 1
    dies = c & (o.survives == 0)
    o.loc[dies, 'my_chars'] -= 1
    o.loc[dies, 'my_board_cost'] -= o.a_cost[dies]
    o.loc[dies, 'my_board_lore'] -= o.a_lore[dies]
    return with_diffs(o)


states = with_diffs(ch[ch.chosen == 1]).reset_index(drop=True)  # one row per decision: its state and choice
value, wp_now = np.zeros(len(ch)), np.zeros(len(states))
for a, b in GroupKFold(5).split(states, groups=states.game_id):
    model = lgb.LGBMClassifier(**PARAMS).fit(states.iloc[a][FEATURES], states.won.iloc[a])
    wp_now[b] = model.predict_proba(states.iloc[b][FEATURES])[:, 1]
    rows = ch.game_id.isin(set(states.game_id.iloc[b])).to_numpy()
    value[rows] = model.predict_proba(after(ch[rows])[FEATURES])[:, 1]
ch['value'] = value
states['wp'] = wp_now

# Check 1: the built state after a chosen quest or challenge against the next decision of the same turn.
nxt = states.groupby(['account', 'game_id', 'is_me', 'turn']).shift(-1)
built = after(ch[ch.chosen == 1].reset_index(drop=True))
has = (states.option != 'end') & nxt.seq.notna()
print(f'{len(states)} decisions in {states.game_id.nunique()} games; win model out of fold by game')
print(f'check 1, the built state after a quest or challenge vs the next decision that turn ({has.sum()} decisions):')
print('  ' + ', '.join(f'{f} {(built[f][has] == nxt[f][has]).mean():.0%}' for f in STATE[1:]))
gap = (built.loc[has, 'my_chars'] != nxt.loc[has, 'my_chars']) | (built.loc[has, 'opp_chars'] != nxt.loc[has, 'opp_chars'])
print(f'  every field matches: {(built.loc[has, STATE[1:]] == nxt.loc[has, STATE[1:]]).all(axis=1).mean():.0%}; '
      f'character counts differ (a card played or an effect between choices): {gap.mean():.0%}')

# Regret per decision.
best = ch.groupby('decision_id').value.max()
chosen = ch[ch.chosen == 1].set_index('decision_id')
pick = ch.loc[ch.groupby('decision_id').value.idxmax()].set_index('decision_id')
states = states.set_index('decision_id').assign(chosen_value=chosen.value, best_value=best, best_option=pick.option,
                                                regret=best - chosen.value, n_options=ch.groupby('decision_id').size()).reset_index()

# Check 2: does the model's value of the chosen option predict winning, beyond the state at the decision?
# As in outcome-test.py: a win model on the state, the same plus the chosen option's value and its gap to the
# best option, and the same plus those of a random option of the decision (the placebo), out of fold by game.
# A game's summed regret is no test: it grows with the number of options, so it tracks the game's length.
def out_of_fold(d, features):
    p = np.zeros(len(d))
    for a, b in GroupKFold(5).split(d, groups=d.game_id):
        p[b] = lgb.LGBMClassifier(**PARAMS).fit(d.iloc[a][features], d.won.iloc[a]).predict_proba(d.iloc[b][features])[:, 1]
    return p


def with_option(o):
    o = o.set_index('decision_id').loc[states.decision_id]
    return states[FEATURES + ['won', 'game_id']].assign(opt_value=o.value.to_numpy(), opt_gap=(o.value - o.index.map(best)).to_numpy())


rng = np.random.default_rng(0)
OPT = FEATURES + ['opt_value', 'opt_gap']
by_choice = with_option(ch[ch.chosen == 1])
y = states.won.to_numpy()
by_state = log_loss(y, out_of_fold(by_choice, FEATURES))
by_chosen = log_loss(y, out_of_fold(by_choice, OPT))
by_random = np.mean([log_loss(y, out_of_fold(with_option(ch.assign(r=rng.random(len(ch))).sort_values('r').groupby('decision_id').head(1)), OPT))
                     for _ in range(5)], axis=0)
print('check 2, the chosen option\'s value against winning, log-loss gain per decision x 1e-4:')
print(f'  choice over state   {gain(states.game_id, by_state, by_chosen, rng)}')
print(f'  random over state   {gain(states.game_id, by_state, by_random, rng)}   (the placebo, 5 draws)')
print(f'  choice over random  {gain(states.game_id, by_random, by_chosen, rng)}')

# Where the team's regret is: chosen kind vs the model's best kind.
team = states[states.is_me == 1]
print(f'the team\'s {len(team)} decisions: mean regret {team.regret.mean():.3f}; model\'s pick taken {(team.regret < 1e-9).mean():.0%}')
t = team.assign(cost=team.regret).groupby(['option', 'best_option']).agg(decisions=('cost', 'size'), mean_regret=('cost', 'mean'), total=('cost', 'sum'))
t['share_of_regret'] = t.total / t.total.sum()
print(t.drop(columns='total').sort_values('share_of_regret', ascending=False).to_string(float_format=lambda x: f'{x:.3f}'))

team[['account', 'game_id', 'started_at', 'decision_id', 'turn', 'my_colors', 'opp_colors', 'won', 'wp', 'option', 'a_name', 't_name',
      'chosen_value', 'best_option', 'best_value', 'regret']].to_csv('decisions/decision-value.csv', index=False)
print('wrote decisions/decision-value.csv')
