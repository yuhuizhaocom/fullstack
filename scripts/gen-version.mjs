//
// 生成构建版本号（年月日时分秒，Asia/Shanghai）
// 输出到 src/lib/version.generated.ts，保证服务端与客户端打包进同一个常量，
// 避免运行时再次计算导致 SSR 与 hydration 文本不一致。
//
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const parts = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
}).formatToParts(new Date());

const pick = (type) => parts.find((part) => part.type === type)?.value ?? "00";
const version = [
  pick("year"),
  pick("month"),
  pick("day"),
  pick("hour"),
  pick("minute"),
  pick("second"),
].join("");

const target = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "lib",
  "version.generated.ts"
);

writeFileSync(
  target,
  `// 由 scripts/gen-version.mjs 在构建时生成，请勿手动修改\n` +
    `export const APP_VERSION = "${version}";\n`
);

console.log(`[version] ${version}`);
