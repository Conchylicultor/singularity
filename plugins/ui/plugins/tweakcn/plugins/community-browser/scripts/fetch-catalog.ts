/**
 * Dev script: fetches tweakcn registry + community themes and writes shared/catalog.json.
 *
 * Usage: bun plugins/ui/plugins/tweakcn/plugins/community-browser/scripts/fetch-catalog.ts
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CatalogTheme } from "../shared/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, "../shared/catalog.json");

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const REGISTRY_URL =
  "https://raw.githubusercontent.com/jnsahaj/tweakcn/main/public/r/registry.json";

interface RegistryEntry {
  name: string;
  title?: string;
  cssVars: {
    theme: Record<string, string>;
    light: Record<string, string>;
    dark: Record<string, string>;
  };
}

async function fetchRegistry(): Promise<CatalogTheme[]> {
  console.log("Fetching registry from GitHub...");
  const res = await fetch(REGISTRY_URL);
  if (!res.ok) {
    throw new Error(`Registry fetch failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { items: RegistryEntry[] };
  const entries = json.items;
  console.log(`  Got ${entries.length} registry themes`);

  return entries.map((e) => ({
    id: e.name,
    name: e.title ?? e.name,
    tags: [],
    source: "registry" as const,
    cssVars: e.cssVars,
  }));
}

// ---------------------------------------------------------------------------
// Community (Next.js Server Actions, paginated)
// ---------------------------------------------------------------------------

// This action ID is fragile — it changes on every tweakcn deploy.
// If fetching fails with HTML or 404, grab the new ID from the network tab
// at https://tweakcn.com/community (filter for POST requests with Next-Action header).
const COMMUNITY_ACTION_ID =
  "7edf343b3e44853a7703ed4df5826212401090a152";
const COMMUNITY_URL = "https://tweakcn.com/community";
const PAGE_DELAY_MS = 200;
const MAX_RETRIES = 3;

interface CommunityThemeRaw {
  id: string;
  name: string;
  likeCount: number;
  author: { id: string; name: string; image: string | null };
  tags: string[];
  styles: {
    light: Record<string, string>;
    dark: Record<string, string>;
  };
}

// Keys that convertTweakcnTheme reads from cssVars.theme (mode-independent).
// spacing and tracking-normal are NOT included — the converter reads those
// from cssVars.light directly (convert.ts lines 96-98, 134-137).
const MODE_INDEPENDENT_KEYS = [
  "radius",
  "font-sans",
  "font-mono",
  "font-serif",
];

function stylesToCssVars(styles: {
  light: Record<string, string>;
  dark: Record<string, string>;
}): CatalogTheme["cssVars"] {
  const theme: Record<string, string> = {};
  for (const key of MODE_INDEPENDENT_KEYS) {
    if (key in styles.light) {
      theme[key] = styles.light[key]!;
    }
  }
  return { theme, light: { ...styles.light }, dark: { ...styles.dark } };
}

function extractAuthorName(
  author: CommunityThemeRaw["author"],
): string | undefined {
  return author?.name ?? undefined;
}

function parseRscResponse(text: string): unknown {
  // RSC wire format: lines like "0:{...}" or "1:[...]"
  // We want the last line with a JSON payload — that's typically the data.
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    const match = line.match(/^\d+:(.*)/);
    if (match) {
      try {
        return JSON.parse(match[1]!);
      } catch (err) {
        if (err instanceof SyntaxError) continue;
        throw err;
      }
    }
  }
  throw new Error("No valid JSON found in RSC response");
}

type Cursor = string | number | null;

async function fetchCommunityPage(
  cursor: Cursor,
): Promise<{ themes: CommunityThemeRaw[]; nextCursor: Cursor }> {
  // Positional args: getCommunityThemes(sort, cursor?, limit?, filter?, tags?, timeRange?)
  const args: unknown[] = ["popular"];
  if (cursor != null) args.push(cursor);
  const body = JSON.stringify(args);

  const res = await fetch(COMMUNITY_URL, {
    method: "POST",
    headers: {
      "Next-Action": COMMUNITY_ACTION_ID,
      "Content-Type": "text/plain;charset=UTF-8",
      Accept: "text/x-component",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (text.includes("<!DOCTYPE") || text.includes("<html")) {
      throw new Error(
        `Got HTML instead of RSC data — the action ID is likely stale.\n` +
          `Update COMMUNITY_ACTION_ID in this script. See comment above the constant.`,
      );
    }
    throw new Error(`Community fetch failed: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();

  if (text.includes("<!DOCTYPE") || text.includes("<html")) {
    throw new Error(
      `Got HTML instead of RSC data — the action ID is likely stale.\n` +
        `Update COMMUNITY_ACTION_ID in this script. See comment above the constant.`,
    );
  }

  const parsed = parseRscResponse(text) as {
    themes?: CommunityThemeRaw[];
    nextCursor?: Cursor;
  };

  return {
    themes: parsed.themes ?? [],
    nextCursor: parsed.nextCursor ?? null,
  };
}

async function fetchWithRetry(
  cursor: Cursor,
  attempt = 1,
): Promise<{ themes: CommunityThemeRaw[]; nextCursor: Cursor }> {
  try {
    return await fetchCommunityPage(cursor);
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes("action ID is likely stale")
    ) {
      throw err; // don't retry stale action IDs
    }
    if (attempt >= MAX_RETRIES) throw err;
    const delay = 1000 * 2 ** (attempt - 1);
    console.log(
      `  Retry ${attempt}/${MAX_RETRIES} after ${delay}ms: ${err instanceof Error ? err.message : err}`,
    );
    await new Promise((r) => setTimeout(r, delay));
    return fetchWithRetry(cursor, attempt + 1);
  }
}

async function fetchCommunity(): Promise<CatalogTheme[]> {
  console.log("Fetching community themes from tweakcn.com...");
  const allThemes: CatalogTheme[] = [];
  let cursor: Cursor = null;
  let page = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    page++;
    process.stdout.write(`  Page ${page}...`);

    let result: { themes: CommunityThemeRaw[]; nextCursor: Cursor };
    try {
      result = await fetchWithRetry(cursor);
    } catch (err) {
      console.error(
        `\n  Failed on page ${page}: ${err instanceof Error ? err.message : err}`,
      );
      console.error(`  Stopping community fetch. Got ${allThemes.length} themes so far.`);
      break;
    }

    const converted = result.themes
      .filter((t) => t.styles?.light && t.styles?.dark)
      .map(
        (t): CatalogTheme => ({
          id: t.id,
          name: t.name,
          tags: t.tags ?? [],
          source: "community",
          likeCount: t.likeCount,
          author: extractAuthorName(t.author),
          cssVars: stylesToCssVars(t.styles),
        }),
      );

    allThemes.push(...converted);
    console.log(` ${result.themes.length} themes (total: ${allThemes.length})`);

    if (!result.nextCursor) break;
    cursor = result.nextCursor;

    await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
  }

  console.log(`  Got ${allThemes.length} community themes`);
  return allThemes;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const registry = await fetchRegistry();
  const community = await fetchCommunity();

  // Registry first (alphabetical), then community (by likes descending)
  registry.sort((a, b) => a.name.localeCompare(b.name));
  community.sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0));

  const catalog = [...registry, ...community];

  // Check for duplicate IDs
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const t of catalog) {
    if (seen.has(t.id)) dupes.push(t.id);
    seen.add(t.id);
  }
  if (dupes.length > 0) {
    console.warn(`Warning: ${dupes.length} duplicate IDs: ${dupes.join(", ")}`);
  }

  const json = JSON.stringify(catalog, null, 2);
  await Bun.write(OUTPUT_PATH, json);

  const sizeKb = (Buffer.byteLength(json) / 1024).toFixed(0);
  console.log(
    `\nWrote ${OUTPUT_PATH}\n` +
      `  Registry: ${registry.length} | Community: ${community.length} | Total: ${catalog.length}\n` +
      `  Size: ${sizeKb} KB`,
  );
}

await main();
