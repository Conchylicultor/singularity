import { MdAutoAwesome } from "react-icons/md";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

/**
 * The prompt block's leading glyph, contributed as `chrome.regions.start` — the
 * inline-before region, i.e. the shared marker gutter. It replaces the handle's
 * static marker ladder for this type.
 *
 * Static and editor-independent, so it renders identically on the read-only
 * surfaces (version-history preview, the public site): a prompt still *looks*
 * like a prompt in a snapshot, it just cannot be launched from one.
 */
export function PromptMarker() {
  return (
    <Text as="span" variant="body" tone="muted" aria-hidden className="py-xs">
      <MdAutoAwesome className="icon-auto" />
    </Text>
  );
}
