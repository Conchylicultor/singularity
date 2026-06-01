import type { ConfigProxy } from "./config-proxy";
import { computeHash } from "./config-proxy";
import type { ConfigDescriptor, ConfigValues, FieldsRecord } from "./types";
import type { JsonValue } from "./types";

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
): { conflict: boolean } {
  const up = upstream.read();
  if (!up) return { conflict: false };
  const hash = computeHash(up.content);
  downstreamOrigin.write(up.content, hash);
  if (downstreamOverwrites.exists()) {
    const ow = downstreamOverwrites.read();
    if (ow && ow.hash !== null && ow.hash !== hash) {
      return { conflict: true };
    }
  }
  return { conflict: false };
}

export function readTypedConfig<F extends FieldsRecord>(
  descriptor: ConfigDescriptor<F>,
  origin: ConfigProxy,
  overwrites: ConfigProxy,
): ConfigValues<F> {
  const raw = effective(origin, overwrites);
  const result = descriptor.schema.safeParse(raw);
  if (!result.success) return { ...descriptor.defaults };
  return result.data as ConfigValues<F>;
}
