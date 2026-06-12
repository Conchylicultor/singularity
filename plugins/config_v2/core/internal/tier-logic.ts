import type { ConfigProxy } from "./config-proxy";
import { computeHash } from "./config-proxy";
import type { ConfigDescriptor, ConfigValues, FieldsRecord } from "./types";
import type { JsonValue } from "./types";
import type { ConfigV2ValidationIssue } from "./resource";

export function effective(
  origin: ConfigProxy,
  overwrites: ConfigProxy,
): JsonValue | undefined {
  const originData = origin.read();
  if (overwrites.exists()) {
    const ow = overwrites.read();
    if (ow) {
      // On a hash conflict the override was written against a now-stale
      // origin, so the origin takes precedence until the user manually
      // reconciles the override (acknowledge-conflict rewrites the hash,
      // after which the override wins again). With no origin to defer to,
      // the override still stands.
      const stale =
        originData !== null &&
        ow.hash !== null &&
        ow.hash !== computeHash(originData.content);
      if (!stale) return ow.content;
    }
  }
  if (!originData) return undefined;
  return originData.content;
}

export function hasConflict(
  origin: ConfigProxy,
  overwrites: ConfigProxy,
): boolean {
  if (!overwrites.exists()) return false;
  const ow = overwrites.read();
  if (!ow || ow.hash === null) return false;
  const originData = origin.read();
  if (!originData) return true;
  return ow.hash !== computeHash(originData.content);
}

export function propagate(
  upstream: ConfigProxy,
  downstreamOrigin: ConfigProxy,
  downstreamOverwrites: ConfigProxy,
  ancestor?: ConfigProxy,
): { conflict: boolean } {
  const up = upstream.read();
  if (!up) return { conflict: false };
  const hash = computeHash(up.content);

  // Snapshot the merge base BEFORE overwriting the origin. The override was
  // written against the origin currently on disk; once we propagate the new
  // upstream, that ancestor content is gone (only its hash survives in the
  // override header). Capture it precisely at the transition moment — the
  // override is still in sync with the origin (`oldOrigin.hash === ow.hash`)
  // but the new upstream will make it stale (`ow.hash !== hash`) — so a later
  // three-way merge has a real base. Naturally idempotent across repeated
  // builds: once the override is stale, `oldOrigin.hash !== ow.hash`, so we
  // never clobber the true base with an intermediate origin.
  if (ancestor) {
    const oldOrigin = downstreamOrigin.read();
    const ow = downstreamOverwrites.exists() ? downstreamOverwrites.read() : null;
    if (
      ow &&
      ow.hash !== null &&
      oldOrigin &&
      oldOrigin.hash === ow.hash &&
      ow.hash !== hash
    ) {
      ancestor.write(oldOrigin.content, oldOrigin.hash);
    }
  }

  downstreamOrigin.write(up.content, hash);
  if (downstreamOverwrites.exists()) {
    const ow = downstreamOverwrites.read();
    if (ow && ow.hash !== null && ow.hash !== hash) {
      return { conflict: true };
    }
  }
  return { conflict: false };
}

// Per-field three-way merge of a config document. `base` is the origin the
// override was written against (the ancestor snapshot); `ours` is the user
// override; `theirs` is the new origin. A field only one side changed takes
// that side; a field both sides changed identically agrees; a field both sides
// changed differently is a true conflict — left as `ours` (a tentative pick)
// and reported in `conflicts` for the user to resolve. Equality is structural
// JSON equality, matching the rest of config_v2's change detection.
export function threeWayMerge(
  base: Record<string, JsonValue>,
  ours: Record<string, JsonValue>,
  theirs: Record<string, JsonValue>,
): { merged: Record<string, JsonValue>; conflicts: string[] } {
  const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const merged: Record<string, JsonValue> = {};
  const conflicts: string[] = [];
  const keys = new Set([
    ...Object.keys(base),
    ...Object.keys(ours),
    ...Object.keys(theirs),
  ]);
  for (const key of keys) {
    const b = base[key];
    const o = ours[key];
    const t = theirs[key];
    const oursChanged = !eq(o, b);
    const theirsChanged = !eq(t, b);
    if (!oursChanged) {
      merged[key] = t as JsonValue;
    } else if (!theirsChanged) {
      merged[key] = o as JsonValue;
    } else if (eq(o, t)) {
      merged[key] = o as JsonValue;
    } else {
      merged[key] = o as JsonValue;
      conflicts.push(key);
    }
  }
  return { merged, conflicts };
}

export function readTypedConfig<F extends FieldsRecord>(
  descriptor: ConfigDescriptor<F>,
  origin: ConfigProxy,
  overwrites: ConfigProxy,
): ConfigValues<F> {
  const raw = effective(origin, overwrites);
  // No document on disk at all is the legitimate "use defaults" case, not a
  // validation failure — resolve silently.
  if (raw === undefined) return { ...descriptor.defaults };
  const result = descriptor.schema.safeParse(raw);
  if (!result.success) {
    // Fail loud in logs, but keep the app alive by resolving to defaults — the
    // UI surfaces this as an "invalid" conflict (see validationIssues +
    // computeAllConflicts) so the user can reset or fix the stored document.
    console.warn(
      `[config-v2] stored config for "${descriptor.name}" failed validation; ` +
        `resolving to defaults. Issues: ${result.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ")}`,
    );
    return { ...descriptor.defaults };
  }
  return result.data as ConfigValues<F>;
}

// Human-readable issues if the effective document fails the descriptor schema
// even after default-backfill; null when it parses. Mirrors hasConflict: a pure
// predicate the server re-runs to populate the conflicts resource.
export function validationIssues(
  descriptor: ConfigDescriptor,
  origin: ConfigProxy,
  overwrites: ConfigProxy,
): ConfigV2ValidationIssue[] | null {
  const raw = effective(origin, overwrites);
  if (raw === undefined) return null; // absent document ≠ invalid
  const result = descriptor.schema.safeParse(raw);
  if (result.success) return null;
  // Keep the zod path as an array so the UI can drill the offending value out of
  // the stored document; readTypedConfig joins it inline only for its warn log.
  return result.error.issues.map((i) => ({ path: [...i.path], message: i.message }));
}
