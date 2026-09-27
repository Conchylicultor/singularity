import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useBrowserNav } from "@plugins/apps/plugins/browser/plugins/shell/web";
import { symbol } from "@plugins/ui/plugins/icons/core";

const openInNewIcon = symbol("open-in-new");

/** Opens the current page in the user's real system browser. Disabled on the start page. */
export function OpenExternal() {
  const { current } = useBrowserNav();
  return (
    <IconButton
      icon={openInNewIcon}
      label="Open in system browser"
      tooltip="Open in system browser"
      disabled={current === ""}
      onClick={() => {
        if (current !== "") {
          window.open(current, "_blank", "noopener,noreferrer");
        }
      }}
    />
  );
}
