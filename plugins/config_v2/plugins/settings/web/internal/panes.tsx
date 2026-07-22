import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { ConfigNav } from "../components/config-nav";
import { ConfigDetail } from "../components/config-detail";

// Route-backed so the panes carry a `.link(app, params)` / `.path(params)`
// builder — the single source of truth for the `/config/cd/:configPath`
// segments. Global chrome (e.g. the config gear baked into a picker rendered in
// the action bar) has no pane surface to navigate, so it builds the app-relative
// URL from `configDetailPane` and hands it to the cross-app `navigate()`.
export const configNavRoute = defineRoute({
  id: "config-v2-nav",
  segment: "config",
});

export const configDetailRoute = defineRoute({
  id: "config-v2-detail",
  segment: "cd/:configPath",
  parent: configNavRoute,
});

export const configNavPane = Pane.define({
  route: configNavRoute,
  component: ConfigNavBody,
  width: 300,
});

export const configDetailPane = Pane.define({
  route: configDetailRoute,
  component: ConfigDetailBody,
  width: 500,
  resolve: false,
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
