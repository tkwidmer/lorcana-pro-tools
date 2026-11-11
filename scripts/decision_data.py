# Loading shared by train-decision-models.py and outcome-test.py: the decision rows from
# scripts/decision-rows.mjs with MMR weights, recent opponent items and categorical columns.
import numpy as np
import pandas as pd

NO_INK = 'no ink'
CATEGORICAL = ['card_id', 'type', 'my_colors', 'opp_colors']
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


def load(name, since=''):
    d = pd.read_csv(f'decisions/{name}.csv')
    d = d[d.started_at >= since]
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


def ink_options(since=''):
    # Each ink decision's options: every inkable card in hand plus "no ink", grouped by decision_id.
    ink = load('ink', since)
    first = ink.groupby('decision_id', as_index=False).first()
    passes = first.assign(card_id=NO_INK, card_name=NO_INK, inked=first.no_ink, **{c: np.nan for c in NOT_A_CARD})
    return categorize(pd.concat([ink.assign(pass_option=0), passes.assign(pass_option=1)]).sort_values('decision_id', kind='stable'))
