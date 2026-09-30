import { defineAssetMirrorPrewarm } from "@plugins/infra/plugins/asset-mirror/core";
import {
  EMOJIBASE_FILES,
  EMOJIBASE_MIRROR_ID,
  EMOJIBASE_REMOTE_BASE,
} from "../shared/mirror";

/**
 * Prewarm seed for the emojibase mirror: the two files the picker requests, so
 * a release opens the emoji picker offline on a cold start.
 */
export default defineAssetMirrorPrewarm({
  id: EMOJIBASE_MIRROR_ID,
  remoteBaseUrl: EMOJIBASE_REMOTE_BASE,
  files: EMOJIBASE_FILES,
});
