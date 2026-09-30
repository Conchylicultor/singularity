// The build installer kind of infra/deps, host-only like the engine: a
// declaration of something built from this checkout's own source (`build`, in
// a feature's `deps/index.ts`) and the path of its output once installed
// (`builtFile`, which takes a `Ready`).
export { build, builtFile } from "./internal/build";
export type {
  BuildContext,
  BuildSource,
  BuildTargets,
  BuildTool,
} from "./internal/build";
