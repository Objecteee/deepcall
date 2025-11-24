// Debug助手 - 生产环境可通过设置为false来禁用
const DEBUG = true; // 开发时设为true，生产时改为false

export const log = (...args: any[]) => DEBUG && console.log(...args);

