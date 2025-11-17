declare module 'ws' {
  // 轻量级类型声明：仅用于通过 TypeScript 编译检查，具体运行时行为由 ws 库提供
  const WebSocket: any;
  export default WebSocket;
  export const WebSocketServer: any;
}




