import { HttpError, implement } from "@plugins/infra/plugins/endpoints/server";
import { createScreenshot } from "../../shared/endpoints";
import { put } from "./store";

export const handleCreate = implement(createScreenshot, async ({ body, params, req }) => {
  const id = params.id;
  if (!id) throw new HttpError(400, "missing id");
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/png")) {
    throw new HttpError(400, "expected content-type: image/png");
  }
  const bytes = new Uint8Array(await body.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new HttpError(400, "empty body");
  }
  put(id, bytes);
  return { id };
});
