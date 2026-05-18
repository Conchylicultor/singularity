import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import {
  getConfig,
  getConfigSpecs,
  patchConfig,
  deleteConfig,
} from "../../core/endpoints";
import { config } from "./tables";
import { getRegistry, getField } from "./registry";
import { deleteValue, getAll, setValue } from "./read-cache";
import { configResource } from "./resource";
import {
  CONFIG_SECRETS_NAMESPACE,
  configSecretsResource,
} from "./secrets-resource";
import { deleteSecret, setSecret } from "@plugins/infra/plugins/secrets/server";
import { fullKey, validateKind, normalizeStringList } from "@plugins/config/core";

/** GET /api/config/specs — returns the static spec list for the Settings UI. */
export const handleSpecs = implement(getConfigSpecs, async () => {
  const registry = getRegistry();
  return {
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
  };
});

/** PATCH /api/config — body: { key: string, value: unknown }. */
export const handlePatch = implement(patchConfig, async ({ body }) => {
  const { key, value: rawValue } = body;
  const field = getField(key);
  if (!field) throw new HttpError(404, JSON.stringify({ error: "unknown-key", key }));

  if (field.kind === "secret") {
    if (typeof rawValue !== "string") {
      throw new HttpError(400, JSON.stringify({ error: "invalid-value", key, expected: "string" }));
    }
    const ref = { namespace: CONFIG_SECRETS_NAMESPACE, key };
    if (rawValue === "") {
      await deleteSecret(ref);
    } else {
      await setSecret(ref, rawValue);
    }
    configSecretsResource.notify();
    return { ok: true, key, set: rawValue !== "" };
  }

  let value = rawValue;
  if (field.kind === "string-list" && Array.isArray(value)) {
    value = normalizeStringList(value as string[]);
  }
  if (!validateKind(field.kind, value)) {
    throw new HttpError(400, JSON.stringify({ error: "invalid-value", key, expected: field.kind }));
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
  return { ok: true, key, value };
});

/** DELETE /api/config/:key — resets the field to its default (or clears the secret). */
export const handleDelete = implement(deleteConfig, async ({ params }) => {
  const key = params.key;
  const field = getField(key);
  if (field?.kind === "secret") {
    await deleteSecret({ namespace: CONFIG_SECRETS_NAMESPACE, key });
    configSecretsResource.notify();
    return { ok: true, key };
  }
  await db.delete(config).where(eq(config.key, key));
  deleteValue(key);
  configResource.notify();
  return { ok: true, key };
});

/** GET /api/config — values + specs in one payload (convenience for non-WS clients). */
export const handleGet = implement(getConfig, async () => {
  const map = await getAll();
  return { values: Object.fromEntries(map) };
});
