import { HttpError, implement } from "@plugins/infra/plugins/endpoints/server";
import { SsrfError } from "@plugins/infra/plugins/safe-fetch/server";
import { linkPreviewEndpoint } from "../../core";
import { scrapeLinkPreview } from "./scrape";

export const handleLinkPreview = implement(linkPreviewEndpoint, async ({ query }) => {
  try {
    return await scrapeLinkPreview(query.url);
  } catch (err) {
    if (err instanceof SsrfError) throw new HttpError(400, err.message);
    throw err;
  }
});
