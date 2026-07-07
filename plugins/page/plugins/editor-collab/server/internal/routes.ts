import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { blockDocInit, blockDocUpdate } from "../../core";
import { initBlockDoc, mergeBlockDocUpdate, stateToBase64 } from "./doc-store";

export const handleBlockDocInit = implement(blockDocInit, async ({ params, body }) => {
  const proposed = new Uint8Array(await body.arrayBuffer());
  const authoritative = await initBlockDoc(db, params.id, proposed);
  return { state: stateToBase64(authoritative) };
});

export const handleBlockDocUpdate = implement(blockDocUpdate, async ({ params, body }) => {
  const update = new Uint8Array(await body.arrayBuffer());
  await mergeBlockDocUpdate(db, params.id, update);
});
