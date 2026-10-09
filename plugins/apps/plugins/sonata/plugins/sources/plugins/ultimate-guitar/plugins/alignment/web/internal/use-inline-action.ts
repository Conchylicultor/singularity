import { useState } from "react";
import {
  EndpointError,
  getEndpointErrorMessage,
} from "@plugins/infra/plugins/endpoints/web";

/**
 * Runs an endpoint call whose failure is shown inline, next to the control it
 * came from (the mutations pass `suppressError`, so no global toast): an
 * `EndpointError` becomes `error`, anything else still throws.
 */
export function useInlineAction(): {
  error: string | null;
  run: (action: () => Promise<unknown>) => Promise<boolean>;
} {
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setError(null);
    try {
      await action();
      return true;
    } catch (err) {
      if (err instanceof EndpointError) {
        setError(getEndpointErrorMessage(err));
        return false;
      }
      throw err;
    }
  }
  return { error, run };
}
