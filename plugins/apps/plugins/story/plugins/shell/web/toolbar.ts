import { definePaneToolbar } from "@plugins/primitives/plugins/pane-toolbar/web";

/**
 * The story editor's top toolbar, defined via the PaneToolbar primitive — the
 * sanctioned render-slot header for a pane. `.Start` (left: ← Stories, title) and
 * `.End` (right: view switcher) are both **reorderable** render-slot zones;
 * `storyDetailPane` wires it in via `chrome: { header: StoryToolbar }`, so
 * `PaneChrome` renders the zones as the standard pane header. Hand-rolling a
 * toolbar `<div>` is banned by the `no-adhoc-pane-toolbar` lint rule.
 */
export const StoryToolbar = definePaneToolbar("story.toolbar");
