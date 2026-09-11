import { MdOpenInNew } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { navigate } from "@plugins/apps-core/plugins/tabs/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { queueRoute } from "@plugins/debug/plugins/queue/core";

/** The Job queue row's trailing control: open Debug → Queue, the full list. */
export function OpenQueueAction() {
  return (
    <IconButton
      icon={MdOpenInNew}
      label="Open queue"
      onClick={() => navigate(queueRoute.link(debugApp, {}))}
    />
  );
}
