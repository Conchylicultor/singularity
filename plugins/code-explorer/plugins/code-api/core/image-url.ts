import { interpolatePath } from "@plugins/infra/plugins/endpoints/core";
import { getImageContent } from "./endpoints";

/**
 * The URL an `<img>` reads one of a worktree's image files from.
 *
 * A URL rather than a typed fetch, because the endpoint answers with the raw
 * bytes: the consumer is the browser's own image loader, which is handed an
 * address and never a parsed body — which is why `getImageContent` declares no
 * response and is served outside `implement()`.
 *
 * Built from that endpoint's own route rather than from a second spelling of
 * `/api/code/:worktree/image`, so the four surfaces that show a worktree image
 * (a Read tool call, the file-peek pane, a side-by-side image diff, an image in
 * rendered markdown) cannot drift from the route that serves them.
 *
 * `ref` names a git revision to read the file AS OF (the diff's old side); its
 * absence means the file as it is on disk right now.
 */
export function codeImageUrl(
  worktree: string,
  path: string,
  opts: { ref?: string } = {},
): string {
  const query = new URLSearchParams({ path });
  if (opts.ref !== undefined) query.set("ref", opts.ref);
  return `${interpolatePath(getImageContent.path, { worktree })}?${query.toString()}`;
}
