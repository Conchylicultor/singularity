import { MdCheck } from "react-icons/md";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { BouncingDots } from "@plugins/primitives/plugins/css/plugins/bouncing-dots/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { STAGES } from "./constants";

/**
 * The inline per-stage timeline shown under a running task: one chip per stage
 * (done → success + check, active → info + bouncing dots, pending → muted), plus
 * the active stage's terminal-style log line.
 */
export function StageTimeline({ stage }: { stage: number }) {
  const current = STAGES[Math.min(stage, STAGES.length - 1)];
  if (!current) return null;
  return (
    <Stack gap="xs">
      <Stack direction="row" gap="xs" wrap align="center">
        {STAGES.map((s, i) => {
          if (i < stage) {
            return (
              <Badge key={s.id} variant="success" icon={<MdCheck />}>
                {s.label}
              </Badge>
            );
          }
          if (i === stage) {
            return (
              <Badge key={s.id} variant="info" icon={<BouncingDots />}>
                {s.label}
              </Badge>
            );
          }
          return (
            <Badge key={s.id} variant="muted">
              {s.label}
            </Badge>
          );
        })}
      </Stack>
      <Text variant="caption" tone="muted" className="font-mono">
        {current.log}
      </Text>
    </Stack>
  );
}
