import { implement } from "@plugins/infra/plugins/endpoints/server";
import {
  countLoopsInSetEndpoint,
  ensureChordIndexEndpoint,
  findLoopsEndpoint,
  nextChordsEndpoint,
} from "../../core";
import { ensureIndex } from "./ensure";
import {
  countLoopsByNextChord,
  countLoopsInSet,
  findLoopWindows,
} from "./find";
import { loadIndexStatus } from "./state";

export const handleEnsureIndex = implement(ensureChordIndexEndpoint, () =>
  ensureIndex(),
);

// Both reads answer `not-ready` with the status unless the index is `ready`:
// an empty list before the load would read as "no song fits these chords".

export const handleFindLoops = implement(
  findLoopsEndpoint,
  async ({ body }) => {
    const status = await loadIndexStatus();
    if (status.kind !== "ready") return { kind: "not-ready" as const, status };
    return { kind: "ready" as const, candidates: await findLoopWindows(body) };
  },
);

export const handleNextChords = implement(
  nextChordsEndpoint,
  async ({ body }) => {
    const status = await loadIndexStatus();
    if (status.kind !== "ready") return { kind: "not-ready" as const, status };
    return {
      kind: "ready" as const,
      nextChords: await countLoopsByNextChord(body),
    };
  },
);

export const handleCountLoopsInSet = implement(
  countLoopsInSetEndpoint,
  async ({ body }) => {
    const status = await loadIndexStatus();
    if (status.kind !== "ready") return { kind: "not-ready" as const, status };
    return { kind: "ready" as const, windows: await countLoopsInSet(body) };
  },
);
