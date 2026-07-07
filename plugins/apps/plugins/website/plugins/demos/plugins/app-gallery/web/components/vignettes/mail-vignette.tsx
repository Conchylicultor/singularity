import { useState } from "react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

interface Message {
  id: string;
  sender: string;
  subject: string;
  body: string;
}

const MESSAGES: Message[] = [
  {
    id: "ada",
    sender: "Ada Lovelace",
    subject: "Re: analytical engine benchmarks",
    body: "The new numbers look great — throughput is up almost 40% since the last run. Let's sync tomorrow.",
  },
  {
    id: "grace",
    sender: "Grace Hopper",
    subject: "Compiler ship date",
    body: "We're go for Thursday. I'll cut the release branch once the last test suite is green.",
  },
  {
    id: "alan",
    sender: "Alan Turing",
    subject: "Lunch?",
    body: "Free around noon if you want to grab something and talk through the halting edge cases.",
  },
  {
    id: "katherine",
    sender: "Katherine Johnson",
    subject: "Trajectory review",
    body: "Numbers reconciled — the re-entry window checks out. Sending the full worksheet over now.",
  },
];

/**
 * A toy Mail inbox: four rows with an unread dot; clicking one selects it
 * (highlight + the dot clears) and reveals a one-line reading pane below. Pure
 * local state — a faithful shape of the real Mail app's list + reader.
 */
export function MailVignette() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [read, setRead] = useState<Set<string>>(new Set());

  const select = (id: string) => {
    setSelectedId(id);
    setRead((prev) => new Set(prev).add(id));
  };

  const selected = MESSAGES.find((m) => m.id === selectedId);

  return (
    <Card>
      <Stack gap="md">
        <Text variant="subheading" as="h3">
          Inbox
        </Text>
        <Stack gap="2xs">
          {MESSAGES.map((m) => {
            const isSelected = m.id === selectedId;
            const isUnread = !read.has(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => select(m.id)}
                aria-pressed={isSelected}
                className={cn(
                  "w-full rounded-md text-left transition-colors",
                  isSelected ? "bg-accent" : "hover:bg-muted/50",
                )}
              >
                <Inset pad="sm">
                  <Stack
                    direction="row"
                    gap="sm"
                    align="center"
                    justify="between"
                  >
                    <Stack gap="2xs">
                      <Text
                        variant="label"
                        className={cn(isUnread && "font-semibold")}
                      >
                        {m.sender}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {m.subject}
                      </Text>
                    </Stack>
                    {isUnread && <StatusDot colorClass="bg-primary" />}
                  </Stack>
                </Inset>
              </button>
            );
          })}
        </Stack>
        {selected && (
          <Surface level="sunken" className="rounded-md">
            <Inset pad="md">
              <Stack gap="2xs">
                <Text variant="label">{selected.sender}</Text>
                <Text variant="body" tone="muted">
                  {selected.body}
                </Text>
              </Stack>
            </Inset>
          </Surface>
        )}
      </Stack>
    </Card>
  );
}
