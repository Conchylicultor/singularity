import type { ReactNode } from "react";
import { MdOpenInNew } from "react-icons/md";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useEventSourceOrigin } from "@plugins/apps/plugins/events/plugins/events-core/web";
import type { EventSource } from "@plugins/apps/plugins/events/plugins/events-core/core";

/**
 * Open the page this source stands for, in a new browser tab.
 *
 * The one row action that answers "what IS this source?" — everything else on
 * the row describes the app's relationship to it (is it on, when did it last
 * run, is it healthy), and none of that tells you which web page you actually
 * pointed it at. Opening it is also how you check the app against reality: the
 * source says it extracted nothing, so you go look at the page.
 *
 * It names no source type. The destination comes from `useEventSourceOrigin`,
 * which asks the type registry — so a source type that stands for a page gets
 * this action for free, and one that does not (`manual`: the user IS the
 * extractor) renders nothing here rather than a dead button. That absence is
 * the honest answer, and it costs the row nothing: the cluster is hover-revealed
 * and lays out from whatever it holds.
 *
 * A real `<a>`, not a button with a `window.open` handler, and the difference is
 * visible: the browser previews the destination in its status bar on hover, and
 * its own link gestures work — copy the address, open it in this tab with a
 * modifier, drag it to the bookmarks bar. Nothing here has to reimplement any of
 * that. The href is already gated to `http(s)` by `useEventSourceOrigin`.
 *
 * The surrounding `RowActions` cluster stops the click, so opening the page
 * never also opens the source's detail pane behind it.
 */
export function SourceOpenAction({
  row,
}: ItemActionProps<EventSource>): ReactNode {
  const originOf = useEventSourceOrigin();
  const href = originOf(row);
  if (href === null) return null;

  return (
    <IconButton
      icon={MdOpenInNew}
      label="Open source page"
      render={<a href={href} target="_blank" rel="noreferrer noopener" />}
    />
  );
}
