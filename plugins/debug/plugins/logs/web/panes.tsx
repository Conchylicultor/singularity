import type { ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { LogViewer } from "./components/log-viewer";

const logsRoute = defineRoute({
  id: "logs",
  segment: "logs",
});

export const logsPane = Pane.define({
  route: logsRoute,
  app: debugApp,
  component: LogsBody,
});

const logChannelRoute = defineRoute({
  id: "logs-channel",
  segment: "ch/:channel",
  parent: logsRoute,
});

export const logChannelPane = Pane.define({
  route: logChannelRoute,
  app: debugApp,
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
