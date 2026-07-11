import { createHash, randomBytes } from "node:crypto";

// f_<sha8(target)> — deterministic per target. build's in-flight probe and
// fork.ts (producer) must agree on this exactly, so it is single-sourced here.
export function forkTempPrefix(target: string): string {
  return `f_${createHash("sha256").update(target).digest("hex").slice(0, 8)}`;
}

// f_<sha8>_<rand8>__forking (~28 chars < 63; still endsWith("__forking") so the
// existing fork-temp-sweep needs no change). rand8 makes every INVOCATION's temp
// unique, so two concurrent callers never clobber each other's temp DB. Output is
// hex + "_", satisfying assertSafeName's /^[a-zA-Z0-9_-]+$/. This also fixes the
// latent 63-byte datname overflow of the old `<target>__forking` for long names.
export function forkTempName(target: string): string {
  return `${forkTempPrefix(target)}_${randomBytes(4).toString("hex")}__forking`;
}
