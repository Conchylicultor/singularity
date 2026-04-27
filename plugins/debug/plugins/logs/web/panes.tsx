import type { ReactElement } from "react";
import { Outlet, Pane, PaneChrome, usePaneMatch } from "@plugins/pane/web";
import { LogViewer } from "./components/log-viewer";

export const logsPane = Pane.define({
  id: "logs",
  path: "/logs",
  component: LogsBody,
});

export const logChannelPane = Pane.define({
  id: "logs-channel",
  parent: logsPane,
  path: ":channel",
  component: LogsChannelBody,
});

function LogsBody(): ReactElement {
  const match = usePaneMatch();
  const hasChannel = match?.chain.some(
    (e) => e.pane === logChannelPane._internal,
  );
  // Child pane (logChannelPane) renders its own PaneChrome — don't double-wrap.
  if (hasChannel) return <Outlet />;
  return (
    <PaneChrome pane={logsPane} title="Logs">
      <LogViewer />
    </PaneChrome>
  );
}

function LogsChannelBody(): ReactElement {
  const { channel } = logChannelPane.useParams();
  return (
    <PaneChrome pane={logChannelPane} title={`Logs · ${channel}`}>
      <LogViewer initialChannel={channel} />
    </PaneChrome>
  );
}
