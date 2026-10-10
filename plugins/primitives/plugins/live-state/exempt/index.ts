import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "endpoints/no-raw-web-fetch",
    paths: ["web/use-resource.ts"],
    kind: "sanctioned",
    reason:
      "Special transport that implement()/fetchEndpoint can't express. Do NOT migrate these. The live-state primitive's own resource GET — this IS the primitive that useEndpoint resources are built on; it cannot depend on itself.",
  },
  {
    rule: "endpoints/no-raw-web-fetch",
    paths: ["web/notifications-client.ts"],
    kind: "sanctioned",
    reason:
      "Same live-state resource GET, in the client that owns the version-guarded cache write: `primeFromHttp` is the cold-start HTTP prime of the same `/api/resources/:key` route as use-resource's queryFn, kept here because the write needs the client's private sub/schema state (and this file cannot import use-resource — that would be a cycle). Same primitive, same untyped per-resource route, same self-dependency exemption.",
  },
  {
    rule: "live/no-legacy-resource-spelling",
    paths: ["."],
    kind: "sanctioned",
    reason:
      "The substrate: defines the old live-resource spellings, or is compiled onto them (the live API, the optimistic overlay, the runtime and its server / central facades).",
  },
  {
    rule: "live/no-endpoint-read",
    paths: ["web"],
    kind: "sanctioned",
    reason:
      "The substrate: the live-state client's own HTTP read (useResource's fallback / on-demand fetch over TanStack queries) that every live read compiles to, and the useEndpointResource / useQueryResource adapters it defines.",
  },
] satisfies Exemptions;
