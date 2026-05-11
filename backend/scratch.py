import lightgbm as lgb
import numpy as np

X = np.random.rand(100, 5)
y = np.random.randint(0, 2, 100)

model = lgb.LGBMClassifier(max_depth=3, n_estimators=1)
model.fit(X, y)

tree = model.booster_.dump_model()['tree_info'][0]['tree_structure']
print(tree)
