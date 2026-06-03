import { useActiveApp } from "./internal/use-active-app";

/**
 * The id of the app whose `path` best matches the current pathname, or
 * undefined if none. Thin wrapper over {@link useActiveApp} for consumers
 * that only need the id (e.g. config scoping: `app:<id>`).
 */
export function useCurrentAppId(): string | undefined {
  return useActiveApp()?.id;
}
