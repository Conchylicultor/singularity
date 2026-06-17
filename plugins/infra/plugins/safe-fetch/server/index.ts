import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export {
  SsrfError,
  parsePublicUrl,
  assertResolvesPublic,
  isPrivateIp,
  safeFetch,
} from "./internal/ssrf";
export type { SafeFetchInit } from "./internal/ssrf";

export default {
  description:
    "SSRF-guarded fetch primitive: parsePublicUrl + DNS-resolution checks (isPrivateIp/assertResolvesPublic) and safeFetch, which follows redirects with per-hop revalidation so a target can never reach loopback/private/link-local/metadata addresses.",
} satisfies ServerPluginDefinition;
