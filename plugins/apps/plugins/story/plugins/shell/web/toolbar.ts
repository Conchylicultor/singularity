import { definePaneToolbar } from "@plugins/primitives/plugins/pane-toolbar/web";

/**
 * The story editor's top toolbar, hosted by the PaneToolbar primitive — the
 * sanctioned render-slot header host for full-surface (`chrome: false`) panes.
 * `.Start` (left: ← Stories, title) and `.End` (right: view switcher) are both
 * **reorderable** render-slot zones; the editor surface renders `.Host`.
 * Hand-rolling a toolbar `<div>` is banned by the `no-adhoc-pane-toolbar` lint
 * rule.
 */
export const StoryToolbar = definePaneToolbar("story.toolbar");
