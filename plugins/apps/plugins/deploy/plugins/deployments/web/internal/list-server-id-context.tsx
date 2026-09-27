import { createContext, useContext, type ReactNode } from "react";

/**
 * The `serverId` a field extension of the deployments list should filter its
 * OWN reads by — the same value `DeploymentsBody` (`components/
 * deployments-section.tsx`) already filters `useLive(deployments, { where:
 * { serverId } })` on.
 *
 * A `Deployments.Fields` contribution is handed no host rows (a field
 * extension mounts once per surface with only `{ storageKey, rowKey, render }`
 * — see data-view's CLAUDE.md), so this is how one asks the exact question the
 * host list already asks instead of probing the whole collection and hoping
 * the answer lines up with what the list happens to show.
 */
const DeploymentsListServerIdContext = createContext<string | null>(null);

/** Provided by `DeploymentsBody` around its `<DataView>`. */
export function DeploymentsListServerIdProvider({
  serverId,
  children,
}: {
  serverId: string;
  children: ReactNode;
}) {
  return (
    <DeploymentsListServerIdContext.Provider value={serverId}>
      {children}
    </DeploymentsListServerIdContext.Provider>
  );
}

/**
 * The `serverId` of the enclosing deployments list. Throws outside
 * `DeploymentsBody` — there is no sensible fallback (a silent default would
 * silently probe the wrong server), and every current caller is itself a
 * `Deployments.Fields` contribution, which only ever mounts inside that list.
 */
export function useDeploymentsListServerId(): string {
  const serverId = useContext(DeploymentsListServerIdContext);
  if (serverId === null) {
    throw new Error(
      "useDeploymentsListServerId() called outside the deployments list — " +
        "there is no DeploymentsListServerIdProvider above this component.",
    );
  }
  return serverId;
}
