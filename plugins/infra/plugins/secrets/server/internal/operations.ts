import type { SecretMetadata, SecretRef } from "@plugins/infra/plugins/secrets/shared";
import { isMain } from "./paths";
import {
  deleteLocal,
  getLocal,
  getMetadataLocal,
  hasLocal,
  listKeysLocal,
  setLocal,
} from "./store";
import {
  rpcDelete,
  rpcGet,
  rpcHas,
  rpcList,
  rpcMeta,
  rpcSet,
} from "./unix-rpc/client";

export async function getSecret(ref: SecretRef): Promise<string | undefined> {
  if (isMain()) return getLocal(ref.namespace, ref.key);
  const { value } = await rpcGet(ref);
  return value ?? undefined;
}

export async function setSecret(ref: SecretRef, value: string): Promise<void> {
  if (isMain()) return setLocal(ref.namespace, ref.key, value);
  await rpcSet({ ...ref, value });
}

export async function deleteSecret(ref: SecretRef): Promise<void> {
  if (isMain()) return deleteLocal(ref.namespace, ref.key);
  await rpcDelete(ref);
}

export async function hasSecret(ref: SecretRef): Promise<boolean> {
  if (isMain()) return hasLocal(ref.namespace, ref.key);
  const { has } = await rpcHas(ref);
  return has;
}

export async function getSecretMetadata(
  ref: SecretRef,
): Promise<SecretMetadata> {
  if (isMain()) return getMetadataLocal(ref.namespace, ref.key);
  return rpcMeta(ref);
}

export async function listKeysInNamespace(namespace: string): Promise<string[]> {
  if (isMain()) return listKeysLocal(namespace);
  const { keys } = await rpcList({ namespace });
  return keys;
}
