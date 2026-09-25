import type { ReactElement } from "react";
import { MergedDataView } from "@plugins/primitives/plugins/data-view/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import {
  SidebarSources,
  SIDEBAR_VIEW,
  type ConversationSidebarProps,
} from "../host";
import { SIDEBAR_TOOLBAR } from "./sidebar-frame";

/**
 * The conversation sidebar as ONE merged DataView surface: view-instances bind
 * to the contributed sources (Queue, History) via the config rows' `source`
 * key, under a single unified switcher.
 *
 * Wrapped in `<Scroll axis="y" fill>` — the ONE scroll ancestor. The mount
 * point is a `Shell.Sidebar` fill contribution (a flex column cell), the
 * DataView never owns a scroller, and the sticky toolbar / server-query
 * sentinel / row virtualization all bind to this single scroll viewport.
 *
 * The chrome is the sidebar's own ({@link SIDEBAR_TOOLBAR}): one sticky line
 * holding the view switcher as a full-width row and the options trigger. The
 * group headers are `"quiet"` — "Queue 6", with the fold chevron on hover — so
 * they read as captions over the rows rather than as a second band of chrome.
 */
export function ConversationsSidebarDataView(
  props: ConversationSidebarProps,
): ReactElement {
  return (
    <Scroll axis="y" fill className="h-full">
      <MergedDataView
        storageKey={SIDEBAR_VIEW}
        sources={SidebarSources}
        hostProps={props}
        defaultView="queue"
        toolbar={SIDEBAR_TOOLBAR}
        groupHeaders="quiet"
      />
    </Scroll>
  );
}
