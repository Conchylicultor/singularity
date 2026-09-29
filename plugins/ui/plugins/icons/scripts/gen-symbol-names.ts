#!/usr/bin/env bun
/**
 * Generates `core/symbol-names.generated.ts` — the `SymbolName` and `BrandName`
 * unions `symbol()` / `brand()` accept — from the installed Iconify JSON sets,
 * and the runtime name list saved names are checked against
 * (`plugins/saved-names/core/internal/symbol-names.json`).
 * Run it after upgrading one of those packages; the `icons:symbol-names-in-sync`
 * check fails until you do.
 *
 * Usage: ./singularity run plugins/ui/plugins/icons/scripts/gen-symbol-names.ts
 */
import { join } from "path";
import { writeGenerated } from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
import {
  SYMBOL_NAMES_REL_PATH,
  SYMBOL_NAME_LIST_REL_PATH,
  renderSymbolNameList,
  brandNames,
  symbolBaseNames,
  installedSetVersions,
  readIconSet,
  renderSymbolNames,
} from "../shared";

const root = await getWorktreeRoot();
const file = join(root, SYMBOL_NAMES_REL_PATH);
const symbols = symbolBaseNames(
  readIconSet("@iconify-json/material-symbols"),
  readIconSet("@iconify-json/material-symbols-light"),
);
const brands = brandNames(readIconSet("@iconify-json/simple-icons"));
await writeGenerated({
  file,
  content: renderSymbolNames({
    versions: installedSetVersions(),
    symbols,
    brands,
  }),
});
await writeGenerated({
  file: join(root, SYMBOL_NAME_LIST_REL_PATH),
  content: renderSymbolNameList({ versions: installedSetVersions(), symbols }),
});
console.log(
  `Generated ${SYMBOL_NAMES_REL_PATH} — ${symbols.length} symbols, ${brands.length} brands`,
);
