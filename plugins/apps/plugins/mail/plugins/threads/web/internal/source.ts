import { liveDataSource } from "@plugins/primitives/plugins/data-view/web";
import { mailThreads } from "../../core";

/**
 * The threads DataView's live source: the `mailThreads` collection, whose
 * search box matches subject and snippet. The pane scopes it to the connected
 * account (`.scoped({ where: { accountId } })`) before handing it to the
 * DataView.
 */
export const mailThreadsSource = liveDataSource(mailThreads, {
  searchable: ["subject", "snippet"],
});
