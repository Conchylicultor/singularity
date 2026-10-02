import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { hostFsList } from "@plugins/infra/plugins/host-fs/core";

/**
 * List (or validate) a host directory through host-fs. With `path` undefined
 * the server lists the user's home directory. The answer is a discriminated
 * result — `ok` (a readable directory), `missing`, `denied` or `not-a-dir` —
 * and its entries include files and hidden entries; a folder picker filters to
 * `kind === "dir"` itself. Pass `{ enabled: false }` to skip the request (e.g.
 * while the input is empty).
 */
export function useHostDir(
  path: string | undefined,
  opts?: { enabled?: boolean },
) {
  return useEndpoint(
    hostFsList,
    {},
    { query: { path }, enabled: opts?.enabled },
  );
}
