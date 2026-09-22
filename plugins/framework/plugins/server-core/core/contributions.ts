export type ServerContribution = {
  readonly _kind: symbol;
  _pluginId?: string;
  _pluginDescription?: string;
  [key: string]: unknown;
};

type Collected<P> = P & { _pluginId?: string; _pluginDescription?: string };

export interface ServerContributionToken<P> {
  (props: P): ServerContribution;
  /**
   * Every contribution of this kind, as `collectContributions` gathered them at
   * boot. Throws in a process that never collected — a CLI or a headless test —
   * rather than answering `[]`, which a caller cannot tell apart from "no
   * plugin contributes one".
   */
  getContributions(): Collected<P>[];
  /**
   * `getContributions()` for the few readers that legitimately run in the
   * pre-collect window too (module-eval resolvers with their own eager
   * fallback): `undefined` when nothing has been collected yet — a state, not
   * an empty set.
   */
  getContributionsIfCollected(): Collected<P>[] | undefined;
  /**
   * The contributions of this kind declared by `plugins` (loaded plugin
   * definitions), matched on this token's own kind. Pure: reads no boot state,
   * so a process that imports the barrels without booting gets the same set.
   */
  from(
    plugins: readonly { contributions?: readonly ServerContribution[] }[],
  ): P[];
}

// `null` until `collectContributions` runs: "not collected" is its own state,
// never an empty map.
let byKind: Map<symbol, ServerContribution[]> | null = null;

function stripKind<P>({ _kind: _, ...rest }: ServerContribution): P {
  return rest as P;
}

export function defineServerContribution<P>(
  debugName: string,
  opts?: { docLabel?: (props: P) => string | undefined },
): ServerContributionToken<P> {
  const kind = Symbol(debugName);

  const token = ((props: P) => ({
    _kind: kind,
    _doc: { label: opts?.docLabel?.(props as P) },
    ...props,
  })) as unknown as ServerContributionToken<P>;

  token.getContributionsIfCollected = () =>
    byKind === null
      ? undefined
      : (byKind.get(kind) ?? []).map((c) => stripKind<Collected<P>>(c));

  token.getContributions = () => {
    if (byKind === null) {
      throw new Error(
        `[contributions] "${debugName}" read before collectContributions ran: this process never booted the plugin graph. ` +
          `Pass the set in explicitly, or gather it from the plugin definitions with ${debugName}.from(plugins).`,
      );
    }
    return token.getContributionsIfCollected()!;
  };

  token.from = (plugins) =>
    plugins
      .flatMap((p) => p.contributions ?? [])
      .filter((c) => c._kind === kind)
      .map((c) => stripKind<P>(c));

  return token;
}

export function collectContributions(
  plugins: {
    id: string;
    description?: string;
    contributions?: ServerContribution[];
  }[],
): void {
  const collected = new Map<symbol, ServerContribution[]>();
  byKind = collected;
  for (const p of plugins) {
    for (const c of p.contributions ?? []) {
      c._pluginId = p.id;
      c._pluginDescription = p.description;
      let list = collected.get(c._kind);
      if (!list) {
        list = [];
        collected.set(c._kind, list);
      }
      list.push(c);
    }
  }
}
