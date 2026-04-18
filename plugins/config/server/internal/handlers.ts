import { eq } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { config } from "../schema";
import { getRegistry, getField } from "./registry";
import { deleteValue, getAll, setValue } from "./read-cache";
import { configResource } from "./resource";
import { fullKey, validateKind, normalizeStringList } from "@plugins/config/shared";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** GET /api/config/specs — returns the static spec list for the Settings UI. */
export async function handleSpecs(): Promise<Response> {
  const registry = getRegistry();
  return json({
    plugins: registry.map((p) => ({
      pluginId: p.pluginId,
      pluginName: p.pluginName,
      pluginDescription: p.pluginDescription,
      fields: p.fields.map((f) => ({
        key: f.key,
        fullKey: fullKey(p.pluginId, f.key),
        label: f.label,
        description: f.description,
        kind: f.kind,
        default: f.default,
      })),
    })),
  });
}

/** PATCH /api/config — body: { key: string, value: unknown }. */
export async function handlePatch(req: Request): Promise<Response> {
  let body: { key?: string; value?: unknown };
  try {
    body = (await req.json()) as { key?: string; value?: unknown };
  } catch {
    return json({ error: "invalid-json" }, 400);
  }
  const key = body.key;
  if (!key) return json({ error: "missing-key" }, 400);
  const field = getField(key);
  if (!field) return json({ error: "unknown-key", key }, 404);

  let value = body.value;
  if (field.kind === "string-list" && Array.isArray(value)) {
    value = normalizeStringList(value as string[]);
  }
  if (!validateKind(field.kind, value)) {
    return json({ error: "invalid-value", key, expected: field.kind }, 400);
  }

  await db
    .insert(config)
    .values({ key, value: value as object })
    .onConflictDoUpdate({
      target: config.key,
      set: { value: value as object, updatedAt: new Date() },
    });

  setValue(key, value);
  configResource.notify();
  return json({ ok: true, key, value });
}

/** DELETE /api/config/:key — resets the field to its default. */
export async function handleDelete(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const key = params.key;
  if (!key) return json({ error: "missing-key" }, 400);
  await db.delete(config).where(eq(config.key, key));
  deleteValue(key);
  configResource.notify();
  return json({ ok: true, key });
}

/** GET /api/config — values + specs in one payload (convenience for non-WS clients). */
export async function handleGet(): Promise<Response> {
  const map = await getAll();
  return json({ values: Object.fromEntries(map) });
}
