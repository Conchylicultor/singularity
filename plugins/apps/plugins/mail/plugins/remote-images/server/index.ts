import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { MAIL_IMAGE_PROXY_ROUTE } from "../core";
import { handleMailImage } from "./internal/handle-image";

export default {
  description:
    "SSRF-guarded, image-content-type-restricted proxy for remote email images (GET /api/mail/image?url=). Same-origin; fetches through safeFetch, refuses non-image responses (415), and only ever hit after the user opts into 'Display images' — so it is neither a tracking-pixel leak nor an open proxy.",
  httpRoutes: {
    [MAIL_IMAGE_PROXY_ROUTE]: handleMailImage,
  },
} satisfies ServerPluginDefinition;
