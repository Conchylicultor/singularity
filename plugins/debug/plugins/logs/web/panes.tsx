import type { ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { LogViewer } from "./components/log-viewer";

export const logsPane = Pane.define({
  id: "logs",
  segment: "logs",
  component: LogsBody,
});

export const logChannelPane = Pane.define({
  id: "logs-channel",
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
