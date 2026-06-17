import {
  MdArrowBack,
  MdArrowForward,
  MdRefresh,
  MdHome,
} from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { useBrowserNav } from "@plugins/apps/plugins/browser/plugins/shell/web";

/** Back / forward / reload / home controls in the browser chrome bar. */
export function NavControls() {
  const { canGoBack, canGoForward, back, forward, reload, goHome } =
    useBrowserNav();
  return (
    <Stack direction="row" gap="2xs" align="center">
      <IconButton
        icon={MdArrowBack}
        label="Back"
        tooltip="Back"
        onClick={back}
        disabled={!canGoBack}
      />
      <IconButton
        icon={MdArrowForward}
        label="Forward"
        tooltip="Forward"
        onClick={forward}
        disabled={!canGoForward}
      />
      <IconButton
        icon={MdRefresh}
        label="Reload"
        tooltip="Reload"
        onClick={reload}
      />
      <IconButton icon={MdHome} label="Home" tooltip="Home" onClick={goHome} />
    </Stack>
  );
}
