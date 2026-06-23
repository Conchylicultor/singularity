import type { ReactNode } from "react";
import { ZeroProvider } from "@rocicorp/zero/react";
// Side-effect import: registers Zero's query bindings (query-registry /
// view-apply-change / ttl). `@rocicorp/zero/react` already pulls these in
// transitively, but importing the binding entry explicitly defends against a
// vite tree-shake dropping the side-effect module — a Stage-0 suspect for the
// client never pushing its desired query. Harmless if already loaded.
import "@rocicorp/zero/bindings";
import type { Schema } from "@rocicorp/zero";
import { ZERO_CACHE_PORT } from "@plugins/database/plugins/zero/core";

/**
 * Generic, schema-parameterized Zero provider wrapper. The consumer passes its
 * own concrete schema; this wires the cache URL and a fixed anonymous userID
 * (read-only Stage 1, no auth). Mount it locally around the surface that needs
 * Zero — it is opt-in by construction (no global mount).
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
      server={`http://localhost:${ZERO_CACHE_PORT}`}
      schema={schema}
      userID="anon"
    >
      {children}
    </ZeroProvider>
  );
}
