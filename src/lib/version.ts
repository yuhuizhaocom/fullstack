// 构建版本号（年月日时分秒），由 scripts/gen-version.mjs 在构建时写入，
// 单独成文件是为了保证服务端与客户端使用同一个字面量。
export { APP_VERSION } from "./version.generated";
