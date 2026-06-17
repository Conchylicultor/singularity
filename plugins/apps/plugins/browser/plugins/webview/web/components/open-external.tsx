import { MdOpenInNew } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useBrowserNav } from "@plugins/apps/plugins/browser/plugins/shell/web";

/** Opens the current page in a real new browser tab. Disabled on the start page. */
export function OpenExternal() {
  const { current } = useBrowserNav();
  return (
    <IconButton
      icon={MdOpenInNew}
      label="Open in new tab"
      tooltip="Open in new tab"
      disabled={current === ""}
      onClick={() => {
        if (current !== "") {
          window.open(current, "_blank", "noopener,noreferrer");
        }
      }}
    />
  );
}
