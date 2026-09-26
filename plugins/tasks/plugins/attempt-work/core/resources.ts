import { liveValue } from "@plugins/network/plugins/live/core";
import { AttemptWorkPayloadSchema } from "./protocol";

// Where one attempt stands relative to `main`. The payload is a
// `Resolvable<AttemptWork>`: an attempt nobody can measure is a settled
// `{ resolved: false, reason }` — never a zeroed `AttemptWork`, which would be
// indistinguishable from an attempt with nothing at stake (and would offer the
// destructive drop over work nobody has measured). Not loaded yet is `pending`.
export const attemptWork = liveValue("attempt-work", {
  schema: AttemptWorkPayloadSchema,
  params: ["attemptId"],
});
