import { HttpError, implement } from "@plugins/infra/plugins/endpoints/server";
import { UgFetchError } from "../../core";
import { fetchUgTab } from "../../shared/endpoints";
import { fetchUgTabContent } from "./ug-client";

/** HTTP status for each classified UG fetch failure. */
function statusForKind(kind: UgFetchError["kind"]): number {
  switch (kind) {
    case "invalid-url":
      return 400; // client supplied a bad URL
    case "not-found":
      return 404; // tab id does not exist
    // signature-rejected / bad-request / upstream / malformed-response /
    // network — server-side upstream/integration failures worth surfacing as
    // loud, crash-worthy breakages.
    case "signature-rejected":
    case "bad-request":
    case "upstream":
    case "malformed-response":
    case "network":
      return 502;
  }
}

/**
 * Fetch the raw UG tab for a pasted URL. Maps classified `UgFetchError`s to
 * HTTP statuses; rethrows anything unexpected so it crashes loudly.
 */
export const handleFetchUgTab = implement(fetchUgTab, async ({ body }) => {
  try {
    return await fetchUgTabContent(body.url);
  } catch (err) {
    if (err instanceof UgFetchError) {
      throw new HttpError(statusForKind(err.kind), err.message);
    }
    throw err;
  }
});
