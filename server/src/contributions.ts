export type ServerContribution = {
  readonly _kind: symbol;
  _pluginId?: string;
  _pluginName?: string;
  [key: string]: unknown;
};

export interface ServerContributionToken<P> {
  (props: P): ServerContribution;
  getContributions(): (P & { _pluginId?: string; _pluginName?: string })[];
}

let byKind: Map<symbol, ServerContribution[]> = new Map();

export function defineServerContribution<P>(
  debugName: string,
): ServerContributionToken<P> {
  const kind = Symbol(debugName);

  const token = ((props: P) => ({
    _kind: kind,
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
  plugins: { id: string; name: string; contributions?: ServerContribution[] }[],
): void {
  byKind = new Map();
  for (const p of plugins) {
    for (const c of p.contributions ?? []) {
      c._pluginId = p.id;
      c._pluginName = p.name;
      let list = byKind.get(c._kind);
      if (!list) {
        list = [];
        byKind.set(c._kind, list);
      }
      list.push(c);
    }
  }
}
