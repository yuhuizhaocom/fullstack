# 原版地图数据完整解析（本地解包直读）

来源：`C:/Users/肥胖的粽子/AppData/Local/Temp/tve_w3x/extracted`。工具：`tools/map-parser/dump_map_data.py`。

## war3map.w3e（地形）
- magic=W3E!, version=11
- tileset count=7: Wdrt, Wdro, Wsng, Wrok, Wgrs, Wsnw, Nice
- cliff tilesets=2: CWgr, CWsn
- size=385 x 289 terrain cells (tile=128 world units)
- data offset=65, file size=778928, cells=111265, bytes/cell=7.000
- corner heights: min=8192, max=4065396000, distinct=2650
- ground layer histogram (raw id → tileset index id>>5, variation id&31):
  - id 0 (Wdrt, var 0): 32582
  - id 32 (Wdro, var 0): 27354
  - id 4 (Wdrt, var 4): 6157
  - id 5 (Wdrt, var 5): 5997
  - id 19 (Wdrt, var 19): 4810
  - id 34 (Wdro, var 2): 4712
  - id 16 (Wdrt, var 16): 4616
  - id 18 (Wdrt, var 18): 4166
  - id 197 (Nice, var 5): 3112
  - id 20 (Wdrt, var 20): 2371
  - id 21 (Wdrt, var 21): 951
  - id 68 (Wsng, var 4): 863
- layer heights distinct=61, flags distinct=60

## war3map.wpm（可通行性）
- magic=MP3W, version=0
- size=1536 x 1152, cells=1769472, no-walk(bit 0x02)=1017920 (57.5%)
- value histogram (top 12):
  - 64: 736360
  - 206: 624192
  - 202: 217400
  - 10: 176328
  - 72: 15192
- downsampled full map 384x288 (first 24 rows, every 8th column):
  ################################################
  ################################################
  ################################################
  ################################################
  ################################################
  ################################################
  ################################################
  ################################################
  ################################################
  ################################################
  ################################################
  ################################################
  ################################################
  ################################################
  ################################################
  ################################################
  ################################################
  ################################################
  ################################################
  ################################################
  ################################################
  ################################################
  ################################################
  ################################################
- arena crop (492,161,416) downsampled 64x64:
  ##..........#............................#............#.#.##..##
  .............##########.............######...###..###.#.......##
  ##..........................####.............#......#.#.......##
  .#...........##.......##.#.........#######...#.#..#.#.##########
  .#...........##.......#..####......#.....#...#.#..#.#.##########
  ......#.....#...............#......####..#...#.#..#.#.#.......##
  ####........................#............#...########.#.......##
  ..#...#.....#............####............#............#.##....##
  ..#................................####..########.............##
  ..#.........................#.#....#.....#......#.............##
  ..#.......................#........#.....#...##.#.....#.##....##
  ###.............#...#.....#.#.#....#.........#........#.......##
  ####...########.#...#.....#.#.#....#.........####.....#.......##
  .#.....#....#.#.#...#.....#........#............#.....##########
  .......#......#.#.........#........####...#............#########
  .#.....#....#.#.#.........######..........#............#..######
  .#.....#......#.#......................#.##............#..#....#
  .#.....#....#.#.#.................###..#.##............#..#....#
  ####...#####....#.................#.#..##.#....####....#..##...#
  #.................................#.#.....#.......#....#.......#
  #...###########...................#.#.....#.......#....#.......#
  #...#.............................#.#...###..######....######..#
  ....#.............................#............................#
  #...####....###...................#.....####...#.#.............#
  #.................................###...##.#.#.#.#.#...........#
  #.............................#.........##.#.#.#.#.#...........#
  #...####....###......#..#.......#....##.##.#.#.....#..........##
  #...#................#..#....#..##...##....#.#.....#..........##
  #...#................#...............##....#.#.....#..........##
  #...###########......#..#....#..##...##....#..#...#....#..#..###
  #....................#..#.......#....#######...........#..#....#
  #....................##########.#....###..##...........#..#....#
  .................#.....................#..#....................#
  .................#.................##..#..#....................#
  .......#####..#.##.................#......#..........########..#
  .......#...#.....#....#..#..#..#...#.###..#....................#
  ##.##..#.........#....#..#..#..#...#......#.###................#
  .......#...#.....#....#..#..#..#...#......#.#.#.####...........#
  ##.....###########....#........#............#......#.###.....#.#
  ##....................#........#............#..........#.....#.#
  ......................#........#..##.....#.........#####...#.###
  ####..................##########.........#.........#.....###.###
  ...................................................###...#....##
  ##...#.##############...............#....#..##.##....#...#....##
  .....#.#...#........#....................#..#...#....#...#....##
  ...........#........#...............######..#...#....#...#....##
  ###.##.#...#........#.......................#...######.....#..##
  ##...#.#...#........#..............##############..........#..##
  .#.........#...#...............#.#.........#....#.#######.##..##
  .#.........#...................#.#.........#....#.#####.......##
  .#.....#...#...#...............#.######....#....#.....#.####..##
  .#.........#........#..........#.#.........#....####..#.......##
  ##.....#...#........#............#.........#..........#.####..##
  ################################################################
  ##############################################################..
  ##############################################################..
  ##############################################################..
  ################################################################
  ################################################################
  ################################################################
  ################################################################
  ################################################################
  ####.......#..###################...########........############
  ..##.......#..#.......#.........#...................#.........##

## war3map.doo（装饰物）
- version=8, subversion=11, doodad count=4283
- type histogram:
  - WTst: 4282
  - ITag: 1
- WTst count=4282, x range=[-26176, 15296], y range=[-14528, 14656]
- WTst first 5 positions: [(-19776, 11840, 0), (-2944, -14400, 128), (-3136, -14400, 128), (-11072, -6848, 128), (-11200, -6848, 128)]

## war3map.shd（阴影图）
- size=1769472 bytes, expected 1536x1152=1769472
- distinct byte values=2, top=[(0, 1603368), (255, 166104)]

## war3map.mmp（小地图图标）
- icon count=18
  - #0: x=1, y=45, icon=71, color=0xffffffff
  - #1: x=1, y=110, icon=140, color=0xffffffff
  - #2: x=1, y=209, icon=131, color=0xffffffff
  - #3: x=1, y=118, icon=128, color=0xffffffff
  - #4: x=1, y=200, icon=186, color=0xffffffff
  - #5: x=1, y=213, icon=173, color=0xffffffff
  - #6: x=2, y=185, icon=198, color=0xffff0303
  - #7: x=2, y=185, icon=198, color=0xff4e2a04
  - #8: x=2, y=185, icon=198, color=0xff106246
  - #9: x=2, y=185, icon=198, color=0xff7ebff1
  - #10: x=2, y=185, icon=198, color=0xff959697
  - #11: x=2, y=185, icon=198, color=0xffe55bb0
  - #12: x=2, y=185, icon=198, color=0xff20c000
  - #13: x=2, y=185, icon=198, color=0xfffe8a0e
  - #14: x=2, y=185, icon=198, color=0xfffffc01
  - #15: x=2, y=185, icon=198, color=0xff540081
  - #16: x=2, y=185, icon=198, color=0xff1ce6b9
  - #17: x=2, y=185, icon=198, color=0xff0042ff

## war3map.w3i（地图信息）
- version=25, editor version=5319, map version=6052
- string[0]='|cFF33FF00新巨魔与精灵v4.0.34b|r'
- string[1]='详见F9'
- string[2]='巨魔来到了森林,准备掠夺精灵们的资源,赶快建立起防御工事来抵御巨魔的进攻吧!'
- string[3]='12'
- suggested players=12
- string bytes end offset=172

## war3map.j（触发器脚本：常量与区域）
- constant declarations: 3100
  - real SYSTEM_TROLL_COLLISION_SIZE = 40.0
  - real SYSTEM_ELVE_COLLISION_SIZE = 72.0
  - integer OLD_TROLL_STOLE_LIFE_SKILL_TYPE = 'A070'
  - integer WOOD_PRICE_UP_LIM = 495
  - integer WOOD_PRICE_DOWN_LIM = 5
  - real SINGLE_WOLF_REVIVE_TIME = 20.0
  - real SINGLE_ANGEL_REVIVE_TIME = 10.0
  - real REVIVE_TROLL_REVIVE_TIME = 20.0
  - real REVIVE_ANGEL_REVIVE_TIME = 10.0
  - real REVIVE_SET_REVIVE_TIME = 10.0
  - real DOUBLE_WOLF_REVIVE_TIME = 20.0
  - real DOUBLE_ANGEL_REVIVE_TIME = 10.0
  - real FIX_ANGEL_REVIVE_TIME = 10.0
  - real RACE_ANGEL_REVIVE_TIME = 10.0
  - real DUET_WOLF_REVIVE_TIME = 20.0
  - real DUET_ELVE_REVIVE_TIME = 60.0
  - real DEFEND_ELVE_REVIVE_TIME = 60.0
  - real DEFEND_WOLF_REVIVE_TIME = 20.0
  - real SURVIVE_ELVE_REVIVE_TIME = 60.0
  - real SURVIVE_ANGEL_REVIVE_TIME = 10.0
  - integer SURVUVE_SCARE_ELVE_ROUND_START = 4
  - integer SURVIVE_SCARE_ELVE_ROUND_END = 25
  - real SURVIVE_KRYPTON_SKILL_CD = 0.75
  - integer s__AngelManager_ANGEL_STOLE_GOLD_MAX_INDEX = 60
  - integer s__BalanceFinalTowerManager_BALANCE_FINAL_TOWER_SHOW_NUMBER = 30
  - integer s__BalanceFinalTowerManager_BALANCE_FINAL_TOWER_ENOUGH_COUNT = 66
  - integer s__FastFinalTowerManager_FAST_FINAL_TOWER_ENOUGH_COUNT = 16
  - integer s__MiddleFinalTowerManager_MIDDLE_FINAL_TOWER_SHOW_NUMBER = 30
  - integer s__MiddleFinalTowerManager_MIDDLE_FINAL_TOWER_ENOUGH_COUNT = 66
  - integer s__OldFinalTowerManager_OLD_FINAL_TOWER_SHOW_NUMBER = 30
  - integer s__OldFinalTowerManager_OLD_FINAL_TOWER_ENOUGH_COUNT = 66
  - integer s__GameRule_RULE_REVIVE = 9
- region rectangles (from CreateRegions):
  set gg_rct_MAP_0_AREA=Rect(-15744.0,-14880.0,-736.0,-1536.0)
  set gg_rct_MAP_1_AREA=Rect(-736.0,-896.0,15392.0,15424.0)
  set gg_rct_MAP_2_AREA=Rect(0.0,-11872.0,10144.0,-1920.0)
  set gg_rct_MAP_3_AREA=Rect(9760.0,-15008.0,15712.0,-7296.0)
  set gg_rct_MAP_4_AREA=Rect(-24544.0,7104.0,-16448.0,15456.0)
  set gg_rct_MAP_5_AREA=Rect(-26688.0,-14624.0,-16480.0,-4320.0)
  set gg_rct_MAP_5_AREA_EXTRA=Rect(-26688.0,-3264.0,-16448.0,6752.0)
  set gg_rct_MAP_6_AREA=Rect(-26688.0,-14720.0,-16448.0,6752.0)
  set gg_rct_MAP_7_AREA=Rect(-15968.0,-768.0,-992.0,15552.0)
  set gg_rct_SystemChooseArea1=Rect(-512.0,-14848.0,9568.0,-11808.0)
  set gg_rct_SystemChooseArea2=Rect(-1248.0,-1600.0,-224.0,-864.0)
  set gg_rct_SystemChooseArea3=Rect(-22048.0,-4256.0,-20960.0,-3712.0)
  set gg_rct_SystemChooseArea4=Rect(-26240.0,10848.0,-25152.0,11392.0)
  set gg_rct_SystemTrialArea=Rect(9824.0,-6944.0,15584.0,-1344.0)
  set gg_rct_SoloBanEArea=Rect(12544.0,-10624.0,15328.0,-9472.0)
  set gg_rct_MAP_0_CHECK_AREA=Rect(-9280.0,-9696.0,-6816.0,-7488.0)
  set gg_rct_MAP_1_CHECK_AREA=Rect(6016.0,5440.0,9152.0,7648.0)
  set gg_rct_MAP_2_CHECK_AREA=Rect(3520.0,-6848.0,5440.0,-5184.0)
  set gg_rct_MAP_3_CHECK_AREA=Rect(14080.0,-10208.0,14848.0,-9504.0)
  set gg_rct_MAP_4_CHECK_AREA=Rect(-20640.0,10848.0,-20320.0,11168.0)
  set gg_rct_MAP_5_CHECK_AREA=Rect(-22592.0,-10976.0,-20416.0,-8480.0)
  set gg_rct_MAP_6_CHECK_AREA=Rect(-22112.0,-4256.0,-20960.0,-3616.0)
  set gg_rct_MAP_7_CHECK_AREA=Rect(-9696.0,5184.0,-7072.0,7424.0)
- preplaced units (CreateUnit): 126
- preplaced unit type histogram (top 20):
  - n003: 71
  - u03R: 12
  - u03O: 12
  - e036: 9
  - e00Z: 6
  - e014: 5
  - u06L: 4
  - H022: 2
  - e015: 2
  - n008: 1
  - u03P: 1
  - H07N: 1
- key preplaced u03R (12): [(5568, -14272), (-21504, -9728), (-23552, 14080), (-17408, 14080), (-17408, 7936), (-23552, 7936), (-8064, -8704), (4480, -6016), (14464, -9856), (7680, 6400), (-8320, 6272), (-21504, 1664)]
- key preplaced e015 (2): [(962, -13378), (8117, -13394)]
- key preplaced n008 (1): [(-20480, 11008)]

## war3map.w3a（全部技能）
- version=2, count=50
- ids: A011, A067, A06A, A06M, A06O, A06R, A06S, A06Y, A07I, A07J, A07K, A07P, A085, A0BX, A0C0, A0C2, A0CA, A0CQ, A0GU, A0GX, A0GZ, A0HC, A0HP, A0I6, A0ID, A0IE, A0IF, A0JQ, A0JU, A0JV, A0JW, A0K0, A0K8, A06B, A0GV, A0KB, A0LM, A0LN, A0M9, A0MA, A0MC, A0RV, A0RW, A0SJ, A0SK, A0SW, A0SY, A0T7, A0TN, A0TZ
- full per-ability fields: `local-w3a-all.md` (all 50, key fields), `local-w3a-summary.md` (selected deep).
- full unit table: `local-unit-all.md`; full shop items: `local-item-summary.md`.

## 物编文件规模
- AbilityBuffData.slk: 10292 bytes
- AbilityData.slk: 400198 bytes
- CampaignAbilityFunc.txt: 0 bytes
- CampaignAbilityStrings.txt: 897537 bytes
- CampaignUnitFunc.txt: 924963 bytes
- CampaignUnitStrings.txt: 0 bytes
- CampaignUpgradeFunc.txt: 0 bytes
- CampaignUpgradeStrings.txt: 0 bytes
- CommonAbilityFunc.txt: 0 bytes
- CommonAbilityStrings.txt: 0 bytes
- HumanAbilityFunc.txt: 0 bytes
- HumanAbilityStrings.txt: 0 bytes
- HumanUnitFunc.txt: 0 bytes
- HumanUnitStrings.txt: 0 bytes
- HumanUpgradeFunc.txt: 0 bytes
- HumanUpgradeStrings.txt: 0 bytes
- ItemAbilityFunc.txt: 0 bytes
- ItemAbilityStrings.txt: 0 bytes
- ItemData.slk: 254252 bytes
- ItemFunc.txt: 276899 bytes
- ItemStrings.txt: 0 bytes
- NeutralAbilityFunc.txt: 0 bytes
- NeutralAbilityStrings.txt: 0 bytes
- NeutralUnitFunc.txt: 0 bytes
- NeutralUnitStrings.txt: 0 bytes
- NeutralUpgradeFunc.txt: 0 bytes
- NeutralUpgradeStrings.txt: 35519 bytes
- NightElfAbilityFunc.txt: 0 bytes
- NightElfAbilityStrings.txt: 0 bytes
- NightElfUnitFunc.txt: 0 bytes
- NightElfUnitStrings.txt: 0 bytes
- NightElfUpgradeFunc.txt: 0 bytes
- NightElfUpgradeStrings.txt: 0 bytes
- OrcAbilityFunc.txt: 0 bytes
- OrcAbilityStrings.txt: 0 bytes
- OrcUnitFunc.txt: 0 bytes
- OrcUnitStrings.txt: 0 bytes
- OrcUpgradeFunc.txt: 0 bytes
- OrcUpgradeStrings.txt: 0 bytes
- UndeadAbilityFunc.txt: 0 bytes
- UndeadAbilityStrings.txt: 0 bytes
- UndeadUnitFunc.txt: 0 bytes
- UndeadUnitStrings.txt: 0 bytes
- UndeadUpgradeFunc.txt: 0 bytes
- UndeadUpgradeStrings.txt: 0 bytes
- UnitAbilities.slk: 103559 bytes
- UnitBalance.slk: 652142 bytes
- UnitData.slk: 384230 bytes
- UnitUI.slk: 764177 bytes
- UnitWeapons.slk: 774108 bytes
- UpgradeData.slk: 14308 bytes
