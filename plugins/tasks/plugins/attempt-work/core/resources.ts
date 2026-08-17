import {
  resourceDescriptor,
  unresolved,
} from "@plugins/primitives/plugins/live-state/core";
import { AttemptWorkPayloadSchema, type AttemptWorkPayload } from "./protocol";

// `initialData` is the self-describing non-value `unresolved("not loaded")` — not
// a zeroed `AttemptWork`, which would be an absorbable failure indistinguishable
// from an attempt that genuinely has nothing at stake (and would offer the
// destructive drop over work nobody has measured yet). After the readiness gate
// this is never observed through `useResource` anyway (a value you can read is
// one the server vouches for), but the honest non-value is the right default.
export const attemptWorkResource = resourceDescriptor<
  AttemptWorkPayload,
  { attemptId: string }
>("attempt-work", AttemptWorkPayloadSchema, unresolved("not loaded"));
