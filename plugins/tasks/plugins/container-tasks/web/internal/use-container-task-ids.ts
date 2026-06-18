import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { listContainerTaskIds } from "@plugins/tasks/plugins/container-tasks/core";

// Container ids are static after boot, so cache indefinitely — never refetch.
export function useContainerTaskIds(): ReadonlySet<string> {
  const { data } = useEndpoint(
    listContainerTaskIds,
    {},
    { staleTime: Infinity, gcTime: Infinity },
  );
  return new Set(data?.ids ?? []);
}

export function useIsContainerTask(id: string): boolean {
  return useContainerTaskIds().has(id);
}
