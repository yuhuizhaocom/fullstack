import type { RoomId } from "./terrain";

export type QuestStatus = "active" | "complete" | "turnedIn";

export type QuestObjective =
  | { kind: "kill"; monsterKind?: string; count: number; label: string }
  | { kind: "boss"; dungeon: RoomId; label: string };

export type QuestReward = {
  exp: number;
  gold: number;
  items?: { itemId: string; count: number }[];
};

export type QuestDef = {
  id: string;
  npcId: string;
  title: string;
  desc: string;
  requireLevel?: number;
  objectives: QuestObjective[];
  reward: QuestReward;
};

export type QuestView = {
  id: string;
  status: QuestStatus;
  progress: number;
  goal: number;
};

export const QUESTS: Record<string, QuestDef> = {
  q_slime: {
    id: "q_slime",
    npcId: "npc_elder",
    title: "清理史莱姆",
    desc: "村庄外的史莱姆越来越多了，去消灭 8 只史莱姆吧。",
    requireLevel: 1,
    objectives: [{ kind: "kill", monsterKind: "slime", count: 8, label: "消灭史莱姆" }],
    reward: { exp: 120, gold: 150, items: [{ itemId: "potion_mid_hp", count: 2 }] },
  },
  q_wolf: {
    id: "q_wolf",
    npcId: "npc_elder",
    title: "狼群的威胁",
    desc: "野狼袭击了商队，请消灭 10 只野狼。",
    requireLevel: 2,
    objectives: [{ kind: "kill", monsterKind: "wolf", count: 10, label: "消灭野狼" }],
    reward: { exp: 280, gold: 260, items: [{ itemId: "potion_small_mp", count: 3 }] },
  },
  q_forest: {
    id: "q_forest",
    npcId: "npc_warden",
    title: "迷雾森林的狼王",
    desc: "迷雾森林深处的巨狼王正在集结狼群，进入副本击败它。",
    requireLevel: 1,
    objectives: [{ kind: "boss", dungeon: "forest", label: "击败森林巨狼王" }],
    reward: { exp: 600, gold: 500, items: [{ itemId: "berserker_greaves", count: 1 }] },
  },
  q_cave: {
    id: "q_cave",
    npcId: "npc_warden",
    title: "洞窟深处的魔像",
    desc: "幽暗洞窟的魔像挡住了矿脉，击败洞穴魔像。",
    requireLevel: 5,
    objectives: [{ kind: "boss", dungeon: "cave", label: "击败洞穴魔像" }],
    reward: { exp: 1500, gold: 900, items: [{ itemId: "ludens", count: 1 }] },
  },
  q_ruins: {
    id: "q_ruins",
    npcId: "npc_warden",
    title: "遗迹守卫",
    desc: "失落遗迹的守卫仍在执行千年前的命令，击败它取回神殿遗物。",
    requireLevel: 10,
    objectives: [{ kind: "boss", dungeon: "ruins", label: "击败遗迹守卫" }],
    reward: { exp: 3000, gold: 1800, items: [{ itemId: "guardian_angel", count: 1 }] },
  },
  q_dragon: {
    id: "q_dragon",
    npcId: "npc_warden",
    title: "讨伐炎龙",
    desc: "熔岩火山中的炎龙是大陆最大的威胁，击败它成为真正的英雄。",
    requireLevel: 16,
    objectives: [{ kind: "boss", dungeon: "volcano", label: "击败炎龙" }],
    reward: { exp: 7000, gold: 4000, items: [{ itemId: "phantom_dancer", count: 1 }] },
  },
};

export const QUEST_LIST: QuestDef[] = Object.values(QUESTS);

export function questById(id: string): QuestDef | null {
  return QUESTS[id] ?? null;
}

export function npcQuests(npcId: string): QuestDef[] {
  return QUEST_LIST.filter((quest) => quest.npcId === npcId);
}

export function questGoal(quest: QuestDef): number {
  return quest.objectives.reduce((sum, objective) => {
    return sum + (objective.kind === "kill" ? objective.count : 1);
  }, 0);
}

export function questStatusLabel(status: QuestStatus): string {
  if (status === "turnedIn") return "已完成";
  if (status === "complete") return "可交付";
  return "进行中";
}
