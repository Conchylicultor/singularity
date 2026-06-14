import { Apps, type ActiveApp, useCurrentAppId, useTabs } from "@plugins/apps/web";
import { DataView } from "@plugins/primitives/plugins/data-view/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { MdAdd } from "react-icons/md";

export function AppGrid() {
  const apps = Apps.App.useContributions();
  const currentId = useCurrentAppId();
  const { focusedTabId, replaceTabApp } = useTabs();
  const launchable = apps.filter((a) => a.id !== currentId);

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
        a.onClick ? a.onClick() : replaceTabApp(focusedTabId, a.id)
      }
      actions={
        <IconButton
          icon={MdAdd}
          label="New app"
          variant="ghost"
          onClick={() => {}}
        />
      }
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
        },
      }}
    />
  );
}
