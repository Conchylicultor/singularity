import { Fragment, useEffect, useRef, useState } from "react";
import type { IconType } from "react-icons";
import {
  MdBolt,
  MdChatBubbleOutline,
  MdSend,
  MdCheck,
  MdArrowForward,
} from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { BouncingDots } from "@plugins/primitives/plugins/css/plugins/bouncing-dots/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

type StepStatus = "idle" | "running" | "done";

const STEPS: { id: string; label: string; icon: IconType }[] = [
  { id: "trigger", label: "Trigger", icon: MdBolt },
  { id: "prompt", label: "Prompt", icon: MdChatBubbleOutline },
  { id: "send", label: "Send", icon: MdSend },
];

const STEP_MS = 700;

/**
 * A toy Workflows run: three step chips (Trigger → Prompt → Send). Pressing Run
 * advances each step muted → running (bouncing dots) → done (success + check) on
 * a finite chained-timeout sequence; a second Run resets and replays. Timeout ids
 * live in a ref and are cleared on unmount. Toy replica — no real execution — but
 * it mirrors the shape of the real Workflows engine's step lifecycle.
 */
export function WorkflowsVignette() {
  const [statuses, setStatuses] = useState<StepStatus[]>(() =>
    STEPS.map(() => "idle"),
  );
  const [running, setRunning] = useState(false);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    for (const t of timeoutsRef.current) clearTimeout(t);
    timeoutsRef.current = [];
  };

  useEffect(() => {
    // Capture the mutable ref for cleanup (reading it directly trips react-hooks/refs).
    const timeouts = timeoutsRef;
    return () => {
      for (const t of timeouts.current) clearTimeout(t);
      timeouts.current = [];
    };
  }, []);

  const run = () => {
    if (running) return; // guard against a double-run while a sequence is live
    clearTimers();
    setRunning(true);
    setStatuses(STEPS.map(() => "idle"));
    STEPS.forEach((_, i) => {
      timeoutsRef.current.push(
        setTimeout(() => {
          setStatuses((prev) => prev.map((s, j) => (j === i ? "running" : s)));
        }, i * STEP_MS),
      );
      timeoutsRef.current.push(
        setTimeout(
          () => {
            setStatuses((prev) => prev.map((s, j) => (j === i ? "done" : s)));
            if (i === STEPS.length - 1) setRunning(false);
          },
          (i + 1) * STEP_MS,
        ),
      );
    });
  };

  return (
    <Card>
      <Stack gap="lg">
        <Text variant="subheading" as="h3">
          Run a workflow
        </Text>
        <Stack direction="row" gap="sm" align="center" wrap>
          {STEPS.map((step, i) => (
            <Fragment key={step.id}>
              <StepChip step={step} status={statuses[i] ?? "idle"} />
              {i < STEPS.length - 1 && (
                <MdArrowForward
                  className="size-4 text-muted-foreground"
                  aria-hidden
                />
              )}
            </Fragment>
          ))}
        </Stack>
        <Stack direction="row" gap="sm">
          <Button type="button" onClick={run} disabled={running}>
            {running ? "Running…" : "Run"}
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}

function StepChip({
  step,
  status,
}: {
  step: { label: string; icon: IconType };
  status: StepStatus;
}) {
  const Icon = step.icon;
  if (status === "done") {
    return (
      <Badge variant="success" icon={<MdCheck aria-hidden />}>
        {step.label}
      </Badge>
    );
  }
  if (status === "running") {
    return (
      <Badge variant="info" icon={<BouncingDots />}>
        {step.label}
      </Badge>
    );
  }
  return (
    <Badge variant="muted" icon={<Icon aria-hidden />}>
      {step.label}
    </Badge>
  );
}
