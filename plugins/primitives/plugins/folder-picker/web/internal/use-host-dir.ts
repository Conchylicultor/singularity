import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { browseHostDir } from "../../core";

/**
 * Browse (or validate) a host directory. With `path` undefined the server
 * resolves the user's home directory. Pass `{ enabled: false }` to skip the
 * request (e.g. while the input is empty).
 */
export function useHostDir(
  path: string | undefined,
  opts?: { enabled?: boolean },
) {
  return useEndpoint(browseHostDir, {}, { query: { path }, enabled: opts?.enabled });
}
