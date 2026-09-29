import { useEffect, useLayoutEffect, useState } from "react";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useLive } from "@plugins/network/plugins/live/web";
import {
  BRANDS_SPRITE,
  isStyleKey,
  type SpriteKey,
  type StyleKey,
} from "@plugins/ui/plugins/icons/core";
import {
  IconSpriteSheet,
  hasSprite,
  installRuntimeSymbolLoader,
  provideRuntimeSymbols,
  provideSprite,
  useWantedStyleKeys,
} from "@plugins/ui/plugins/icons/web";
import {
  residentSprites,
  runtimeSymbolsEndpoint,
  savedIconSprites,
  spriteEndpoint,
  type IconSprites,
  type SavedIconSprites,
} from "../../core";
import { createRuntimeSymbolLoader } from "./runtime-symbol-loader";

function spriteKey(key: string): SpriteKey {
  if (key === BRANDS_SPRITE || isStyleKey(key)) return key;
  throw new Error(`[icons] the server sent an unknown sprite key "${key}"`);
}

// Sprites being fetched, page-wide: a re-render never starts a second request
// for the same key.
const inflight = new Set<StyleKey>();

async function fetchSprite(key: StyleKey, hash: string): Promise<string> {
  const svg = await fetchEndpoint(
    spriteEndpoint,
    { hash, key },
    // Idempotent and content-addressed: a retry cannot land twice.
    { retry: { retries: 3, backoffMs: 300 } },
  );
  return await svg.text();
}

/**
 * Keeps the page's sprites and renders the sheet. The resident ones arrive
 * with the boot snapshot; until they do (never, normally — they are
 * preloaded) the sheet is empty.
 */
export function IconSpriteHost() {
  const resident = useLive(residentSprites);
  const saved = useLive(savedIconSprites);
  // A failed read renders the empty sheet too (icons draw as empty boxes);
  // live-state's resource-error sink reports the failure.
  if (resident.status !== "ready" || saved.status !== "ready") {
    return <IconSpriteSheet />;
  }
  return <LoadedSprites resident={resident.data} saved={saved.data} />;
}

async function fetchRuntimeSymbols(
  hash: string,
  key: StyleKey,
  names: readonly string[],
): Promise<string> {
  const svg = await fetchEndpoint(
    runtimeSymbolsEndpoint,
    { hash, key },
    // Idempotent and content-addressed, like a sprite.
    {
      query: { names: names.join(",") },
      retry: { retries: 3, backoffMs: 300 },
    },
  );
  return await svg.text();
}

/**
 * Holds the resident saved-icon symbols and installs the runtime-symbol loader:
 * every name `<Icon>` wants in a style no chunk holds is batched (one fetch per
 * style key per frame) and appended to the sheet. A failed batch is thrown into
 * this contribution's error boundary, like a failed sprite.
 */
function useSavedSymbols(saved: SavedIconSprites, fail: (err: Error) => void) {
  useLayoutEffect(() => {
    for (const [key, markup] of Object.entries(saved.sprites)) {
      const styleKey = spriteKey(key);
      if (styleKey === BRANDS_SPRITE) {
        throw new Error("[icons] the saved-icon sprites hold no brands");
      }
      provideRuntimeSymbols(
        `saved-${styleKey}`,
        markup,
        saved.names.map((name) => ({ styleKey, name })),
      );
    }
  }, [saved]);

  const { symbolsHash } = saved;
  useEffect(() => {
    const loader = createRuntimeSymbolLoader({
      fetchSymbols: (key, names) =>
        fetchRuntimeSymbols(symbolsHash, key, names),
      schedule: (flush) => void requestAnimationFrame(flush),
      onLoaded: provideRuntimeSymbols,
      onError: fail,
    });
    return installRuntimeSymbolLoader(loader.request);
  }, [symbolsHash, fail]);
}

/**
 * Provides the resident sprites and fetches, on demand, the sprite of every
 * style some theme scope wants that is not resident.
 *
 * A failed fetch is thrown from render, into this contribution's error
 * boundary, rather than leaving that style's icons on the default glyphs with
 * no word said.
 */
function LoadedSprites({
  resident,
  saved,
}: {
  resident: IconSprites;
  saved: SavedIconSprites;
}) {
  const wanted = useWantedStyleKeys();
  const [failure, setFailure] = useState<Error | null>(null);
  useSavedSymbols(saved, setFailure);
  if (failure) throw failure;

  // A layout effect: the store update re-renders the sheet (and every icon
  // waiting on a sprite) before the browser paints.
  useLayoutEffect(() => {
    for (const [key, markup] of Object.entries(resident.sprites)) {
      provideSprite(spriteKey(key), markup);
    }
  }, [resident]);

  const { manifestHash } = resident;
  useEffect(() => {
    for (const key of wanted) {
      if (hasSprite(key) || inflight.has(key)) continue;
      inflight.add(key);
      void fetchSprite(key, manifestHash).then(
        (markup) => {
          inflight.delete(key);
          provideSprite(key, markup);
        },
        (err: unknown) => {
          inflight.delete(key);
          setFailure(err instanceof Error ? err : new Error(String(err)));
        },
      );
    }
  }, [wanted, manifestHash]);

  return <IconSpriteSheet />;
}
