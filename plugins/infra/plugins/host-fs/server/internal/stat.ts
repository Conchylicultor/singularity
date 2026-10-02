import { basename } from "node:path";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { hostFsStat, type HostFsStatResult } from "../../core";
import { describeEntry } from "./entry";
import { classifyFsError, parentOf, resolveHostPath } from "./path";

/** Describe the absolute host path `path` (the root `/` is named `/`). */
export async function statHostPath(path: string): Promise<HostFsStatResult> {
  try {
    const entry = await describeEntry(path, basename(path) || path);
    return { kind: "ok", path, parent: parentOf(path), entry };
  } catch (err) {
    return { kind: classifyFsError(err), path };
  }
}

export const handleStat = implement(hostFsStat, ({ query }) =>
  statHostPath(resolveHostPath(query.path)),
);
