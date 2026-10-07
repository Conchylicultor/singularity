import type { ReactElement } from "react";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  NextRun,
  useBackgroundEntry,
} from "@plugins/infra/plugins/background/plugins/catalog/web";
import type { BackgroundEntry } from "@plugins/infra/plugins/background/plugins/catalog/core";
import type { ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import type { AutomationTrigger } from "../../core";

/**
 * The automation's job as Background activity lists it — the one place its
 * schedule is put in words, its next firing is known, and Run now is offered.
 * `null` once the catalog is known and has no such job.
 */
export function useAutomationJob(
  trigger: AutomationTrigger,
): ResourceResult<BackgroundEntry | null> {
  return useBackgroundEntry("job", trigger.jobName);
}

/**
 * When it runs, in words — read from its job's Background activity entry, so it
 * says exactly what the scheduler says. A schedule a setting turned off says so.
 */
export function ScheduleWords({
  trigger,
  job,
}: {
  trigger: AutomationTrigger;
  job: ResourceResult<BackgroundEntry | null>;
}): ReactElement {
  if (trigger.cron === null) return <>Only when started by hand</>;
  switch (job.status) {
    case "loading":
      return <Loading variant="text" label="Reading its schedule…" />;
    case "error":
      return <>{trigger.cron} (UTC)</>;
    case "ready":
      break;
  }
  const entry = job.data;
  if (entry === null || entry.trigger.kind !== "cron") {
    return <>{trigger.cron} (UTC)</>;
  }
  return <>{entry.trigger.words}</>;
}

/**
 * When it next runs: a countdown where this backend schedules it, "runs on
 * main" where the job is main-only and this is a worktree, nothing while
 * unknown. `prefix` (a separator) is drawn only when there is something to say.
 */
export function NextRunWords({
  job,
  prefix = "",
}: {
  job: ResourceResult<BackgroundEntry | null>;
  prefix?: string;
}): ReactElement | null {
  if (job.status !== "ready" || job.data === null) return null;
  const entry = job.data;
  if (!entry.runsHere) return <>{prefix}runs on main</>;
  if (entry.trigger.kind !== "cron" || entry.trigger.nextAt === null) {
    return null;
  }
  return (
    <>
      {prefix}
      <NextRun at={new Date(entry.trigger.nextAt)} />
    </>
  );
}
