import type { ReactElement } from "react";
import { Outlet, Pane, usePaneMatch } from "@plugins/pane/web";
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
  return hasChannel ? <Outlet /> : <LogViewer />;
}

function LogsChannelBody(): ReactElement {
  const { channel } = logChannelPane.useParams();
  return <LogViewer initialChannel={channel} />;
}
