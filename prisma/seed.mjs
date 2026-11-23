import prismaPkg from "@prisma/client";

const { PrismaClient } = prismaPkg;
const prisma = new PrismaClient();

const today = new Date();
const dayOffset = (offset) =>
  new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset));

const tasks = [
  {
    id: "seed-task-01",
    title: "联调 WSL 一键安装脚本",
    description: "在 Ubuntu 22.04 的 WSL2 虚拟机中完整跑通安装、迁移与种子数据流程。",
    assignee: "张伟",
    status: "IN_PROGRESS",
    priority: "HIGH",
    dueDate: dayOffset(2),
    createdAt: dayOffset(-1),
  },
  {
    id: "seed-task-02",
    title: "设计任务详情页交互",
    description: "补充任务详情抽屉，支持查看描述、负责人和状态流转记录。",
    assignee: "李娜",
    status: "TODO",
    priority: "MEDIUM",
    dueDate: dayOffset(5),
    createdAt: dayOffset(-2),
  },
  {
    id: "seed-task-03",
    title: "补充 Prisma 数据模型说明",
    description: "整理 Task 模型的字段约束与索引设计，方便后续扩展子任务。",
    assignee: "王强",
    status: "TODO",
    priority: "LOW",
    dueDate: dayOffset(9),
    createdAt: dayOffset(-3),
  },
  {
    id: "seed-task-04",
    title: "搭建持续集成流水线",
    description: "提交代码后自动执行 prisma generate、next build 与类型检查。",
    assignee: "张伟",
    status: "IN_PROGRESS",
    priority: "MEDIUM",
    dueDate: dayOffset(4),
    createdAt: dayOffset(-4),
  },
  {
    id: "seed-task-05",
    title: "修复移动端筛选器遮挡问题",
    description: "小屏幕下筛选区域换行后会覆盖列表表头，已调整布局与间距。",
    assignee: "李娜",
    status: "DONE",
    priority: "HIGH",
    dueDate: dayOffset(-3),
    createdAt: dayOffset(-6),
  },
  {
    id: "seed-task-06",
    title: "接入健康检查接口",
    description: "提供 /api/health，返回应用与数据库连接状态，供安装脚本探活。",
    assignee: "陈晨",
    status: "DONE",
    priority: "LOW",
    dueDate: dayOffset(-6),
    createdAt: dayOffset(-7),
  },
  {
    id: "seed-task-07",
    title: "评审仪表盘统计口径",
    description: "确认「进行中」「已完成」的统计规则，以及完成率的计算方式。",
    assignee: "陈晨",
    status: "TODO",
    priority: "HIGH",
    dueDate: dayOffset(1),
    createdAt: dayOffset(-8),
  },
  {
    id: "seed-task-08",
    title: "优化列表分页性能",
    description: "为 status、priority、createdAt 建立索引，并验证大数据量下的分页查询。",
    assignee: "王强",
    status: "IN_PROGRESS",
    priority: "LOW",
    dueDate: dayOffset(7),
    createdAt: dayOffset(-9),
  },
  {
    id: "seed-task-09",
    title: "编写数据库备份脚本",
    description: "使用 pg_dump 定时备份任务数据，保留最近 7 天的快照。",
    assignee: "张伟",
    status: "TODO",
    priority: "MEDIUM",
    dueDate: dayOffset(12),
    createdAt: dayOffset(-10),
  },
  {
    id: "seed-task-10",
    title: "整理首轮用户反馈",
    description: "汇总试用同事对筛选、分页和移动端卡片视图的反馈。",
    assignee: "李娜",
    status: "DONE",
    priority: "MEDIUM",
    dueDate: dayOffset(-1),
    createdAt: dayOffset(-11),
  },
];

async function main() {
  for (const task of tasks) {
    await prisma.task.upsert({
      where: { id: task.id },
      update: task,
      create: task,
    });
  }
  console.log(`[seed] 已写入 ${tasks.length} 条示例任务`);
}

main()
  .catch((error) => {
    console.error("[seed] 写入示例数据失败:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
