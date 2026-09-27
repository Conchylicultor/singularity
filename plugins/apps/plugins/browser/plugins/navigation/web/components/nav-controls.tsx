import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { useBrowserNav } from "@plugins/apps/plugins/browser/plugins/shell/web";
import { symbol } from "@plugins/ui/plugins/icons/core";

const arrowBackIcon = symbol("arrow-back");
const arrowForwardIcon = symbol("arrow-forward");
const refreshIcon = symbol("refresh");
const homeIcon = symbol("home");

/** Back / forward / reload / home controls in the browser chrome bar. */
export function NavControls() {
  const { canGoBack, canGoForward, back, forward, reload, goHome } =
    useBrowserNav();
  return (
    <Stack direction="row" gap="2xs" align="center">
      <IconButton
        icon={arrowBackIcon}
        label="Back"
        tooltip="Back"
        onClick={back}
        disabled={!canGoBack}
      />
      <IconButton
        icon={arrowForwardIcon}
        label="Forward"
        tooltip="Forward"
        onClick={forward}
        disabled={!canGoForward}
      />
      <IconButton
        icon={refreshIcon}
        label="Reload"
        tooltip="Reload"
        onClick={reload}
      />
      <IconButton
        icon={homeIcon}
        label="Home"
        tooltip="Home"
        onClick={goHome}
      />
    </Stack>
  );
}
