import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { sshRun } from "@plugins/infra/plugins/ssh/server";
import { _deployDeployments } from "@plugins/apps/plugins/deploy/plugins/deployments/server";
import { resolveServerSshTarget } from "@plugins/apps/plugins/deploy/plugins/health/server";
import { queryDeploymentAnalytics } from "../../core";
import {
  SSH_TIMEOUT_MS,
  queryAnalyticsOverSsh,
  type DeploymentTarget,
} from "./query-over-ssh";

async function resolveDeployment(
  deploymentId: string,
): Promise<DeploymentTarget> {
  const [deployment] = await db
    .select()
    .from(_deployDeployments)
    .where(eq(_deployDeployments.id, deploymentId));
  if (!deployment) return { kind: "not-found" };

  // A reader, not the connection check: it never learns a host key it would
  // not persist, so an unverified server is refused rather than trusted.
  const ssh = await resolveServerSshTarget(
    deployment.serverId,
    "require-pinned",
    {
      timeoutMs: SSH_TIMEOUT_MS,
    },
  );
  switch (ssh.kind) {
    case "not-found":
      // FK cascade deletes the deployment with its server, so this is a race.
      return { kind: "not-found" };
    case "no-key":
      return { kind: "no-ssh-key" };
    case "unpinned":
      return { kind: "unverified" };
    case "ready":
      return {
        kind: "ready",
        target: ssh.target,
        loopbackPort: deployment.loopbackPort,
      };
  }
}

export const handleQueryDeploymentAnalytics = implement(
  queryDeploymentAnalytics,
  async ({ body }) => {
    const result = await queryAnalyticsOverSsh(
      { resolveDeployment, sshRun },
      body.deploymentId,
      body.query,
    );
    if (result.kind === "not-found") {
      throw new HttpError(404, "This deployment no longer exists.");
    }
    return result;
  },
);
