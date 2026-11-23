/**
 * 应用构建版本号（年月日时分秒），由 next.config.ts 在构建时注入。
 * 未注入时（理论上不会发生）回退为 dev。
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "dev";
