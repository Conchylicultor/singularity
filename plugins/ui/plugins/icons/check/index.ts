import { existsSync, readFileSync } from "fs";
import { join, relative } from "path";
import type { Check } from "@plugins/framework/plugins/tooling/core";
import {
  formatGenerated,
  iconManifestPath,
  renderIconManifest,
} from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
import type { IconifyJSON } from "@iconify/types";
import {
  SETI_JSON_REL_PATH,
  SETI_LICENSE_REL_PATH,
  SETI_NAMES_REL_PATH,
  SYMBOL_NAMES_REL_PATH,
  SYMBOL_NAME_LIST_REL_PATH,
  installedSetVersions,
  readListInputsHash,
  readInputsHash,
  readSetiIdentity,
  renderSetiNames,
  setiIdentity,
  symbolNamesInputsHash,
} from "../shared";

const REGEN_NAMES =
  "Run `./singularity run plugins/ui/plugins/icons/scripts/gen-symbol-names.ts` and commit the result.";

const symbolNamesInSync: Check = {
  id: "icons:symbol-names-in-sync",
  description:
    "icons/core/symbol-names.generated.ts and the saved-names runtime list were generated from the installed @iconify-json sets",
  async run() {
    const root = await getWorktreeRoot();
    const expected = symbolNamesInputsHash(installedSetVersions());
    for (const [rel, read] of [
      [SYMBOL_NAMES_REL_PATH, readInputsHash],
      [SYMBOL_NAME_LIST_REL_PATH, readListInputsHash],
    ] as const) {
      const file = join(root, rel);
      if (!existsSync(file)) {
        return { ok: false, message: `${rel} is missing`, hint: REGEN_NAMES };
      }
      const stamped = read(readFileSync(file, "utf8"));
      if (stamped !== expected) {
        return {
          ok: false,
          message: `${rel} is stale (file=${stamped ?? "none"}, installed=${expected})`,
          hint: REGEN_NAMES,
        };
      }
    }
    return { ok: true };
  },
};

const manifestInSync: Check = {
  id: "icons:manifest-in-sync",
  description:
    'icons/core/icon-manifest.generated.ts lists every symbol("…") / brand("…") / seti("…") literal in the repo',
  async run() {
    const root = await getWorktreeRoot();
    const file = iconManifestPath(root);
    const rel = relative(root, file);
    // A non-literal icon name is a scan failure, reported as the check's message.
    let expected: string;
    try {
      expected = await renderIconManifest(root);
    } catch (err) {
      return {
        ok: false,
        message: `the icon manifest cannot be built: ${err instanceof Error ? err.message : String(err)}`,
        hint: "Pass a string literal to symbol() / brand() / seti().",
      };
    }
    if (!existsSync(file)) {
      return {
        ok: false,
        message: `${rel} is missing`,
        hint: "Run `./singularity build` to generate it.",
      };
    }
    if (
      readFileSync(file, "utf8") !==
      (await formatGenerated({ file, content: expected }))
    ) {
      return {
        ok: false,
        message: `${rel} is out of sync with the symbol()/brand() literals in the repo`,
        hint: "Run `./singularity build` and commit the regenerated file.",
      };
    }
    return { ok: true };
  },
};

const REVENDOR_SETI =
  "Run `./singularity run plugins/ui/plugins/icons/scripts/vendor-seti.ts` and commit the result.";

const setiInSync: Check = {
  id: "icons:seti-in-sync",
  description:
    "the vendored Seti set, its license and core/seti-names.generated.ts were produced by scripts/vendor-seti.ts from the commit pinned in shared/seti.ts",
  async run() {
    const root = await getWorktreeRoot();
    for (const rel of [
      SETI_JSON_REL_PATH,
      SETI_LICENSE_REL_PATH,
      SETI_NAMES_REL_PATH,
    ]) {
      if (!existsSync(join(root, rel))) {
        return { ok: false, message: `${rel} is missing`, hint: REVENDOR_SETI };
      }
    }
    const set = JSON.parse(
      readFileSync(join(root, SETI_JSON_REL_PATH), "utf8"),
    ) as IconifyJSON;
    const stamped = readSetiIdentity(set);
    if (stamped !== setiIdentity()) {
      return {
        ok: false,
        message: `${SETI_JSON_REL_PATH} is stale (file=${stamped ?? "none"}, pinned=${setiIdentity()})`,
        hint: REVENDOR_SETI,
      };
    }
    const file = join(root, SETI_NAMES_REL_PATH);
    const expected = await formatGenerated({
      file,
      content: renderSetiNames(Object.keys(set.icons)),
    });
    if (readFileSync(file, "utf8") !== expected) {
      return {
        ok: false,
        message: `${SETI_NAMES_REL_PATH} does not list the vendored Seti glyphs`,
        hint: REVENDOR_SETI,
      };
    }
    return { ok: true };
  },
};

export default [symbolNamesInSync, manifestInSync, setiInSync];
