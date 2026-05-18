import { implement } from "@plugins/infra/plugins/endpoints/core";
import {
  secretsGet,
  secretsSet,
  secretsDelete,
  secretsHas,
  secretsMeta,
  secretsList,
} from "@plugins/infra/plugins/secrets/core";
import {
  deleteLocal,
  getLocal,
  getMetadataLocal,
  hasLocal,
  listKeysLocal,
  setLocal,
} from "./store";

export const handleGet = implement(secretsGet, async ({ body }) => {
  const value = getLocal(body.namespace, body.key);
  return { value: value ?? null };
});

export const handleSet = implement(secretsSet, async ({ body }) => {
  await setLocal(body.namespace, body.key, body.value);
  return { ok: true };
});

export const handleDelete = implement(secretsDelete, async ({ body }) => {
  await deleteLocal(body.namespace, body.key);
  return { ok: true };
});

export const handleHas = implement(secretsHas, async ({ body }) => {
  return { has: hasLocal(body.namespace, body.key) };
});

export const handleMeta = implement(secretsMeta, async ({ body }) => {
  return getMetadataLocal(body.namespace, body.key);
});

export const handleList = implement(secretsList, async ({ body }) => {
  return { keys: listKeysLocal(body.namespace) };
});
