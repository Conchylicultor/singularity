import { useState } from "react";
import { MdAdsClick } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import type { UiContextMeta } from "../../core";
import { collectMeta } from "../internal/collect-meta";
import { PickerOverlay } from "./picker-overlay";

/**
 * The bare "pick a UI element" affordance: an icon button that mounts the
 * inspector overlay and reports the picked element's metadata. The two call
 * sites differ only in what they do with the meta (open the Improve popover vs.
 * inject a chip into the draft form), so the button itself stays agnostic.
 */
export function PickerButton({
  onPick,
  label = "Pick UI element",
}: {
  onPick: (meta: UiContextMeta) => void;
  label?: string;
}) {
  const [active, setActive] = useState(false);

  return (
    <>
      {/* Deliberately NOT `disabled` while active: the overlay already swallows
          the press in the capture phase, and disabling turns the button into a
          `pointer-events:none` element — i.e. unpickable, which is exactly the
          bug that made picking this button report the toolbar wrapper instead. */}
      <IconButton icon={MdAdsClick} label={label} onClick={() => setActive(true)} />
      {active && (
        <PickerOverlay
          onPick={(el) => {
            setActive(false);
            onPick(collectMeta(el));
          }}
          onCancel={() => setActive(false)}
        />
      )}
    </>
  );
}
