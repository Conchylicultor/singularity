import { useState } from "react";
import { MdCheckBox, MdCheckBoxOutlineBlank } from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

const TODOS = [
  { id: "outline", label: "Draft the launch outline" },
  { id: "review", label: "Review copy with the team" },
  { id: "publish", label: "Publish the announcement" },
];

/**
 * A mini Pages doc: a heading, a paragraph, and three todo blocks with working
 * checkboxes. Toy replica — pure local state, no persistence — but it reads like
 * a real page built from the same primitives.
 */
export function PagesVignette() {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Card>
      <Stack gap="md">
        <Text variant="subheading" as="h3">
          Launch checklist
        </Text>
        <Text variant="body" tone="muted">
          A quick page with a few things to tick off. Click a checkbox — it's a
          real block editor underneath.
        </Text>
        <Stack gap="xs">
          {TODOS.map((todo) => {
            const done = checked.has(todo.id);
            const Icon = done ? MdCheckBox : MdCheckBoxOutlineBlank;
            return (
              <button
                key={todo.id}
                type="button"
                onClick={() => toggle(todo.id)}
                aria-pressed={done}
              >
                <Stack direction="row" gap="sm" align="center">
                  <Icon
                    className={cn(
                      "size-5",
                      done ? "text-primary" : "text-muted-foreground",
                    )}
                    aria-hidden
                  />
                  <Text
                    variant="body"
                    className={cn(done && "text-muted-foreground line-through")}
                  >
                    {todo.label}
                  </Text>
                </Stack>
              </button>
            );
          })}
        </Stack>
      </Stack>
    </Card>
  );
}
