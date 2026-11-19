#!/usr/bin/env python3
# Does leaving a clean kill on the table cost games? A matched comparison.
#   python3 scripts/clean-kills.py [--since 2026-10-08]      (after scripts/decision-rows.mjs)
# A clean kill is a challenge that banishes a character and survives, by printed stats. Turns (either
# player's, trusted, from decisions/choices.csv) with one open at their first quest / challenge / end
# choice are split into "took" (a clean kill was challenged that turn) and "left" (none was, and the turn
# ended with one still open); turns where it went away some other way are set aside. Turns are matched
# on the state at that first choice, before anything was done, never on the state after: round, lore
# lead, board-cost lead, play/draw and the biggest clean kill's cost. The effect is the win-rate
# difference within matched groups, weighted to the "left" turns (what taking it would have done there),
# with a 95% interval resampled by game.
import argparse
import numpy as np
import pandas as pd

ap = argparse.ArgumentParser()
ap.add_argument('--since', default='')
args = ap.parse_args()
rng = np.random.default_rng(0)

ch = pd.read_csv('decisions/choices.csv')
ch = ch[ch.started_at >= args.since]
ch['seq'] = ch.decision_id.str.rsplit(':', n=1).str[1].astype(int)
ch['clean'] = (ch.option == 'challenge') & (ch.kills == 1) & (ch.survives == 1) & (ch.t_location != 1)
KEY = ['account', 'game_id', 'is_me', 'turn']

dec = ch[ch.chosen == 1].set_index('decision_id')[KEY + ['seq', 'option', 'clean', 'won', 'went_first', 'my_colors', 'opp_colors',
                                                         'my_lore', 'opp_lore', 'my_board_cost', 'opp_board_cost']]
dec = dec.rename(columns={'clean': 'took'}).assign(open=ch.groupby('decision_id').clean.any(),
                                                    kill_cost=ch[ch.clean].groupby('decision_id').t_cost.max())
turns = dec.sort_values('seq').groupby(KEY).agg(
    first_open=('open', 'first'), took=('took', 'any'), last_open=('open', 'last'), last_option=('option', 'last'),
    **{c: (c, 'first') for c in ['won', 'went_first', 'my_colors', 'opp_colors', 'my_lore', 'opp_lore', 'my_board_cost', 'opp_board_cost', 'kill_cost']}).reset_index()
turns = turns[turns.first_open]
turns['group'] = np.select([turns.took, turns.last_open & (turns.last_option == 'end')], ['took', 'left'], 'other')
t = turns[turns.group != 'other'].copy()
t['left'] = (t.group == 'left').astype(int)
t['stratum'] = (pd.cut(t.turn, [0, 3, 5, 7, 99]).astype(str) + '|' + pd.cut(t.my_lore - t.opp_lore, [-99, -5, -1, 3, 99]).astype(str) + '|'
                + pd.cut(t.my_board_cost - t.opp_board_cost, [-99, -5, -1, 4, 99]).astype(str) + '|' + t.went_first.astype(str) + '|'
                + pd.cut(t.kill_cost, [0, 2, 4, 99]).astype(str))


def effect(d, extra=None, w=None):
    # Win rate of "took" minus "left" within each matched group, weighted by the group's "left" turns.
    # w weights each turn (the bootstrap's draw count of its game).
    s = d.stratum if extra is None else d.stratum + '|' + d[extra].astype(str)
    w = np.ones(len(d)) if w is None else w
    g = pd.DataFrame({'s': s.to_numpy(), 'left': d.left.to_numpy(), 'won': d.won.to_numpy() * w, 'w': w}).groupby(['s', 'left']).sum().unstack()
    g = g[(g['w'] > 0).all(axis=1)]
    n_left = g[('w', 1)]
    diff = g[('won', 0)] / g[('w', 0)] - g[('won', 1)] / g[('w', 1)]
    return (diff * n_left).sum() / n_left.sum(), n_left.sum() / w[d.left.to_numpy() == 1].sum()


def report(name, d, extra=None, n=500):
    est, matched = effect(d, extra)
    games, idx = np.unique(d.game_id, return_inverse=True)
    boot = [effect(d, extra, np.bincount(rng.integers(0, len(games), len(games)), minlength=len(games))[idx].astype(float))[0] for _ in range(n)]
    lo, hi = np.percentile(boot, [2.5, 97.5])
    took, left = d[d.left == 0], d[d.left == 1]
    print(f'{name}: {len(took)} took, {len(left)} left (won {took.won.mean():.0%} vs {left.won.mean():.0%} unmatched); '
          f'matched {matched:.0%} of "left": taking it {est:+.1%} win rate (95% {lo:+.1%} to {hi:+.1%})')


# What else could explain it. Each is matched on as well, or cut away.
mmr = ch.drop_duplicates(['account', 'game_id', 'is_me']).set_index(['account', 'game_id', 'is_me']).mmr.unstack()
t = t.join(mmr.rename(columns={0: 'opp_side', 1: 'me_side'}), on=['account', 'game_id'])
t['mmr_gap'] = pd.cut(np.where(t.is_me == 1, t.me_side - t.opp_side, t.opp_side - t.me_side), [-999, -100, -25, 25, 100, 999]).astype(str)
t['turns_after'] = t.groupby(['account', 'game_id', 'is_me']).turn.transform('max') - t.turn
wp = pd.read_csv('decisions/winprob.csv')[['account', 'game_id', 'is_me', 'turn', 'wp']]  # scripts/win-probability.py
t = t.merge(wp, on=['account', 'game_id', 'is_me', 'turn'], how='left')
t['wp_decile'] = pd.qcut(t.wp, 10, labels=False)

print('Clean kill open at the turn\'s first choice: took one that turn vs ended the turn with one still open')
report('both players', t)
report('the team', t[t.is_me == 1])
report('the team, each account against itself', t[t.is_me == 1], extra='account')
report('both players, matchup also matched', t, extra='my_colors')
report('both players, MMR gap also matched', t, extra='mmr_gap')
print(f'  win chance at the turn\'s start (win-probability.py): took {t[t.left == 0].wp.mean():.1%}, left {t[t.left == 1].wp.mean():.1%}; '
      f'within matched groups it expects {effect(t.assign(won=t.wp))[0]:+.1%}')
report('both players, win-chance decile also matched', t, extra='wp_decile')
report('both players, not the side\'s last two trusted turns (conceding)', t[t.turns_after >= 2])
for lo_, hi_, label in [(0, 2, 'biggest clean kill costs 1-2'), (2, 4, '3-4'), (4, 99, '5+')]:
    report(f'both players, {label}', t[(t.kill_cost > lo_) & (t.kill_cost <= hi_)])
for lo_, hi_, label in [(0, 3, 'rounds 1-3'), (3, 5, '4-5'), (5, 7, '6-7'), (7, 99, '8+')]:
    report(f'both players, {label}', t[(t.turn > lo_) & (t.turn <= hi_)])
