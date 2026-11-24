//
// 确保系统存在超级管理员账号（幂等，可在每次部署后执行）
//
// 规则：
// 1. 已存在 SUPER_ADMIN 则直接跳过；
// 2. 否则创建 ADMIN_EMAIL（默认 admin@taskflow.local）账号；
// 3. 密码优先取 ADMIN_PASSWORD 环境变量，其次读已有密码文件，最后随机生成并写入
//    ADMIN_PASSWORD_FILE（默认 /root/.taskflow-admin-password，600）；
// 4. 把历史遗留的无主任务（ownerId 为空）归到该管理员，便于后续分配。
//
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";
import prismaPkg from "@prisma/client";

const { PrismaClient } = prismaPkg;
const prisma = new PrismaClient();

const EMAIL = process.env.ADMIN_EMAIL || "admin@taskflow.local";
const NAME = process.env.ADMIN_NAME || "超级管理员";
const PASSWORD_FILE =
  process.env.ADMIN_PASSWORD_FILE || "/root/.taskflow-admin-password";

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$${salt}$${hash.toString("hex")}`;
}

async function main() {
  const existing = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" } });
  if (existing) {
    console.log(`[admin] 已存在超级管理员 ${existing.email}，跳过`);
    return;
  }

  let password = process.env.ADMIN_PASSWORD || "";
  let generated = false;

  if (!password && existsSync(PASSWORD_FILE)) {
    password = readFileSync(PASSWORD_FILE, "utf8").trim();
  }
  if (!password) {
    password = randomBytes(12).toString("hex");
    generated = true;
  }

  const byEmail = await prisma.user.findUnique({ where: { email: EMAIL } });
  const user = byEmail
    ? await prisma.user.update({
        where: { id: byEmail.id },
        data: { role: "SUPER_ADMIN", passwordHash: hashPassword(password) },
      })
    : await prisma.user.create({
        data: {
          email: EMAIL,
          name: NAME,
          passwordHash: hashPassword(password),
          role: "SUPER_ADMIN",
        },
      });

  const claimed = await prisma.task.updateMany({
    where: { ownerId: null },
    data: { ownerId: user.id },
  });

  if (generated) {
    writeFileSync(PASSWORD_FILE, `${password}\n`, { mode: 0o600 });
    try {
      chmodSync(PASSWORD_FILE, 0o600);
    } catch {
      // 忽略权限设置失败（非 root 环境）
    }
  }

  console.log(`[admin] 已创建超级管理员: ${EMAIL}`);
  console.log(
    `[admin] 初始密码: ${generated ? `已写入 ${PASSWORD_FILE}` : "来自环境变量或已有密码文件"}`
  );
  console.log(`[admin] 接管无主任务 ${claimed.count} 条`);
}

main()
  .catch((error) => {
    console.error("[admin] 初始化超级管理员失败:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
