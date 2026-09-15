import noCrossRuntimeImport from "./no-cross-runtime-import";
import noDeepOwnFolderImport from "./no-deep-own-folder-import";

export default {
  name: "runtime-isolation",
  rules: {
    "no-cross-runtime-import": noCrossRuntimeImport,
    "no-deep-own-folder-import": noDeepOwnFolderImport,
  },
};
