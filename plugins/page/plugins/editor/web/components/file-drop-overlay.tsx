import { MdUploadFile } from "react-icons/md";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * Full-surface drop affordance shown while an OS file is dragged over the block
 * editor (the Slack/Notion-style dimmed scrim): an inset primary ring + a faint
 * tint signal that the editor *as a whole* is a valid drop target, plus a
 * top-pinned hint pill so the action stays discoverable over dense content and
 * empty areas alike. The precise per-row insertion line (rendered inside the
 * blocks, painted above this scrim) keeps showing exactly where the file lands.
 *
 * Rendered as an Overlay `above` layer, so it is `absolute inset-0
 * pointer-events-none` by construction — it never intercepts the native
 * dragover/drop events the container relies on. Always mounted; `active` toggles
 * opacity so the scrim fades in/out rather than popping.
 */
export function FileDropOverlay({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "size-full relative rounded-md bg-primary/5 ring-2 ring-inset ring-primary transition-opacity duration-150",
        active ? "opacity-100" : "opacity-0",
      )}
    >
      <Pin to="top" offset="md" decorative>
        <Badge variant="primary" shape="pill" icon={<MdUploadFile />}>
          Drop file to add to this page
        </Badge>
      </Pin>
    </div>
  );
}
