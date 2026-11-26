// tve4 运行期规则文件：直接读取 data/game/game-rules.json，不在引擎里硬编码。

import raw from "../../../data/game/game-rules.json";

export interface EquipmentItem {
  key: string;
  label: string;
  cost: number;
  damage?: number;
  attackSpeed?: number;
  speed?: number;
  maxHp?: number;
  income?: number;
  lifesteal?: number;
}

export interface RuleFile {
  version: number;
  elfDemolish: {
    minHpRatio: number;
    trollAvoidRadius: number;
    refundTentUpgrades: boolean;
  };
  equipmentShop: {
    trollSpawnRadius: number;
    items: EquipmentItem[];
  };
}

export const RULES = raw as unknown as RuleFile;

export const DEMOLISH_RULE = RULES.elfDemolish;
export const EQUIPMENT_RULE = RULES.equipmentShop;
