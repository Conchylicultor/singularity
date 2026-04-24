import type { SecretMetadata } from "@plugins/secrets/shared";

export const RPC_PATHS = {
  get: "/get",
  set: "/set",
  delete: "/delete",
  has: "/has",
  meta: "/meta",
  list: "/list",
} as const;

export interface GetRequest { namespace: string; key: string; }
export interface GetResponse { value: string | null; }

export interface SetRequest { namespace: string; key: string; value: string; }
export interface SetResponse { ok: true; }

export interface DeleteRequest { namespace: string; key: string; }
export interface DeleteResponse { ok: true; }

export interface HasRequest { namespace: string; key: string; }
export interface HasResponse { has: boolean; }

export interface MetaRequest { namespace: string; key: string; }
export type MetaResponse = SecretMetadata;

export interface ListRequest { namespace: string; }
export interface ListResponse { keys: string[]; }
