import { useState } from "react";
import { createPortal } from "react-dom";
import { MdAdsClick } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { ImproveCommands } from "@plugins/improve/web";
import { serializeUiContext } from "../../core";
import { collectMeta } from "../internal/collect-meta";
import { PickerOverlay } from "./picker-overlay";

export function ElementPickerButton() {
  const [active, setActive] = useState(false);

  const onPick = (el: Element) => {
    const meta = collectMeta(el);
    setActive(false);
    ImproveCommands.OpenWithText({ text: serializeUiContext(meta) });
  };

  return (
    <>
      <IconButton
        icon={MdAdsClick}
        label="Pick UI element"
        disabled={active}
        onClick={() => setActive(true)}
      />
      {active &&
        createPortal(
          <PickerOverlay onPick={onPick} onCancel={() => setActive(false)} />,
          document.body,
        )}
    </>
  );
}
