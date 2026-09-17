import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { hostOnly, requestClientIp } from "./internal/forwarded";

export default {
  description:
    "hostOnly(handler) 404s a /api/host-only/ route unless the request made exactly the gateway's own proxy hop (it came from the box); requestClientIp(req) reads the visitor address Caddy wrote into X-Forwarded-For.",
} satisfies ServerPluginDefinition;
