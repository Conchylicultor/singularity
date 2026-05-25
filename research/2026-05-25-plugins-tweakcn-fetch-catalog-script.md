# tweakcn Community Browser: Dev Script to Fetch & Bundle Catalog

## Context

The tweakcn community browser plugin (`plugins/ui/plugins/tweakcn/plugins/community-browser/`) needs a bundled `catalog.json` containing all themes from two sources: the curated registry (36 themes from GitHub) and the community gallery (~485 user-submitted themes from tweakcn.com). This catalog is the single runtime data source — the UI never fetches themes directly.

The plugin directory doesn't exist yet. This plan covers only the **dev script** and the **minimal shared types** it outputs. The plugin shell, server endpoints, and web UI are separate work.

## Files to Create

```
plugins/ui/plugins/tweakcn/plugins/community-browser/
  package.json
  shared/
    index.ts          — barrel: re-exports types
    types.ts          — CatalogTheme interface
    catalog.json      — generated output (committed)
  scripts/
    fetch-catalog.ts  — the dev script
```

## Implementation

### 1. `shared/types.ts` — CatalogTheme interface

```ts
export interface CatalogTheme {
  id: string;            // slug (registry) or CUID (community)
  name: string;
  tags: string[];        // rich for community; empty for registry
  source: "registry" | "community";
  likeCount?: number;    // community only
  author?: string;       // community only
  cssVars: {
    theme: Record<string, string>;   // mode-independent (radius, fonts)
    light: Record<string, string>;   // light mode CSS vars
    dark: Record<string, string>;    // dark mode CSS vars
  };
}
```

### 2. `shared/index.ts` — barrel

Re-export `CatalogTheme` from `./types.ts`.

### 3. `package.json`

```json
{
  "name": "@singularity/plugin-community-browser",
  "private": true,
  "version": "0.0.1",
  "description": "Community theme browser for tweakcn"
}
```

### 4. `scripts/fetch-catalog.ts` — the dev script

Single file, run with `bun plugins/ui/plugins/tweakcn/plugins/community-browser/scripts/fetch-catalog.ts`.

#### 4a. Fetch registry (stable)

```ts
const REGISTRY_URL = "https://raw.githubusercontent.com/jnsahaj/tweakcn/main/public/r/registry.json";
const registryRaw = await fetch(REGISTRY_URL).then(r => r.json());
```

Registry entries have `{ name, cssVars: { theme, light, dark } }`. Transform each to `CatalogTheme`:
- `id` = entry's `name` (the slug, e.g. `"catppuccin"`)
- `name` = entry's `name` (best available — registry has no separate title)
- `tags` = `[]`
- `source` = `"registry"`
- `cssVars` = passed through directly (already in the right format)

#### 4b. Fetch community (fragile, paginated)

POST to `https://tweakcn.com/community` with:
- Header `Next-Action: 7edf343b3e44853a7703ed4df5826212401090a152`
- Header `Content-Type: text/plain;charset=UTF-8`  
- Body: JSON-encoded arguments array, e.g. `[{"cursor":null,"sort":"newest"}]` or `[{"cursor":"<next>","sort":"newest"}]`

The response is **RSC (React Server Components) wire format**, not plain JSON. The actual data payload is on a line starting with a digit + `:` prefix. Parse by:
1. Split response text by newlines
2. Find lines matching `/^\d+:/`
3. Extract the JSON portion after the prefix
4. The themes array and pagination cursor are inside this parsed object

**Pagination**: Loop until no `nextCursor`. Each page returns ~20 themes. Expect ~25 pages.

**Rate limiting**: Add a small delay (`~200ms`) between pages to be respectful.

Community entries have `{ id, name, likeCount, author, tags, styles: { light, dark } }`. The `styles` format is **flat** — mode-independent values like `radius`, `font-sans`, `font-mono`, `font-serif` appear in both `light` and `dark`.

Transform each to `CatalogTheme`:
- `id`, `name`, `tags`, `likeCount`, `author` = pass through
- `source` = `"community"`  
- `cssVars` = reconstruct three-layer format:

```ts
const MODE_INDEPENDENT_KEYS = ["radius", "font-sans", "font-mono", "font-serif"];

function stylesToCssVars(styles: { light: Record<string, string>; dark: Record<string, string> }) {
  const theme: Record<string, string> = {};
  for (const key of MODE_INDEPENDENT_KEYS) {
    if (key in styles.light) {
      theme[key] = styles.light[key];
    }
  }
  return { theme, light: { ...styles.light }, dark: { ...styles.dark } };
}
```

Note: `spacing` and `tracking-normal` are **not** extracted into `theme` — `convertTweakcnTheme` reads those from `cssVars.light` directly (lines 96-98, 134-137 of `convert.ts`). They stay in `light`/`dark` as-is.

#### 4c. Merge & write

1. Concatenate registry themes + community themes
2. Sort: registry first (alphabetical by name), then community (by `likeCount` descending)
3. Log summary: count per source, total size
4. Write to `shared/catalog.json` with `JSON.stringify(themes, null, 2)`

#### 4d. Error handling

- If registry fetch fails: fatal — log and exit(1)
- If a community page fails: retry up to 3 times with exponential backoff, then skip remaining pages and warn (partial catalog is still useful)
- If the action ID is stale (returns HTML or 404): log a clear message telling the developer to update the action ID constant
- Log progress: `Fetching community page 1/~25...` etc.

### Key files to reference

| File | Why |
|------|-----|
| `plugins/ui/plugins/tweakcn/shared/convert.ts` | Mode-independent key list (lines 92-98, 119-137) — determines which keys go in `theme` vs stay in `light`/`dark` |
| `plugins/ui/plugins/tweakcn/core/endpoints.ts` | `TweakcnThemeSchema` — the DB-stored shape after apply |
| `plugins/ui/plugins/tweakcn/server/internal/handle-import.ts` | Upsert pattern — the future `handle-apply.ts` will mirror this |

## Verification

1. Run the script: `bun plugins/ui/plugins/tweakcn/plugins/community-browser/scripts/fetch-catalog.ts`
2. Check output: `cat plugins/ui/plugins/tweakcn/plugins/community-browser/shared/catalog.json | bun -e "const c = await Bun.file(process.argv[1]).json(); console.log('Total:', c.length, '| Registry:', c.filter(t=>t.source==='registry').length, '| Community:', c.filter(t=>t.source==='community').length)" -- plugins/ui/plugins/tweakcn/plugins/community-browser/shared/catalog.json`
3. Spot-check a registry theme has `cssVars.theme` with `radius`/font keys and `cssVars.light`/`dark` with color keys
4. Spot-check a community theme has the same three-layer `cssVars` structure (not the flat `styles` format)
5. Verify no duplicate IDs: `bun -e "const c = await Bun.file('plugins/ui/plugins/tweakcn/plugins/community-browser/shared/catalog.json').json(); const ids = c.map(t=>t.id); const dupes = ids.filter((id,i) => ids.indexOf(id) !== i); console.log('Dupes:', dupes.length ? dupes : 'none')"`
