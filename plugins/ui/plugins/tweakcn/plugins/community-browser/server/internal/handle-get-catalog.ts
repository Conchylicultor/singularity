import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getCatalog } from "../../core/endpoints";
import catalog from "../../shared/catalog.json";
import type { CatalogTheme } from "../../shared/types";

export const handleGetCatalog = implement(getCatalog, async () => {
  return { themes: catalog as CatalogTheme[] };
});
