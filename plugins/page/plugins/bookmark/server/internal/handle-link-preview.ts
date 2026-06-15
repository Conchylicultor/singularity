import { implement } from "@plugins/infra/plugins/endpoints/server";
import { linkPreviewEndpoint } from "../../core";
import { scrapeLinkPreview } from "./scrape";

export const handleLinkPreview = implement(linkPreviewEndpoint, async ({ query }) =>
  scrapeLinkPreview(query.url),
);
