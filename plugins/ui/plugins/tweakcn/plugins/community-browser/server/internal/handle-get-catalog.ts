import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getCatalog } from "../../core/endpoints";
import { loadCatalog } from "./load-catalog";

export const handleGetCatalog = implement(getCatalog, async () => {
  return { themes: await loadCatalog() };
});
