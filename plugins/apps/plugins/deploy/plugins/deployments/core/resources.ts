import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { DeploymentSchema, type Deployment } from "./schemas";

/**
 * Every deployment, push-mode — the `deploy.servers` resource next door is the
 * precedent, and this one is co-bounded with it.
 *
 * Plain (unbounded) is correct here and does NOT need the bounded working-set
 * contract: a deployment is one row per (composition × server), both of which
 * are hand-authored by a human — the compositions come from a config someone
 * edits, the servers from a registry someone fills in. That is an inherently
 * tiny, domain-bounded set, and it migrates to the bounded contract together
 * with the `deploy.servers` resource it sits beside.
 */
export const deploymentsResource = resourceDescriptor<Deployment[]>(
  "deploy.deployments",
  z.array(DeploymentSchema),
  [],
);
