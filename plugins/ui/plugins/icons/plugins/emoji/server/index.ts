import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { defineAssetMirror } from "@plugins/infra/plugins/asset-mirror/server";
import { EMOJIBASE_MIRROR_ID, EMOJIBASE_REMOTE_BASE } from "../shared/mirror";

export default {
  description:
    "Registers the emojibase data mirror so the emoji picker's data is served same-origin (offline-capable after one warm-up) rather than fetched from the CDN by the browser.",
  register: [
    defineAssetMirror({
      id: EMOJIBASE_MIRROR_ID,
      remoteBaseUrl: EMOJIBASE_REMOTE_BASE,
    }),
  ],
} satisfies ServerPluginDefinition;
