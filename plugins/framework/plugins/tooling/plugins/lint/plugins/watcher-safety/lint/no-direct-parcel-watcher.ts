import { ESLintUtils } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/** The single sanctioned chokepoint for loading @parcel/watcher. */
const FILE_WATCHER_DIR = "plugins/infra/plugins/file-watcher/";

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
        "Import `@parcel/watcher` only inside the file-watcher plugin. Use " +
        "`getParcelWatcher()` or `createFileWatcher` from " +
        "`@plugins/infra/plugins/file-watcher/server` so the release's vendored " +
        "native addon (SINGULARITY_PARCEL_WATCHER_NODE) is honored. " +
        "Type-only imports are allowed.",
    },
  },
  defaultOptions: [],
  create(context) {
    const filename = (
      context.filename ??
      context.getFilename?.() ??
      ""
    )
      .split("\\")
      .join("/");
    // The file-watcher plugin owns the native-addon loader chokepoint.
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
