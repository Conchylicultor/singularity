// The download installer kind of infra/deps, host-only like the engine: a
// declaration of pinned files (`download`, in a feature's `deps/index.ts`) and
// the path of one of them once installed (`downloadedFile`, which takes a
// `Ready`).
export { download, downloadedFile } from "./internal/download";
export type {
  DownloadDerive,
  DownloadFile,
  DownloadSource,
} from "./internal/download";
