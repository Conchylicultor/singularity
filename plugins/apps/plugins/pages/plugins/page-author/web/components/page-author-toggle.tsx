import { MdAutoAwesome } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import {
  cn,
  useControlSize,
  type ControlSize,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  pagesResource,
  pageData,
  setPageAuthor,
} from "@plugins/page/plugins/editor/core";

/**
 * The square an icon button occupies at each density, so the placeholder holds
 * exactly the button's place in the strip and nothing shifts when it arrives.
 * Spelled out per density because Tailwind only emits class names it can see as
 * literals (a `control-icon-${size}` template would compile to nothing).
 */
const ICON_BOX: Record<ControlSize, string> = {
  xs: "control-icon-xs",
  sm: "control-icon-sm",
  md: "control-icon-md",
  lg: "control-icon-lg",
};

/**
 * The agent-page toggle contributed to `PageDetail.HeaderActions` — by the
 * user's choice, the ONLY thing on the open page that says it is an agent page.
 *
 * On an agent-authored page (`author: "agent"`) it is pressed and tinted blue,
 * the same `info` wash agent notes wear; on any other page it is a plain ghost
 * icon. A click asks the server to flip the page's author (`setPageAuthor`, the
 * one way an author changes after a page is born). It is deliberately not
 * optimistic: the button pends while the request is in flight, and the icon
 * flips when the live `pagesResource` push lands — the same push that re-tints
 * the parent page's row and the sidebar.
 *
 * While the pages resource is still loading it renders a placeholder the size
 * of the button, never the unpressed button: that would claim "this is not an
 * agent page" before anything is known.
 */
export function PageAuthorToggle({ pageId }: { pageId: string }) {
  const size = useControlSize();
  const result = useResource(pagesResource);
  const { mutateAsync } = useEndpointMutation(setPageAuthor);

  if (result.pending) {
    return <Loading variant="block" className={ICON_BOX[size]} />;
  }
  const page = result.data.find((p) => p.id === pageId);
  if (!page) return null;
  const isAgent = pageData(page).author === "agent";

  const toggle = async () => {
    await mutateAsync({
      params: { id: pageId },
      body: { author: isAgent ? "human" : "agent" },
    });
  };

  return (
    <IconButton
      icon={MdAutoAwesome}
      label={isAgent ? "Agent page" : "Make agent page"}
      tooltip={
        isAgent
          ? "Agent page: agents can write all of it. Click to make it a normal page."
          : "Make this an agent page: agents will be able to write all of it."
      }
      aria-pressed={isAgent}
      onClick={toggle}
      // The ghost button's own hover turns it neutral grey; a pressed toggle
      // keeps its blue under the pointer too, one step stronger.
      className={cn(
        isAgent && "bg-info/10 text-info hover:bg-info/20 hover:text-info",
      )}
    />
  );
}
