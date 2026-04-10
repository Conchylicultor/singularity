import type { ServerWebSocket } from "bun";
import { wsHandler as terminalWs } from "@plugins/terminal/server";
import { handleBuild } from "@plugins/build/server";

export interface WsData {
  path: string;
}

export interface WsHandler {
  open(ws: ServerWebSocket<WsData>): void;
  message(ws: ServerWebSocket<WsData>, msg: string | Buffer): void;
  close(ws: ServerWebSocket<WsData>, code: number, reason: string): void;
}

// HTTP routes: "METHOD /path" → handler
export const httpRoutes: Record<
  string,
  (req: Request) => Response | Promise<Response>
> = {
  "POST /api/build": handleBuild,
};

// WebSocket routes: "/path" → handler
export const wsRoutes: Record<string, WsHandler> = {
  "/ws/terminal": terminalWs,
};
