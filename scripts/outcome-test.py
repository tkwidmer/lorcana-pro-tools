#!/usr/bin/env python3
# Do the team's ink and mulligan choices predict winning, beyond the spot they were made in?
#   python3 scripts/outcome-test.py [--since 2026-10-08]      (after scripts/decision-rows.mjs)
# The imitation models in train-decision-models.py learn what the team does. This asks whether what
# the team does changes who wins: a win model that sees the state at the decision (turn, ink, lore,
# the whole hand's costs, deck shape, colors, opponent's shown cards, both MMRs) is compared, out of
# fold by game, with the same model plus the chosen option, and with the same model plus a random
# option from the same decision (the placebo: the cost of adding the columns at all). Only a gain of
# choice over random whose 95% interval, resampled by game, stays above zero says the choice matters.
# It cannot rule out what the state leaves out (the board), so even a real gain is a correlation.
import argparse
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.model_selection import GroupKFold
from decision_data import DECK, NOT_A_CARD, categorize, ink_options, load

ap = argparse.ArgumentParser()
ap.add_argument('--since', default='')
args = ap.parse_args()

PARAMS = dict(n_estimators=400, learning_rate=0.02, num_leaves=15, min_child_samples=50, verbose=-1)
SKILL = ['mmr', 'opp_mmr']
rng = np.random.default_rng(0)


def out_of_fold(d, features):
    p = np.zeros(len(d))
    for a, b in GroupKFold(5).split(d, groups=d.game_id):
        p[b] = lgb.LGBMClassifier(**PARAMS).fit(d.iloc[a][features], d.won.iloc[a]).predict_proba(d.iloc[b][features])[:, 1]
    return p


def loss(d, p):
    y = d.won.to_numpy()
    return -(y * np.log(np.clip(p, 1e-6, 1)) + (1 - y) * np.log(np.clip(1 - p, 1e-6, 1)))


def gain(d, worse, better, n=1000):
    # Mean log-loss gain per row of `better` over `worse` (x 1e-4), with a 95% interval resampled by game.
    per_game = pd.Series(worse - better).groupby(d.game_id.to_numpy()).agg(['sum', 'count']).to_numpy()
    draws = [per_game[i].sum(0) for i in rng.integers(0, len(per_game), (n, len(per_game)))]
    lo, hi = np.percentile([s / c for s, c in draws], [2.5, 97.5])
    est = per_game[:, 0].sum() / per_game[:, 1].sum()
    return f'{1e4 * est:+.1f} (95% {1e4 * lo:+.1f} to {1e4 * hi:+.1f}){"  significant" if lo > 0 else ""}'


def test(name, chosen, placebo, state, choice, draws=5):
    # placebo() returns `chosen` with a random option in place of the chosen one. Its loss is averaged
    # over `draws` draws: one draw alone swung the mulligan verdict between seeds.
    by_state, by_choice = loss(chosen, out_of_fold(chosen, state)), loss(chosen, out_of_fold(chosen, state + choice))
    by_random = np.mean([loss(chosen, out_of_fold(placebo(), state + choice)) for _ in range(draws)], axis=0)
    print(f'{name}: {len(chosen)} decisions in {chosen.game_id.nunique()} games, log-loss gain x 1e-4')
    print(f'  choice over state   {gain(chosen, by_state, by_choice)}')
    print(f'  random over state   {gain(chosen, by_state, by_random)}   (the placebo, {draws} draws)')
    print(f'  choice over random  {gain(chosen, by_random, by_choice)}')


# Ink: the inked card (or "no ink") against a random option of the same decision.
ink = ink_options(args.since)
chosen = ink[ink.inked == 1].set_index('decision_id')
placebo = lambda: (ink.assign(r=rng.random(len(ink))).sort_values('r').groupby('decision_id').head(1).set_index('decision_id')
                   .loc[chosen.index].assign(won=chosen.won).reset_index())
state = ['turn', 'my_turn', 'ink', 'my_lore', 'opp_lore', 'hand_size', 'hand_inkable', 'hand_cost_mean', 'hand_cost_le2', 'hand_cost_ge5',
         'went_first', 'my_colors', 'opp_colors', 'opp_items', 'opp_actions', 'opp_characters', 'opp_shared', 'opp_items_recent'] + DECK + SKILL
test('ink', chosen.reset_index(), placebo, state, ['pass_option'] + NOT_A_CARD)

# Mulligan: the kept part of the opening seven against a random keep of the same size.
m = categorize(load('mulligan', args.since))
game = ['account', 'game_id']
kinds = {'cost_le2': m.cost <= 2, 'cost_ge5': m.cost >= 5, 'inkable': m.inkable == 1, 'character': m.type == 'Character',
         'removal': (m.removes_character == 1) | (m.removes_item == 1) | (m.board_wipe == 1)}
kept_count = m.groupby(game, observed=True).kept.transform('sum')


def kept_hand(keep):
    return pd.DataFrame({f'kept_{k}': keep * v for k, v in kinds.items()}).groupby([m.account, m.game_id], observed=True).sum()


hands = m.groupby(game, observed=True).agg(
    kept=('kept', 'sum'), won=('won', 'first'), went_first=('went_first', 'first'), my_colors=('my_colors', 'first'), opp_colors=('opp_colors', 'first'),
    hand_cost_le2=('hand_cost_le2', 'first'), hand_cost_ge5=('hand_cost_ge5', 'first'), hand_inkable=('hand_inkable', 'first'),
    **{c: (c, 'first') for c in DECK + SKILL}).reset_index()
kept = list(kept_hand(m.kept).columns)
random_keep = lambda: (m.assign(r=rng.random(len(m))).groupby(game, observed=True).r.rank() <= kept_count).astype(int)
state = ['hand_cost_le2', 'hand_cost_ge5', 'hand_inkable', 'went_first', 'my_colors', 'opp_colors'] + DECK + SKILL
test('mulligan', hands.join(kept_hand(m.kept), on=game), lambda: hands.join(kept_hand(random_keep()), on=game), state, ['kept'] + kept)
