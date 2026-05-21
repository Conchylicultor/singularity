import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { ConfigNav } from "../components/config-nav";
import { ConfigDetail } from "../components/config-detail";

export const configNavPane = Pane.define({
  id: "config-v2-nav",
  after: [null],
  segment: "config",
  component: ConfigNavBody,
  chrome: false,
  width: 300,
});

export const configDetailPane = Pane.define({
  id: "config-v2-detail",
  after: [configNavPane],
  segment: "cd/:configPath",
  component: ConfigDetailBody,
  width: 500,
});

function ConfigNavBody() {
  return (
    <PaneChrome pane={configNavPane} title="Config">
      <ConfigNav />
    </PaneChrome>
  );
}

function ConfigDetailBody() {
  return (
    <PaneChrome pane={configDetailPane} title="Config Detail">
      <ConfigDetail />
    </PaneChrome>
  );
}
