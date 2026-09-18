import { implement } from "@plugins/infra/plugins/endpoints/server";
import { previewRewind } from "@plugins/conversations/server";
import { previewRewindEndpoint } from "../../core/endpoints";

export const handlePreviewRewind = implement(
  previewRewindEndpoint,
  ({ params, body }) => previewRewind(params.id, body.uuid),
);
