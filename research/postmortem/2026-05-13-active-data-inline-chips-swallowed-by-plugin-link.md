# Postmortem: active-data inline chips swallowed by plugin-link

**Date:** 2026-05-13
**Symptom:** All inline active-data chips (task-link, conv, attempt) render as plain `<code>` elements instead of clickable buttons.
**Root cause:** `display:"code"` handler priority over `display:"inline"` in `ActiveDataMarkdownEnhancer.inlineCode`.
**Fix:** One-line swap in `plugins/active-data/web/internal/markdown-enhancer.tsx` — check inline patterns before code patterns.

## What happened

The `plugin-link` plugin contributes a `display: "code"` active-data tag with `PLUGIN_NAME_RE` — a regex broad enough to match any kebab-case string (`[a-z][a-z0-9-]*`). This is by design: the pattern casts a wide net and the `PluginLinkChip` component validates at render time against the real plugin tree, rendering a fallback `<code>` when the text isn't a known plugin.

In `ActiveDataMarkdownEnhancer.inlineCode`, `display:"code"` patterns were checked **before** `display:"inline"` patterns. So for backtick-wrapped text like `` `task-1778630172375-jeg0hc` ``:

1. `PLUGIN_NAME_RE` matches the full text (it's valid kebab-case)
2. Handler returns `<PluginLinkChip content="task-..." />`
3. React renders `PluginLinkChip`, which doesn't find "task-1778630172375-jeg0hc" in the plugin tree
4. Component renders a fallback `<code>` element
5. The `display:"inline"` patterns (task-link, conv, attempt) never get a chance to run

The handler returns a ReactElement (always truthy), so the code component override exits immediately — it can't know the element will render as a fallback.

## Why it was hard to find

Every individual code path looked correct when read in isolation:

- The regexes all match the expected IDs (confirmed via Node.js)
- Plugins load correctly (confirmed via fiber inspection — 173 plugins, 42 slots)
- The enhancement context stacks properly (4 enhancers, 2 transforms, 2 handlers)
- The `MarkdownEnhancementContext` provider nearest each `<code>` fiber has the right handler count

Static code analysis said "this should work." The bug was a runtime interaction between two `display` modes competing for the same inline code text, with the wrong one winning.

## What cracked it

**React fiber tree inspection via Playwright** — no rebuild needed.

After confirming the slot contributions and enhancement context were correct, I traced the exact fiber parent chain from the root to one of the `<code>` elements:

```
depth 87: code     (typeOf: function)  ← ReactMarkdown's code component override
depth 88: z        (typeOf: function)  ← mystery component
depth 89: code     (typeOf: string)    ← the HTML <code> element we see in the DOM
```

The `z` at depth 88 was unexpected — the `code` override should directly render `<code>`, not wrap it in another component. Inspecting `z`'s source via `fiber.type.toString()` revealed minified `PluginLinkChip` code: it fetches `/api/plugin-view/tree`, tries to match the text, and falls back to `<code>` on miss.

## Debugging steps (what worked, what didn't)

### Productive steps

1. **Playwright DOM queries** (no rebuild): `page.$$eval('code', ...)` and `page.$$eval('button', ...)` confirmed 0 chip buttons and 6 plain `<code>` elements for all ID types. Showed the issue was systemic (all chip types), not regex-specific.

2. **Fiber tree context inspection** (no rebuild): walked the fiber tree to find `PluginRuntimeContext` and `MarkdownEnhancementContext` providers. Confirmed all slot contributions were registered and the handler chain was correctly stacked. Ruled out plugin loading, slot registration, and context stacking.

3. **Fiber parent chain trace** (the breakthrough): traced the exact chain to the `<code>` element, spotted the mystery `z` component, and identified it as `PluginLinkChip` via `.toString()` on the minified function.

### Dead ends

- **Regex testing** — all patterns match correctly. Don't spend time here.
- **Plugin loading investigation** — `loadPlugins` uses `Promise.allSettled`; all plugins load before `PluginProvider` renders. Contributions are always present.
- **Enhancement context stacking** — the wrapper-component pattern and `useMarkdownEnhancement` work correctly.
- **Adding `console.log` + rebuilding** — works but slow (~10s per rebuild). The fiber scripts are faster and don't modify source. One debug log was accidentally left in a file that the user then had to reject.

## Technique: fiber tree inspection via Playwright

```js
const root = document.getElementById('root');
const key = Object.keys(root).find(k => k.startsWith('__reactContainer$'));
const fiber = root[key];

// Walk fibers
function walk(fiber, depth = 0) {
  if (!fiber || depth > 500) return;
  // fiber.type — string ("div", "code") for HTML, function for components
  // fiber.memoizedProps — current props; for context Providers, .value has the context
  // fiber.type.toString() — source of a component function (minified but readable)
  // fiber.child / fiber.sibling — tree traversal
  let child = fiber.child;
  while (child) { walk(child, depth + 1); child = child.sibling; }
}
```

Key patterns:
- **Find a context provider:** look for `fiber.memoizedProps.value` with the expected shape (e.g. `{ inlineCodeHandlers: [...] }`)
- **Identify a minified component:** `fiber.type.toString().substring(0, 500)` shows the source — look for fetch URLs, prop names, or API patterns
- **Trace a parent chain:** record `{ type, depth }` for each ancestor from root to the target element

## Lesson

When a broad-pattern `display:"code"` contribution is added, it must run AFTER specific `display:"inline"` patterns in the `inlineCode` handler. The current order (inline first, code second) is load-bearing — the comment in `markdown-enhancer.tsx` explains why.
