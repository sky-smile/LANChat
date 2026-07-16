/**
 * 通话信令总线
 * 解决 useWebSocket 和 useWebRTC 之间的循环依赖问题
 * useWebRTC 注册处理器，useWebSocket 调用处理器
 */

interface WsMessage {
  type: string;
  payload?: unknown;
}

let _handler: ((msg: WsMessage) => void) | null = null;

/** 注册信令处理器（由 useWebRTC 调用） */
export function setCallSignalingHandler(handler: ((msg: WsMessage) => void) | null) {
  _handler = handler;
}

/** 调用信令处理器（由 useWebSocket 调用） */
export function dispatchCallSignaling(msg: WsMessage) {
  if (_handler) {
    _handler(msg);
  }
}
