// TCP port the zero-cache sidecar listens on. Shared by the client (cache URL)
// and the cache-service (ZERO_PORT). A plain constant — no @rocicorp/zero
// dependency here, so any runtime can import it cheaply.
export const ZERO_CACHE_PORT = 4848;
