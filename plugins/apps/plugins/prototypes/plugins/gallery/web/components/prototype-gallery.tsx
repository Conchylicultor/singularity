import { MdAdd, MdWarning } from "react-icons/md";
import {
  DataView,
  defineDataView,
  type FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import {
  matchResource,
  useCombinedResources,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Overlay } from "@plugins/primitives/plugins/css/plugins/overlay/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { LaunchAgentPopover } from "@plugins/primitives/plugins/launch/web";
import {
  fetchEndpoint,
  getEndpointErrorMessage,
} from "@plugins/infra/plugins/endpoints/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { PROTOTYPES_DIR_DISPLAY } from "@plugins/infra/plugins/paths/plugins/display/core";
import type { ThumbnailState } from "@plugins/apps/plugins/prototypes/plugins/thumbnails/core";
import { conversationRoute } from "@plugins/conversations/core";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import {
  createPrototype,
  prototypesResource,
  type PrototypeMeta,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import {
  PrototypeThumbnail,
  usePrototypeThumbnails,
} from "@plugins/apps/plugins/prototypes/plugins/thumbnails/web";
import { prototypeDetailPane } from "../panes";

const PROTOTYPES_VIEW = defineDataView("prototypes.gallery");

/** Deterministic hue from the prototype's id, for the cover swatch. */
function hueFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

function CoverSwatch({ meta }: { meta: PrototypeMeta }) {
  const hue = hueFor(meta.name);
  return (
    <Overlay
      className="h-full w-full"
      // `fill`, not in-flow: the cover box is sized by the card, and an in-flow
      // child's `h-full` would resolve against Overlay's auto-height wrapper —
      // i.e. against nothing — leaving the swatch blank.
      fill
      // A marker only — the problems themselves are listed in the detail pane,
      // where there is room to read them. `above` is pointer-events-none, so a
      // tooltip here would never fire and the corner would go dead to clicks.
      above={
        meta.problems.length === 0 ? null : (
          <Pin to="top-right" offset="xs">
            <Badge variant="warning" icon={<MdWarning />}>
              {meta.problems.length}
            </Badge>
          </Pin>
        )
      }
    >
      <div
        className="h-full w-full"
        style={{
          background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 70% 45%))`,
        }}
      />
    </Overlay>
  );
}

// The prompt every "New prototype" agent starts from. It is the one instruction
// that always reaches such an agent, so it carries the two rules that decide
// whether the result is an original design: start from the blank template, and
// never open a sibling. The rest is a pointer to `prototypes/CLAUDE.md` — this
// is a prompt, not the contract.
//
// The folder is minted BEFORE this text is written, so the prompt names it
// instead of asking for it: the agent is never asked to choose a name, and so
// cannot choose one wrong. What it IS asked for is the `<title>`, which is the
// prototype's only human name now that the folder is an opaque id.
function newPrototypeText(id: string): string {
  return [
    `Design a new throwaway UI prototype in \`${PROTOTYPES_DIR_DISPLAY}/${id}/\`.`,
    "",
    "That folder ALREADY EXISTS and already holds the blank template — edit it in",
    `place. Do not create a second folder, and do not rename this one: \`${id}\` is a`,
    "minted id, not a name. The prototype's name is its `<title>`, which is what",
    "the gallery card and the pane header show — write a real one as you go.",
    "",
    "That directory is NOT in the repo, and that is deliberate: write the files",
    "there directly, do not commit anything, and do not create anything under the",
    "repo's `prototypes/`. Every worktree and main serve that one shared directory,",
    "so the prototype is visible the moment you save it — no build, no push.",
    "",
    "Read `prototypes/CLAUDE.md` (in the repo) first — it is the full contract.",
    "",
    "Design from a blank page. Do NOT open any other prototype's folder, and do",
    "not read `plugins/` — the app's own components and tokens are not a starting",
    "point here.",
    "",
    "Keep the folder self-contained and flat: one `index.html` plus whatever flat",
    "files it needs, referenced relatively. It must render when you double-click it",
    "straight off disk (`file://`), so write your JSX inline in `index.html` —",
    "Babel fetches an external `src` over XHR, which the browser blocks on `file://`.",
  ].join("\n");
}

/**
 * Mint the folder the agent is about to be handed — before the conversation
 * that will edit it exists.
 *
 * Ordering matters: `getRequest` is awaited before `createConversation` is
 * called, so a failed mint rejects and the launch never happens. That is the
 * point — an agent must never be handed a prompt naming a folder that is not
 * there. The toast is what the user sees at the button; re-throwing is what
 * aborts the launch (and reaches the crash collector, which files a report).
 */
async function mintPrototypeFolder(): Promise<string> {
  try {
    const { id } = await fetchEndpoint(createPrototype, {}, { body: {} });
    return id;
  } catch (err) {
    toast({
      type: "prototype",
      title: "Could not create the prototype",
      description: getEndpointErrorMessage(err),
      variant: "error",
    });
    throw err;
  }
}

/**
 * Gallery surface: a `DataView` gallery over the live prototype list. Each card
 * shows the prototype's `<title>` + blurb over an id-tinted cover. Activating a
 * card opens the Focus/Compare detail pane. "New prototype" mints an empty
 * prototype folder and opens the launch-agent popover on it, so the background
 * agent it fires is handed a folder that already exists.
 */
export function PrototypeGallery() {
  // Both subscriptions are taken HERE, side by side, and the cards wait for
  // both. A resource primes over HTTP when its first subscriber mounts, so a
  // card that subscribed to its own thumbnail could not start that request
  // until the list had already painted — every load showed the stand-in swatch
  // for one round trip and then swapped in the picture. Asking for both at once
  // costs no extra wait (they prime in parallel) and the cover is right the
  // first time it is painted.
  const result = useCombinedResources({
    prototypes: useResource(prototypesResource),
    thumbnails: usePrototypeThumbnails(),
  });
  const openPane = useOpenPane();
  const selectedName = prototypeDetailPane.useRouteEntry()?.params.name;

  // `title` is what the author named the prototype (its `<title>`), so it is the
  // display field; `name` is the minted id the URL and the row key use — opaque,
  // so it is a searchable column and never the label.
  const fields: FieldDef<PrototypeMeta>[] = [
    {
      id: "title",
      label: "Title",
      type: "text",
      primary: true,
      value: (p) => p.title,
    },
    { id: "blurb", label: "Blurb", type: "text", value: (p) => p.blurb },
    { id: "name", label: "Folder", type: "text", value: (p) => p.name },
  ];

  const newButton = (
    <LaunchAgentPopover
      trigger={
        <Button variant="default">
          <MdAdd />
          New prototype
        </Button>
      }
      title="New prototype"
      description="Launch an agent to scaffold a new throwaway UI prototype."
      placeholder="Extra context (optional) — e.g. desired style, layout, reference…"
      align="end"
      onLaunched={(conv) => {
        toast({
          type: "prototype",
          title: "Creating prototype",
          description:
            "Agent launched in the background — open it from here or the bell.",
          variant: "info",
          linkTo: conversationRoute.link(agentManagerApp, { convId: conv.id }),
        });
      }}
      getRequest={async (userText) => {
        const id = await mintPrototypeFolder();
        const parts = [newPrototypeText(id)];
        if (userText.trim())
          parts.push(`Additional context: ${userText.trim()}`);
        return { prompt: parts.join("\n\n") };
      }}
    />
  );

  const renderList = (
    rows: PrototypeMeta[],
    thumbnails: Record<string, ThumbnailState>,
    loading: boolean,
  ) => (
    <DataView<PrototypeMeta>
      rows={rows}
      fields={fields}
      rowKey={(p) => p.name}
      views={["gallery"]}
      defaultView="gallery"
      storageKey={PROTOTYPES_VIEW}
      loading={loading}
      selectedRowId={selectedName}
      onRowActivate={(p) =>
        openPane(prototypeDetailPane, { name: p.name }, { mode: "push" })
      }
      actions={newButton}
      emptyState="No prototypes yet. New prototype mints one and launches an agent to design it."
      viewOptions={{
        gallery: {
          minCardWidth: 224,
          // The card's cover is the prototype as it actually renders. The
          // id-tinted swatch stays as what a prototype looks like before its
          // picture exists (or when rendering it failed) — the thumbnail owns
          // the picture, this pane owns the stand-in.
          cover: (p: PrototypeMeta) => ({
            kind: "node",
            node: (
              <PrototypeThumbnail
                state={thumbnails[p.name]}
                fallback={<CoverSwatch meta={p} />}
              />
            ),
          }),
        },
      }}
    />
  );

  return matchResource(result, {
    pending: () => renderList([], {}, true),
    error: () => renderList([], {}, true),
    ready: ({ prototypes, thumbnails }) =>
      renderList(prototypes, thumbnails, false),
  });
}
