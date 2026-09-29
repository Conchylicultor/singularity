import {
  Pane,
  PaneChrome,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import { settingsApp } from "@plugins/apps/plugins/settings/plugins/shell/core";
import { DependenciesView } from "./components/dependencies-view";

export const dependenciesRoute = defineRoute({
  id: "dependencies",
  segment: "dependencies",
});

export const dependenciesPane = Pane.define({
  title: "Dependencies",
  route: dependenciesRoute,
  app: settingsApp,
  component: DependenciesBody,
  chrome: { history: true },
});

function DependenciesBody() {
  return (
    <PaneChrome pane={dependenciesPane}>
      <DependenciesView />
    </PaneChrome>
  );
}
