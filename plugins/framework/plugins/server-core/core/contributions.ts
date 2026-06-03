export type ServerContribution = {
  readonly _kind: symbol;
  _pluginId?: string;
  _pluginName?: string;
  _pluginDescription?: string;
  [key: string]: unknown;
};

export interface ServerContributionToken<P> {
  (props: P): ServerContribution;
  getContributions(): (P & {
    _pluginId?: string;
    _pluginName?: string;
    _pluginDescription?: string;
  })[];
}

let byKind: Map<symbol, ServerContribution[]> = new Map();

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

  token.getContributions = () => {
    return (byKind.get(kind) ?? []).map(
      ({ _kind: _, ...rest }) =>
        rest as P & { _pluginId?: string; _pluginName?: string },
    );
  };

  return token;
}

export function collectContributions(
  plugins: {
    id: string;
    name: string;
    description?: string;
    contributions?: ServerContribution[];
  }[],
): void {
  byKind = new Map();
  for (const p of plugins) {
    for (const c of p.contributions ?? []) {
      c._pluginId = p.id;
      c._pluginName = p.name;
      c._pluginDescription = p.description;
      let list = byKind.get(c._kind);
      if (!list) {
        list = [];
        byKind.set(c._kind, list);
      }
      list.push(c);
    }
  }
}
