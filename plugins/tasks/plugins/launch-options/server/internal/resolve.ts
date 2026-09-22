import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import { TaskLaunchServer, type TaskLaunchServerEntry } from "./contribution";

/** One drafted value, parsed by its option's own schema, paired with its entry. */
export interface ResolvedLaunchOption {
  entry: TaskLaunchServerEntry<unknown>;
  value: unknown;
}

/**
 * Resolve drafted launch-option values (keyed by option id) against the
 * registry, for a host to apply once its task exists. THE parse of a drafted
 * value: the registry owns what an id means, so it owns rejecting one too.
 *
 * Call it BEFORE any task exists, so an unknown id or a bad value can't leave a
 * half-filed task behind. An id no plugin claims is a 400 — a client sending it
 * is a real bug, not a setting to drop silently.
 *
 * `where` prefixes every error so the 400 names the input that carried the
 * value (`card 2`, …).
 */
export function resolveLaunchOptions(
  values: Record<string, unknown>,
  where: string,
): ResolvedLaunchOption[] {
  const applies = new Map(
    TaskLaunchServer.getContributions().map((c) => [c.def.id, c]),
  );
  const resolved: ResolvedLaunchOption[] = [];
  for (const [id, raw] of Object.entries(values)) {
    const entry = applies.get(id);
    if (!entry) {
      throw new HttpError(400, `${where}: unknown launch option "${id}"`);
    }
    const parsed = entry.def.schema.safeParse(raw);
    if (!parsed.success) {
      throw new HttpError(
        400,
        `${where}: invalid launch option "${id}": ${parsed.error.message}`,
      );
    }
    resolved.push({ entry, value: parsed.data });
  }
  return resolved;
}
