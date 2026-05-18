import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const runBackup = defineEndpoint({
  route: "POST /api/backup/run",
});

export const listBackupRuns = defineEndpoint({
  route: "GET /api/backup/runs",
});
