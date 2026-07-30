import { asc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { _deployDeployments } from "./tables";
import { toDeployments } from "./project-deployment";
import { deploymentsResource as deploymentsDescriptor } from "../../core/resources";

// Two-arg form: `key`/`schema`/keyed-ness come from the client descriptor, so
// there is one place they are stated. (The `deploy.servers` sibling predates
// this form and restates its schema server-side; the framework's own guidance is
// to derive from the descriptor when one exists, which it does here because this
// plugin's contract lives in `core/`.)
//
// `mode: "push"` + no `identityTable` → the L4 change-feed recomputes active
// subscriptions whenever `deploy_deployments` changes, so a create / edit /
// cascade-delete re-pushes with no hand-notify, exactly like `deploy.servers`.
export const deploymentsServerResource = defineResource(deploymentsDescriptor, {
  mode: "push",
  loader: async () => {
    const rows = await db
      .select()
      .from(_deployDeployments)
      .orderBy(asc(_deployDeployments.createdAt));
    return toDeployments(rows);
  },
});
