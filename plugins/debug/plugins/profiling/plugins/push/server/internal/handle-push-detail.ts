import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getPushDetail, type PushDetail } from "../../shared/endpoints";
import { readContentionRecords } from "./read-contention";

export const handlePushDetail = implement(getPushDetail, ({ params }) => {
  const pushId = params.pushId;
  if (!pushId) throw new HttpError(400, "Missing pushId");

  const record = readContentionRecords().find((r) => r.pushId === pushId);
  if (!record) throw new HttpError(404, "Push not found");

  const detail: PushDetail = {
    pushId: record.pushId,
    branch: record.branch,
    outcome: record.outcome,
    mode: record.mode,
    conversationId: record.conversationId,
    startedAt: record.startedAt,
    lockRequestedAt: record.lockRequestedAt,
    lockAcquiredAt: record.lockAcquiredAt,
    completedAt: record.completedAt,
    preLockMs: record.preLockMs,
    waitMs: record.waitMs,
    holdMs: record.holdMs,
    totalMs: record.totalMs,
    interrupted: record.interrupted,
    steps: record.steps,
  };
  return detail;
});
