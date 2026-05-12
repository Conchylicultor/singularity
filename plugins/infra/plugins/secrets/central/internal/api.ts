// In-process API for other central plugins. The HTTP routes in `handlers.ts`
// handle calls from worktree backends through the gateway; sibling central
// plugins (auth) skip the round-trip and call these wrappers directly.
//
// Each operation awaits `ready` before touching the store so a caller's
// onReady can run in any order relative to secrets's onReady.

import type { SecretMetadata, SecretRef } from "@plugins/infra/plugins/secrets/core";
import { ready } from "./boot";
import {
  deleteLocal,
  getLocal,
  getMetadataLocal,
  hasLocal,
  listKeysLocal,
  setLocal,
} from "./store";

export async function getSecret(ref: SecretRef): Promise<string | undefined> {
  await ready;
  return getLocal(ref.namespace, ref.key);
}

export async function setSecret(ref: SecretRef, value: string): Promise<void> {
  await ready;
  await setLocal(ref.namespace, ref.key, value);
}

export async function deleteSecret(ref: SecretRef): Promise<void> {
  await ready;
  await deleteLocal(ref.namespace, ref.key);
}

export async function hasSecret(ref: SecretRef): Promise<boolean> {
  await ready;
  return hasLocal(ref.namespace, ref.key);
}

export async function getSecretMetadata(ref: SecretRef): Promise<SecretMetadata> {
  await ready;
  return getMetadataLocal(ref.namespace, ref.key);
}

export async function listKeysInNamespace(namespace: string): Promise<string[]> {
  await ready;
  return listKeysLocal(namespace);
}
