# 未知问题清单（M0）

按阻塞程度排序。每条标注当前可信度与下一步动作。

| # | 问题 | 状态 | 下一步 |
| ---: | --- | --- | --- |
| 1 | `war3map.w3u/w3t/w3h/w3q` 不在 MPQ hash 表；自定义单位/物品/技能是否全部由 SLK/TXT 覆盖 | UNKNOWN | 解析 `war3map.j` 中所有自定义 ID，与 SLK 行交叉比对 |
| 2 | `war3mapUnits.doo` 仅在 listfile 中出现，hash 表缺失 | UNKNOWN | 确认是否被 protector 删除；若需初始单位数据，从 JASS 创建函数恢复 |
| 3 | 4 种平衡模式、9 种规则的完整胜负条件 | RESOLVED | 9 种规则胜负判定全部 VERIFY，见 victory-rules.md |
| 4 | `OldTrollDamageHandler.causeDamage` 的伤害公式 | VERIFIED | 已读行 190866：伤害转金币、22% 吸血；无剩余阻塞 |
| 5 | 原版玩家出生坐标（w3i 未完全解析） | PARTIAL | w3i 头部/字符串/相机已解析；出生坐标 UNKNOWN |
| 6 | 物品 ID 与属性（ItemData.slk 未逐项映射） | UNKNOWN | 解析 SLK 并对齐 JASS `GoodsManager` |
| 7 | 技能 ID 与数值（w3a 未解析） | RESOLVED | 已解析 w3a 全部 50 个技能字段；A067/A06M 数值见 skills.md；巨魔技能仍需 JASS 追踪 |
| 8 | MDX 动画名称/序列帧 | UNKNOWN | 解析 SEQS 块或 Three.js 运行时枚举 |
| 9 | 地形 BLP 贴图缺失 | VERIFIED 缺失 | 采用程序化地表或外部素材，需记录授权风险 |
| 10 | 复活机制（REVIVE 规则） | VERIFIED 存在 / 语义 UNKNOWN | 阅读 `Trig_ReviveElveDieActions` |
| 11 |  Woods market 价格随“拥有市场人数”变化的具体公式 | UNKNOWN | 跟踪 `u018` 相关触发器 |
| 12 | 原版多重地图（8 种 MAP_*）的地形数据是否都在同一个 w3e 中 | UNKNOWN | 检查 w3e 与 JASS 地图切换逻辑 |

> 不允许把以上 UNKNOWN 当成原版事实写入 GDD 或客户端配置。
