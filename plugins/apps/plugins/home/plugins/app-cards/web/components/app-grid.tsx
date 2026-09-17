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

const HOME_APPS_VIEW = defineDataView("home.apps");

/** No create-app flow exists yet — a stub until one is designed. Shared by the
 *  capsule's New app button and the no-match empty state's "Build one?". */
function newApp(): void {
  /* TODO: open the create-app flow once it exists */
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
