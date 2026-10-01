import { ESLintUtils } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * The single sanctioned chokepoint for loading @parcel/watcher: the
 * file-watcher plugin's engine (`shared/engine.ts`) and its siblings.
 */
const FILE_WATCHER_DIR = "plugins/infra/plugins/file-watcher/shared/";

export default createRule({
  name: "no-direct-parcel-watcher",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow direct @parcel/watcher value-imports outside the file-watcher plugin.",
    },
    schema: [],
    messages: {
      directImport:
        "Import `@parcel/watcher` only inside the file-watcher engine. Declare " +
        "the watcher with `defineFileWatcher` from " +
        "`@plugins/infra/plugins/file-watcher/server` (or `watchForCommand` " +
        "from its `cli` barrel in a foreground command), so the release's " +
        "vendored native addon (SINGULARITY_PARCEL_WATCHER_NODE) is honored " +
        "and the watcher is listed in Background activity. Type-only imports " +
        "are allowed.",
    },
  },
  defaultOptions: [],
  create(context) {
    const filename = (context.filename ?? context.getFilename?.() ?? "")
      .split("\\")
      .join("/");
    // The file-watcher engine owns the native-addon loader chokepoint.
    if (filename.includes(FILE_WATCHER_DIR)) return {};

    return {
      ImportDeclaration(node) {
        // Type-only imports never load the native addon — always allowed.
        if (node.importKind === "type") return;
        const source = node.source.value;
        if (
          source === "@parcel/watcher" ||
          source.startsWith("@parcel/watcher/")
        ) {
          context.report({ node, messageId: "directImport" });
        }
      },
    };
  },
});
