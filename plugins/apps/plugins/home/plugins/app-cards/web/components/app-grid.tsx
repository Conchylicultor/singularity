import { Apps, type ActiveApp, useCurrentAppId, useTabs } from "@plugins/apps/web";
import { DataView, type CreateOption } from "@plugins/primitives/plugins/data-view/web";
import { useSurfaceTabId } from "@plugins/primitives/plugins/surface-id/web";
import { MdAdd } from "react-icons/md";

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
      onSelect: () => {
        /* TODO: no create-app flow exists yet — stub until one is designed */
      },
    },
  ];

  return (
    <DataView<ActiveApp>
      rows={launchable}
      rowKey={(a) => a.id}
      fields={[
        { id: "name", label: "Name", type: "text", value: (a) => a.tooltip },
      ]}
      views={["gallery"]}
      defaultView="gallery"
      storageKey="home:apps"
      // The grid only renders inside the visible (focused) Home tab, so the
      // launcher navigates that tab into the picked app in place.
      onRowActivate={(a) =>
        a.onClick ? a.onClick() : replaceTabApp(ownTabId ?? focusedTabId, a.id)
      }
      creators={creators}
      emptyState="No apps installed."
      viewOptions={{
        // Plain literal (the gallery view child is never imported) to respect
        // data-view's collection-consumer separation. The icon cover renders
        // the app glyph in the default card's tinted cover frame.
        gallery: {
          cover: (a: ActiveApp) => ({
            kind: "icon",
            icon: <a.icon className="size-7" />,
          }),
          showCreateCard: true,
        },
      }}
    />
  );
}
