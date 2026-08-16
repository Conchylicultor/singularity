import type { ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { LogViewer } from "./components/log-viewer";

export const logsPane = Pane.define({
  id: "logs",
  app: debugApp,
  segment: "logs",
  component: LogsBody,
});

export const logChannelPane = Pane.define({
  id: "logs-channel",
  app: debugApp,
  defaultAncestors: [logsPane],
  segment: "ch/:channel",
  component: LogsChannelBody,
  resolve: false,
});

function LogsBody(): ReactElement {
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
