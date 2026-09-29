import type { StyleKey } from "@plugins/ui/plugins/icons/core";
import type { RuntimeSymbolEntry } from "@plugins/ui/plugins/icons/web";

/** The route's cap, mirrored: a batch larger than this is split. */
export const MAX_NAMES_PER_FETCH = 200;

export interface RuntimeSymbolLoaderDeps {
  /** Fetch `names` (sorted, duplicate-free) in `styleKey`: the whole `<svg>`. */
  fetchSymbols(styleKey: StyleKey, names: readonly string[]): Promise<string>;
  /** Run `flush` once, later — on the next animation frame in the browser. */
  schedule(flush: () => void): void;
  /** A batch landed: hold it as runtime-symbol chunk `chunkId`. */
  onLoaded(
    chunkId: string,
    markup: string,
    entries: readonly RuntimeSymbolEntry[],
  ): void;
  onError(err: Error): void;
}

/**
 * Turns `<Icon>`'s one-at-a-time wants into few requests: every want made
 * before the scheduled flush is batched — one fetch per style key (split past
 * {@link MAX_NAMES_PER_FETCH}), names sorted so the URL is content-addressed —
 * and a name already requested (in flight or landed) is never requested again.
 * A failed batch releases its names (a later want retries) and is reported.
 */
export function createRuntimeSymbolLoader(deps: RuntimeSymbolLoaderDeps): {
  request(entry: RuntimeSymbolEntry): void;
} {
  const requested = new Set<string>();
  let queued = new Map<StyleKey, Set<string>>();
  let scheduled = false;
  let batch = 0;

  const flush = () => {
    scheduled = false;
    const work = queued;
    queued = new Map();
    for (const [styleKey, set] of work) {
      const names = [...set].sort();
      for (let i = 0; i < names.length; i += MAX_NAMES_PER_FETCH) {
        const slice = names.slice(i, i + MAX_NAMES_PER_FETCH);
        const chunkId = `runtime-${styleKey}-${batch++}`;
        deps.fetchSymbols(styleKey, slice).then(
          (markup) =>
            deps.onLoaded(
              chunkId,
              markup,
              slice.map((name) => ({ styleKey, name })),
            ),
          (err: unknown) => {
            for (const name of slice) requested.delete(`${styleKey} ${name}`);
            deps.onError(err instanceof Error ? err : new Error(String(err)));
          },
        );
      }
    }
  };

  return {
    request({ styleKey, name }) {
      const key = `${styleKey} ${name}`;
      if (requested.has(key)) return;
      requested.add(key);
      let set = queued.get(styleKey);
      if (!set) queued.set(styleKey, (set = new Set()));
      set.add(name);
      if (!scheduled) {
        scheduled = true;
        deps.schedule(flush);
      }
    },
  };
}
