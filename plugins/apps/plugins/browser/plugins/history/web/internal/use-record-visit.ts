import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { postBrowserHistory } from "../../shared/endpoints";

/** Records a browser visit. The recents resource updates via its WS push. */
export function useRecordVisit(): (url: string) => Promise<void> {
  const { mutateAsync } = useEndpointMutation(postBrowserHistory);
  return async (url: string) => {
    await mutateAsync({ body: { url } });
  };
}
