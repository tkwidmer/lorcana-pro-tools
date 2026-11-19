#!/usr/bin/env python3
# What decides a game, and when? A win-probability model over the board, turn by turn.
#   python3 scripts/win-probability.py [--since 2026-10-08]      (after scripts/decision-rows.mjs)
# Each trusted turn of either player (decisions/choices.csv) gives one snapshot: the state at the mover's
# first quest / challenge / end-turn choice, so this turn's plays are on the board. Win models with more
# and more of that state (before the game: colors, play/draw, both MMRs; then lore; then the board) are
# scored out of fold by game, turn by turn. The gap between them says what carries the result and from
# when. Writes decisions/winprob.csv: every snapshot's win chance from the full model, for scoring the
# decisions between snapshots later.
import argparse
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold

ap = argparse.ArgumentParser()
ap.add_argument('--since', default='')
args = ap.parse_args()

PARAMS = dict(n_estimators=400, learning_rate=0.03, num_leaves=31, min_child_samples=100, verbose=-1)
MAX_TURN = 12  # the last row of the table holds turn 12 and later

ch = pd.read_csv('decisions/choices.csv')
ch = ch[ch.started_at >= args.since]
s = ch.drop_duplicates(['account', 'game_id', 'is_me', 'turn']).copy()  # the first choice of each turn
# Both players' MMR on every snapshot: each game's two sides, keyed by is_me.
mmr = s.groupby(['account', 'game_id', 'is_me']).mmr.first().unstack()
s = s.join(mmr.rename(columns={0: 'opp_side_mmr', 1: 'me_side_mmr'}), on=['account', 'game_id'])
s['opp_mmr'] = np.where(s.is_me == 1, s.opp_side_mmr, s.me_side_mmr)
for c in ['my_colors', 'opp_colors']:
    s[c] = s[c].astype('category')
s = s.assign(lore_diff=s.my_lore - s.opp_lore, chars_diff=s.my_chars - s.opp_chars, board_cost_diff=s.my_board_cost - s.opp_board_cost,
             board_lore_diff=s.my_board_lore - s.opp_board_lore, mmr_diff=s.mmr - s.opp_mmr).reset_index(drop=True)

PRE = ['my_colors', 'opp_colors', 'went_first', 'mmr', 'opp_mmr', 'mmr_diff']
LORE = ['turn', 'my_lore', 'opp_lore', 'lore_diff']
BOARD = ['my_chars', 'opp_chars', 'chars_diff', 'my_board_cost', 'opp_board_cost', 'board_cost_diff',
         'my_board_lore', 'opp_board_lore', 'board_lore_diff', 'n_ready', 'n_exerted_opp']
SETS = {'before the game': PRE, '+ lore': PRE + LORE, '+ board, no lore': PRE + ['turn'] + BOARD, 'everything': PRE + LORE + BOARD}


def out_of_fold(features):
    p = np.zeros(len(s))
    for a, b in GroupKFold(5).split(s, groups=s.game_id):
        p[b] = lgb.LGBMClassifier(**PARAMS).fit(s.iloc[a][features], s.won.iloc[a]).predict_proba(s.iloc[b][features])[:, 1]
    return p


def log_loss(y, p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return -(y * np.log(p) + (1 - y) * np.log(1 - p)).mean()


preds = {name: out_of_fold(f) for name, f in SETS.items()}
bucket = s.turn.clip(upper=MAX_TURN)
print(f'{len(s)} snapshots (both players\' trusted turns) in {s.game_id.nunique()} games; win chance out of fold by game')
print('AUC by the mover\'s turn (0.5 is a coin, 1.0 is certain); "sure" is the share of snapshots at 80%+ either way, "right" how often those were right')
rows = []
for t in sorted(bucket.unique()):
    i = (bucket == t).to_numpy()
    y, p = s.won[i].to_numpy(), preds['everything'][i]
    sure = (p >= .8) | (p <= .2)
    rows.append({'turn': f'{t}+' if t == MAX_TURN else t, 'snapshots': i.sum(), **{n: roc_auc_score(y, preds[n][i]) for n in SETS},
                 'sure': sure.mean(), 'right': ((p[sure] >= .5) == y[sure]).mean() if sure.any() else np.nan})
print(pd.DataFrame(rows).to_string(index=False, float_format=lambda x: f'{x:.3f}'))
y = s.won.to_numpy()
print('all turns:  ' + '   '.join(f'{n} AUC {roc_auc_score(y, p):.3f} log-loss {log_loss(y, p):.3f}' for n, p in preds.items()))

# Which state the full model leans on (gain, on all snapshots).
fit = lgb.LGBMClassifier(**PARAMS).fit(s[SETS['everything']], s.won)
gain = pd.Series(fit.booster_.feature_importance('gain'), index=SETS['everything'])
print('importance (share of gain): ' + ', '.join(f'{k} {v:.0%}' for k, v in (gain / gain.sum()).sort_values(ascending=False).head(10).items()))

s.assign(wp=preds['everything'])[['account', 'game_id', 'started_at', 'is_me', 'turn', 'won', 'wp']].to_csv('decisions/winprob.csv', index=False)
print('wrote decisions/winprob.csv')
