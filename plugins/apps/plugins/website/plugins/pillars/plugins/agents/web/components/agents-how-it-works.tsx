import type { IconType } from "react-icons";
import { MdChecklist, MdCallSplit, MdSpeed } from "react-icons/md";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

const SECTION_TITLE = "How the agent manager works";
const SECTION_SUBTITLE =
  "The same loop that built every app on this site: describe the work, launch an agent, review the result.";

interface Step {
  icon: IconType;
  title: string;
  blurb: string;
}

const STEPS: Step[] = [
  {
    icon: MdChecklist,
    title: "Nested tasks",
    blurb:
      "Work lives in a nested to-do list — features break into subtasks, subtasks into attempts, each linked to the conversation that did the work.",
  },
  {
    icon: MdCallSplit,
    title: "Isolated worktrees",
    blurb:
      "Every agent gets its own git worktree, database fork, and live deployment — experiments never touch your main workspace until reviewed and merged.",
  },
  {
    icon: MdSpeed,
    title: "The race",
    blurb:
      "The goal is simple: close tasks faster than they are created. Agents work in parallel, and the app they improve is the one they run in.",
  },
];

/**
 * The how-it-works band — three cards walking through the agent manager's
 * loop: nested tasks, isolated worktrees, the race.
 */
export function AgentsHowItWorks() {
  return (
    <section>
      <Inset x="xl" y="2xl">
        <Stack gap="xl" className="mx-auto w-full max-w-5xl">
          <Stack gap="sm" align="center" className="text-center">
            <Text variant="eyebrow" tone="primary">
              The loop
            </Text>
            <Text as="h2" variant="heading" className="tracking-tight">
              {SECTION_TITLE}
            </Text>
            <Text as="p" variant="body" tone="muted" className="max-w-2xl">
              {SECTION_SUBTITLE}
            </Text>
          </Stack>
          <Grid minCellWidth="16rem" gap="lg">
            {STEPS.map((step) => (
              <StepCard key={step.title} step={step} />
            ))}
          </Grid>
        </Stack>
      </Inset>
    </section>
  );
}

function StepCard({ step }: { step: Step }) {
  const Icon = step.icon;
  return (
    <Card>
      <Stack gap="md">
        <div className="w-fit rounded-lg bg-primary/10">
          <Inset pad="sm">
            <Icon className="size-6 text-primary" aria-hidden />
          </Inset>
        </div>
        <Stack gap="xs">
          <Text as="h3" variant="subheading">
            {step.title}
          </Text>
          <Text as="p" variant="body" tone="muted">
            {step.blurb}
          </Text>
        </Stack>
      </Stack>
    </Card>
  );
}
