import { useState } from "react";
import { MdAdd } from "react-icons/md";
import {
  DataView,
  type FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import { matchResource, useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Button } from "@plugins/primitives/plugins/ui-kit/web";
import { TaskDraftPopover } from "@plugins/tasks/plugins/task-draft-form/web";
import { IMPROVEMENTS_META_TASK_ID } from "@plugins/improve/web";
import {
  prototypesResource,
  type PrototypeMeta,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { prototypeDetailPane } from "../panes";

/** Deterministic hue from the theme (or name) string, for the cover swatch. */
function hueFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

function ThemeSwatch({ meta }: { meta: PrototypeMeta }) {
  const hue = hueFor(meta.theme || meta.name);
  return (
    <div
      className="h-full w-full"
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 70% 45%))`,
      }}
    />
  );
}

const NEW_PROTOTYPE_TEXT = [
  "Create a new throwaway UI prototype.",
  "",
  "Add it under `prototypes/<slug>/` following the shape of the existing mocks and",
  "`prototypes/_shared` (a `meta.json` + an `app.jsx` that defines `window.App` +",
  "optional `styles.css`). Use the shared harness, tokens, and fixtures — do not",
  "re-add CDN tags or a Stage/Compare scaffold.",
].join("\n");

/**
 * Gallery surface: a `DataView` gallery over the live prototype list. Each card
 * shows the name + blurb over a theme-tinted cover. Activating a card opens the
 * Focus/Compare detail pane. A "New prototype" button opens the task-draft
 * popover pre-seeded to scaffold a new mock.
 */
export function PrototypeGallery() {
  const result = useResource(prototypesResource);
  const openPane = useOpenPane();
  const selectedName = prototypeDetailPane.useRouteEntry()?.params.name;
  const [newOpen, setNewOpen] = useState(false);

  const fields: FieldDef<PrototypeMeta>[] = [
    { id: "name", label: "Name", type: "text", primary: true, value: (p) => p.name },
    { id: "blurb", label: "Blurb", type: "text", value: (p) => p.blurb },
    { id: "theme", label: "Theme", type: "text", value: (p) => p.theme },
  ];

  const newButton = (
    <TaskDraftPopover
      open={newOpen}
      onOpenChange={setNewOpen}
      trigger={
        <Button variant="default" size="sm">
          <MdAdd />
          New prototype
        </Button>
      }
      tooltip="New prototype"
      target={{ kind: "metaTask", metaTaskId: IMPROVEMENTS_META_TASK_ID }}
      captures={["url"]}
      initialText={NEW_PROTOTYPE_TEXT}
      heading="New prototype"
    />
  );

  const renderList = (rows: PrototypeMeta[], loading: boolean) => (
    <DataView<PrototypeMeta>
      title="Prototypes"
      rows={rows}
      fields={fields}
      rowKey={(p) => p.name}
      views={["gallery"]}
      defaultView="gallery"
      storageKey="prototypes:gallery"
      loading={loading}
      selectedRowId={selectedName}
      onRowActivate={(p) =>
        openPane(prototypeDetailPane, { name: p.name }, { mode: "push" })
      }
      actions={newButton}
      emptyState="No prototypes yet. Add one under prototypes/<slug>/."
      viewOptions={{
        gallery: {
          minCardWidth: 224,
          cover: (p: PrototypeMeta) => ({
            kind: "node",
            node: <ThemeSwatch meta={p} />,
          }),
        },
      }}
    />
  );

  return matchResource(result, {
    pending: () => renderList([], true),
    error: () => renderList([], true),
    ready: (rows) => renderList(rows, false),
  });
}
