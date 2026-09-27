import type { ReactElement } from "react";
import {
  Pane,
  PaneChrome,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { LogViewer } from "./components/log-viewer";

const logsRoute = defineRoute({
  id: "logs",
  segment: "logs",
});

export const logsPane = Pane.define({
  title: "Logs",
  route: logsRoute,
  app: debugApp,
  component: LogsBody,
});

export const logChannelPane = Pane.define({
  route: defineRoute({
    id: "logs-channel",
    segment: "ch/:channel",
    parent: logsRoute,
  }),
  app: debugApp,
  title: { text: ({ channel }) => `Logs · ${channel}` },
  component: LogsChannelBody,
  resolve: false,
});

function LogsBody(): ReactElement {
  return (
    <PaneChrome pane={logsPane}>
      <LogViewer />
    </PaneChrome>
  );
}

function LogsChannelBody(): ReactElement {
  const { channel } = logChannelPane.useParams();
  return (
    <PaneChrome pane={logChannelPane}>
      <LogViewer initialChannel={channel} />
    </PaneChrome>
  );
}
