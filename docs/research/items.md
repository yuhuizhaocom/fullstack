# 装备/物品（M0）

## 已验证存在

- `Units/ItemData.slk`（254,252 字节）、`Units/ItemFunc.txt`（276,899 字节）、`ReplaceableTextures/CommandButtons/` 中大量 BTN 图标（**VERIFIED**）。
- `war3map.j` 中存在 `GoodsManager`、`LoseItemActions`（行 147584）、商店相关类库；具体物品交易规则未逐条解析（**VERIFIED 存在 / UNKNOWN 语义**）。

## 网页草案（PROPOSED）

`SHOP_ITEMS` 定义 8 种装备：生锈铁剑 +2 攻、磨快铁剑 +4 攻、食尸鬼手套 +12% 攻速、速度之靴 +70 移速、生命护符 +250 HP、猎豹护符 +500 HP、生命项链 +8 回血、守护指环 +2 护甲。价格 15–200 金，均限制 1 件。

这些数值/限制**不是**原版 VERIFIED 数据，需要用 `ItemData.slk` 与 JASS `GoodsManager` 逐项对齐后才能作为正式配置。

## 图标资源

`public/tve-original/icons/` 中的图标由 `scripts/tve/build_assets.py` 从地图 BLP 转换而来（VERIFIED 来源），但具体图标与装备 ID 的对应关系尚未建立（UNKNOWN）。
