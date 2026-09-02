// Max client slow-op items accepted per `POST /api/slow-ops/client` request.
// Shared so the browser queue chunks its flush to this size and can never form
// a batch the server will reject — the same contract `MAX_EMIT_LINES` has for
// the log-channels emit beacon (see log-channels/core/endpoints.ts). The chunk
// size, not the accumulated queue length, bounds each request.
export const MAX_CLIENT_SLOW_OP_ITEMS = 200;
