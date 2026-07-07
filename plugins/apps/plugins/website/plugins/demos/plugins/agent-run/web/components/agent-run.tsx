import { useEffect, useRef, useState } from "react";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { STAGES, TASKS, type RunState } from "./constants";
import { TaskRow } from "./task-row";

const EYEBROW = "Watch it work";
const HEADLINE = "Launch an agent. Watch it merge.";
const BODY =
  "A toy replay of the real loop: each agent gets an isolated worktree, makes its changes, builds, and merges back. Launch several — they race.";

const IDLE_RUN: RunState = { status: "idle", stage: 0 };

function initialRuns(): Record<string, RunState> {
  return Object.fromEntries(TASKS.map((t) => [t.id, IDLE_RUN]));
}

/**
 * Agents-pillar demo band: a fake task list where the visitor launches agents
 * and watches each race through worktree → edit → build → merge, several at
 * once. Purely simulated, deterministic, client-only — finite per-launch
 * `setTimeout` chains whose ids are tracked in a ref and cleared on unmount.
 */
export function AgentRunSection() {
  const [runs, setRuns] = useState<Record<string, RunState>>(initialRuns);
  const timersRef = useRef<number[]>([]);

  // Single cleanup: clear every timeout ever scheduled when the demo unmounts.
  useEffect(() => {
    return () => {
      for (const id of timersRef.current) window.clearTimeout(id);
      timersRef.current = [];
    };
  }, []);

  function launch(taskId: string) {
    setRuns((prev) => ({ ...prev, [taskId]: { status: "running", stage: 0 } }));
    let acc = 0;
    STAGES.forEach((stage, i) => {
      acc += stage.ms;
      const id = window.setTimeout(() => {
        setRuns((prev) => {
          const next = i + 1;
          if (next >= STAGES.length) {
            return {
              ...prev,
              [taskId]: { status: "done", stage: STAGES.length },
            };
          }
          return { ...prev, [taskId]: { status: "running", stage: next } };
        });
      }, acc);
      timersRef.current.push(id);
    });
  }

  function reset() {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];
    setRuns(initialRuns());
  }

  const doneCount = Object.values(runs).filter(
    (r) => r.status === "done",
  ).length;
  const anyActive = Object.values(runs).some((r) => r.status !== "idle");

  return (
    <section className="bg-background">
      <Inset x="xl" y="2xl">
        <Stack gap="lg" align="center" className="mx-auto w-full max-w-5xl">
          <Stack gap="2xs" align="center" className="text-center">
            <Text variant="eyebrow" tone="primary">
              {EYEBROW}
            </Text>
            <Text variant="heading" as="h2" className="tracking-tight">
              {HEADLINE}
            </Text>
            <Text variant="body" tone="muted" className="max-w-xl">
              {BODY}
            </Text>
          </Stack>
          <div className="mx-auto w-full max-w-2xl" aria-label="Agent run demo">
            <Card>
              <Stack gap="lg">
                <Stack direction="row" gap="md" align="center" justify="between">
                  <Text variant="label" tone="muted">
                    {doneCount} / {TASKS.length} tasks closed
                  </Text>
                  {anyActive && (
                    <Button variant="ghost" onClick={reset}>
                      Reset
                    </Button>
                  )}
                </Stack>
                <Stack gap="lg">
                  {TASKS.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      run={runs[task.id] ?? IDLE_RUN}
                      onLaunch={() => launch(task.id)}
                    />
                  ))}
                </Stack>
              </Stack>
            </Card>
          </div>
        </Stack>
      </Inset>
    </section>
  );
}
