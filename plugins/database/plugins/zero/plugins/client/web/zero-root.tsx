import type { ReactNode } from "react";
import { ZeroProvider } from "@rocicorp/zero/react";
// Side-effect import: registers Zero's query bindings (query-registry /
// view-apply-change / ttl). `@rocicorp/zero/react` already pulls these in
// transitively, but importing the binding entry explicitly defends against a
// vite tree-shake dropping the side-effect module — a Stage-0 suspect for the
// client never pushing its desired query. Harmless if already loaded.
import "@rocicorp/zero/bindings";
import type { Schema } from "@rocicorp/zero";

/**
 * Generic, schema-parameterized Zero provider wrapper. The consumer passes its
 * own concrete schema; this wires the cache URL and a fixed anonymous userID
 * (read-only Stage 1, no auth). Mount it locally around the surface that needs
 * Zero — it is opt-in by construction (no global mount).
 *
 * The server URL is **same-origin** `${origin}/zero`: the gateway forwards
 * `/zero/*` (HTTP + WS) to this worktree's own zero-cache sidecar (Stage 2),
 * stripping the `/zero` prefix. So Zero rides the existing per-subdomain proxy
 * exactly like live-state's `/ws/notifications` — no CORS, no hardcoded host.
 */
export function ZeroRoot<S extends Schema>({
  schema,
  children,
}: {
  schema: S;
  children: ReactNode;
}) {
  return (
    <ZeroProvider
      server={`${window.location.origin}/zero`}
      schema={schema}
      userID="anon"
    >
      {children}
    </ZeroProvider>
  );
}
