/**
 * e2e barrel for the shared socket.
 *
 * Importable from other plugins' e2e scripts as
 * `@plugins/primitives/plugins/networking/e2e`. The live sockets live in a
 * SharedWorker, out of Playwright's reach (`page.on("websocket")` and
 * `routeWebSocket` see nothing), so frame assertions and socket faults go
 * through this tap instead.
 */
export { tapSharedSocket } from "./support/socket-tap";
export type {
  SocketTap,
  SocketTapOptions,
  TappedFrame,
} from "./support/socket-tap";
