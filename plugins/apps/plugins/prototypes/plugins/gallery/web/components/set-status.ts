import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import {
  setPrototypeStatus,
  type PrototypeStatusChange,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";

// A prototype's status — Done and pinned — is one shared record per prototype
// (`files`' `prototypes.statuses`, `_status/<id>.json`), toggled from the
// gallery card and from the detail pane's header. A failed write surfaces
// through the endpoint layer's global error toast; every toggle keeps showing
// the stored value, since it reads the live value the server re-broadcasts on
// every write.

/** Apply one change (`{ done }`, `{ pinned }`) to a prototype's status. */
export function useSetPrototypeStatus(): {
  pending: boolean;
  setStatus: (name: string, change: PrototypeStatusChange) => void;
} {
  const mutation = useEndpointMutation(setPrototypeStatus);
  return {
    pending: mutation.isPending,
    setStatus: (name, change) =>
      mutation.mutate({ params: { name }, body: change }),
  };
}
