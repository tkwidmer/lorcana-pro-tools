#!/usr/bin/env python3
# Baseline mulligan and ink models on the rows from scripts/decision-rows.mjs.
#   pip install lightgbm pandas scikit-learn
#   python3 scripts/train-decision-models.py [--since 2026-10-08]
# Trains on the earlier 80% of games since --since (default: set 14's release) and tests on the
# latest 20%, so the score is how well it predicts games it has not seen. Prints each model next to
# simple baselines and writes the models to decisions/{mulligan,ink}.lgb.txt.
import argparse
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score

ap = argparse.ArgumentParser()
ap.add_argument('--since', default='2026-10-08')
since = ap.parse_args().since

CATEGORICAL = ['card_id', 'type', 'my_colors', 'opp_colors']
GAME = ['went_first']
CARD = ['card_id', 'copies', 'cost', 'inkable', 'type', 'strength', 'willpower', 'card_lore', 'shift']


def load(name):
    d = pd.read_csv(f'decisions/{name}.csv')
    d = d[d.started_at >= since]
    for c in CATEGORICAL:
        d[c] = d[c].astype('category')
    cut = np.sort(d.started_at.unique())[int(0.8 * d.started_at.nunique())]
    return d[d.started_at < cut], d[d.started_at >= cut]


def importance(model, features):
    top = sorted(zip(model.feature_importance('gain'), features), reverse=True)[:8]
    return ', '.join(f for _, f in top)


# Mulligan: is each opening-hand card kept?
train, test = load('mulligan')
features = CARD + GAME + ['my_colors', 'opp_colors', 'hand_inkable', 'hand_cost_le2', 'hand_cost_ge5']
model = lgb.LGBMClassifier(n_estimators=300, learning_rate=0.03, num_leaves=15, min_child_samples=20, verbose=-1)
model.fit(train[features], train.kept)
p = model.predict_proba(test[features])[:, 1]
card_rate = train.groupby('card_id', observed=True).kept.mean()
prior = test.card_id.map(card_rate).astype(float).fillna(train.kept.mean())
print(f'mulligan: {train.game_id.nunique()} train games, {test.game_id.nunique()} test games, {len(test)} test cards')
print(f'  accuracy  model {((p > 0.5) == test.kept).mean():.3f}   card keep-rate {((prior > 0.5) == test.kept).mean():.3f}   always keep {test.kept.mean():.3f}')
print(f'  AUC       model {roc_auc_score(test.kept, p):.3f}   card keep-rate {roc_auc_score(test.kept, prior):.3f}')
print(f'  top features: {importance(model.booster_, features)}')
model.booster_.save_model('decisions/mulligan.lgb.txt')

# Ink: which card is inked, ranked among the inkable cards in hand. Turns with no ink are left out:
# the ranker only learns which card, not whether to ink.
train, test = (d[d.no_ink == 0].sort_values('decision_id') for d in load('ink'))
features = CARD + GAME + ['my_colors', 'opp_colors', 'turn', 'my_turn', 'ink', 'my_lore', 'opp_lore', 'hand_size', 'hand_inkable', 'cost_gap']
group = lambda d: d.groupby('decision_id', sort=True).size().to_numpy()
model = lgb.LGBMRanker(n_estimators=300, learning_rate=0.03, num_leaves=15, min_child_samples=20, verbose=-1)
model.fit(train[features], train.inked, group=group(train))
test = test.assign(score=model.predict(test[features]))
ink_rate = train.groupby('card_id', observed=True).inked.mean()
test['prior'] = test.card_id.map(ink_rate).astype(float).fillna(0)
test['tie'] = np.random.default_rng(0).random(len(test))


def top1(score):
    pick = test.sort_values([score, 'tie'], ascending=False).groupby('decision_id').head(1)
    return pick.inked.mean()


test['neg_cost'] = -test.cost.fillna(99)
print(f'ink: {train.decision_id.nunique()} train decisions, {test.decision_id.nunique()} test decisions, {test.groupby("decision_id").size().mean():.1f} candidates each')
print(f'  picked the inked card  model {top1("score"):.3f}   card ink-rate {top1("prior"):.3f}   highest cost {top1("cost"):.3f}   '
      f'lowest cost {top1("neg_cost"):.3f}   most copies {top1("copies"):.3f}   random {(1 / test.groupby("decision_id").size()).mean():.3f}')
print(f'  top features: {importance(model.booster_, features)}')
model.booster_.save_model('decisions/ink.lgb.txt')
