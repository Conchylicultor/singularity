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
  provideSprite,
  useWantedStyleKeys,
} from "@plugins/ui/plugins/icons/web";
import { residentSprites, spriteEndpoint, type IconSprites } from "../../core";

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
  if (resident.pending) return <IconSpriteSheet />;
  return <LoadedSprites resident={resident.data} />;
}

/**
 * Provides the resident sprites and fetches, on demand, the sprite of every
 * style some theme scope wants that is not resident.
 *
 * A failed fetch is thrown from render, into this contribution's error
 * boundary, rather than leaving that style's icons on the default glyphs with
 * no word said.
 */
function LoadedSprites({ resident }: { resident: IconSprites }) {
  const wanted = useWantedStyleKeys();
  const [failure, setFailure] = useState<Error | null>(null);
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
