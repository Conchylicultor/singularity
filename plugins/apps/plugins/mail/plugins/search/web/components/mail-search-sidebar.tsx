import { MdSearch } from "react-icons/md";
import { SidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { mailSearchPane } from "../panes";

/**
 * The Mail sidebar's Search entry. Opening replaces the surface route with the
 * search pane (`mode: "root"`) so it fills the mailbox surface. Rendered by the
 * `Mail.Sidebar` slot, which mounts the component with no props.
 */
export function MailSearchSidebar() {
  const openPane = useOpenPane();
  return (
    <SidebarNavItem
      icon={MdSearch}
      title="Search"
      onClick={() => openPane(mailSearchPane, {}, { mode: "root" })}
    />
  );
}
