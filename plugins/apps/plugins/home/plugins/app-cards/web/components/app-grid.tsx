import { Apps, type ActiveApp, useCurrentAppId } from "@plugins/apps-core/web";
import { useTabs } from "@plugins/apps-core/plugins/tabs/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  DataView,
  defineDataView,
  type CreateOption,
} from "@plugins/primitives/plugins/data-view/web";
import { capsuleToolbar } from "@plugins/primitives/plugins/data-view/plugins/capsule-toolbar/web";
import { avatarFieldDef } from "@plugins/fields/plugins/avatar/plugins/table/web";
import { useSurfaceTabId } from "@plugins/primitives/plugins/scope/plugins/surface-id/web";
import { MdAdd } from "react-icons/md";
import { openDialog } from "@plugins/primitives/plugins/overlay/plugins/imperative-dialog/web";
import { LaunchAgentForm } from "@plugins/primitives/plugins/launch/web";
import { APPS_CATEGORY_ID } from "@plugins/apps/plugins/home/core";
import {
  mintPrototypeFolder,
  newPrototypePrompt,
} from "@plugins/apps/plugins/prototypes/plugins/gallery/web";

const HOME_APPS_VIEW = defineDataView("home.apps");

const PROTOTYPE_FIRST = "prototype-first";

// The prompt every "New app" agent starts from. It points at the create-app
// skill (where an app lives and how its shell is shaped) and asks for a plan
// first, since an app is a feature, not a one-line change. The user's own words
// follow as the description of what to build.
//
// With "Prototype first", the agent designs a throwaway mock before any plugin
// code — the same instructions a "New prototype" agent gets, in a folder minted
// here — and waits for the user's review of it in Prototypes.
function newAppPrompt(userText: string, prototypeId: string | null): string {
  const app = [
    "Read the `create-app` skill before writing anything, and follow it.",
    "Start with the `plan` skill: an app is a feature, so design it (what it",
    "shows, its data, which existing plugins it composes) and check the design",
    "with me before implementing.",
    "",
    "Then implement it, run `./singularity build`, and give me the app's URL so I",
    "can try it in your worktree. Do not push.",
  ];
  const parts = ["Build a new top-level Singularity app."];
  if (prototypeId) {
    parts.push(
      [
        "Work in two steps.",
        "",
        "## Step 1 — prototype",
        "",
        "Before any plugin code, design the app as a throwaway prototype. The",
        "rules below hold until I approve the prototype:",
        "",
        newPrototypePrompt(prototypeId),
        "",
        "When it is ready, stop and ask me to review it in the Prototypes app.",
        "Iterate on it with me until I approve it.",
        "",
        "## Step 2 — the app",
        "",
        "Build the app from the approved prototype.",
        ...app,
        "Once the app is built, add",
        '`<meta name="mocks" content="app:/<the app\'s path>">` to the prototype so',
        "the Compare stage puts the mock and the real app side by side.",
      ].join("\n"),
    );
  } else {
    parts.push(app.join("\n"));
  }
  parts.push(
    userText.trim()
      ? `The app I want:\n${userText.trim()}`
      : "I have not described the app yet — ask me what it should do.",
  );
  return parts.join("\n\n");
}

/** Opens the launch-agent form for a new app. A dialog rather than a popover,
 *  because the create affordance renders in several shapes (the capsule's round
 *  `+`, the no-match empty state's "Build one?") and a dialog serves them all
 *  from one callback. Launching files a task under the Apps category and starts
 *  it in the background; the bell announces the conversation, like "New
 *  prototype". */
function newApp(): void {
  void openDialog(
    (close) => (
      <LaunchAgentForm
        title="New app"
        description="Describe the app you want. An agent plans it with you, builds it in its own worktree, and hands you a link to try it before anything ships."
        placeholder="What should the app do? e.g. a reading list that saves links and tracks what I've finished…"
        toggles={[
          {
            id: PROTOTYPE_FIRST,
            label: "Prototype first",
            description:
              "Design a throwaway mockup you review in Prototypes before any app code.",
          },
        ]}
        getRequest={async (userText, toggles) => {
          // Minted before launch, so the agent is handed a folder that exists;
          // a failed mint rejects and the launch never happens.
          const prototypeId = toggles[PROTOTYPE_FIRST]
            ? await mintPrototypeFolder()
            : null;
          return {
            prompt: newAppPrompt(userText, prototypeId),
            categoryId: APPS_CATEGORY_ID,
          };
        }}
        // Close on either outcome: the task is filed whether or not the
        // agent started.
        onSubmitted={() => close()}
      />
    ),
    { size: "lg" },
  );
}

export function AppGrid() {
  const apps = Apps.App.useContributions();
  const currentId = useCurrentAppId();
  const { focusedTabId, replaceTabApp } = useTabs();
  // Target the grid's OWN surface tab — in desktop mode multiple Home windows
  // can be open, so the global focused tab is the wrong target. Falls back to
  // the focused tab when rendered outside a surface.
  const ownTabId = useSurfaceTabId();
  const launchable = apps.filter((a) => a.id !== currentId);

  const creators: CreateOption[] = [
    {
      id: "new-app",
      label: "New app",
      icon: <MdAdd className="size-4" />,
      onSelect: newApp,
    },
  ];

  return (
    <DataView<ActiveApp>
      rows={launchable}
      rowKey={(a) => a.id}
      fields={[
        // The app's icon is its tile: a squircle in the app's declared colour,
        // or one derived from its id when it declares none.
        avatarFieldDef<ActiveApp>({
          id: "icon",
          label: "Icon",
          leading: true,
          avatar: (a) => ({
            icon: null,
            svgNodes: a.icon.svgNodes,
            color: a.icon.color ?? null,
            shape: "squircle",
            fallbackKey: a.id,
          }),
        }),
        { id: "name", label: "Name", type: "text", value: (a) => a.app.name },
      ]}
      views={["icons"]}
      defaultView="icons"
      toolbar={capsuleToolbar}
      searchPlaceholder="Search apps"
      storageKey={HOME_APPS_VIEW}
      // The grid only renders inside the visible (focused) Home tab, so the
      // launcher navigates that tab into the picked app in place.
      onRowActivate={(a) =>
        a.onClick ? a.onClick() : replaceTabApp(ownTabId ?? focusedTabId, a.id)
      }
      creators={creators}
      // Every install has apps, so an empty grid is a search that matched
      // nothing — which is when building the missing app is the useful offer.
      emptyState={
        <>
          No app matches.{" "}
          <Button variant="link" aspect="inline" onClick={newApp}>
            Build one?
          </Button>
        </>
      }
    />
  );
}
