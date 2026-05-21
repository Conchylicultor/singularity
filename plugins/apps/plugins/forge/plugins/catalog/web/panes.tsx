import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { CatalogView } from "./components/catalog-view";

export const catalogPane = Pane.define({
  id: "catalog",
  segment: "catalog",
  component: CatalogBody,
  chrome: false,
  width: 700,
});

function CatalogBody() {
  return (
    <PaneChrome pane={catalogPane} title="Catalog">
      <CatalogView />
    </PaneChrome>
  );
}
