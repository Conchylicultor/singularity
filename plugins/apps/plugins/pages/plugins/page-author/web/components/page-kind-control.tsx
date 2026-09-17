import type { ComponentType } from "react";
import { MdAutoAwesome, MdDescription, MdMenuBook } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import {
  ControlPanel,
  ControlPanelPopover,
} from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import {
  cn,
  useControlSize,
  type ControlSize,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  pagesResource,
  pageData,
  pageKindOf,
  setPageKind,
  type PageKind,
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

/** How the control shows each kind: its icon, its name, and its pressed tint. */
const KIND_LOOK: Record<
  PageKind["kind"],
  {
    icon: ComponentType<{ className?: string }>;
    label: string;
    hint: string;
    tint: string | null;
  }
> = {
  page: {
    icon: MdDescription,
    label: "Page",
    hint: "An ordinary page: agents may read it and never write it.",
    tint: null,
  },
  "agent-page": {
    icon: MdAutoAwesome,
    label: "Agent page",
    hint: "Agents can write all of it.",
    // The `info` wash agent notes wear.
    tint: "bg-info/10 text-info hover:bg-info/20 hover:text-info",
  },
  instructions: {
    icon: MdMenuBook,
    label: "Instructions",
    hint: "Your standing instructions to every agent working under the parent page.",
    // The `primary` wash the inline `<instructions>` card wears.
    tint: "bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary",
  },
};

const KIND_ORDER: readonly PageKind["kind"][] = [
  "page",
  "agent-page",
  "instructions",
];

/** The kind a radio row selects — a fresh instructions page starts non-global. */
function kindFor(k: PageKind["kind"]): PageKind {
  return k === "instructions"
    ? { kind: "instructions", global: false }
    : { kind: k };
}

/**
 * The page-kind control contributed to `PageDetail.HeaderActions` — by the
 * user's choice, the ONLY thing on the open page that says what kind of page it
 * is: an ordinary page, an agent page (agents may write all of it), or an
 * instructions page (the human's standing instructions to agents working under
 * the parent page), with a Global switch that hands those instructions to every
 * conversation at its start.
 *
 * One icon button whose icon names the current kind (tinted when it is not an
 * ordinary page), opening a small panel of three radio rows plus the switch. A
 * choice asks the server to change the page's kind (`setPageKind`, the one way a
 * kind changes after a page is born). It is deliberately not optimistic: the
 * trigger changes when the live `pagesResource` push lands — the same push that
 * re-tints the parent page's row and the sidebar.
 *
 * While the pages resource is still loading it renders a placeholder the size of
 * the button, never the button: that would claim a kind before anything is
 * known.
 */
export function PageKindControl({ pageId }: { pageId: string }) {
  const size = useControlSize();
  const result = useResource(pagesResource);
  const { mutateAsync } = useEndpointMutation(setPageKind);

  if (result.pending) {
    return <Loading variant="block" className={ICON_BOX[size]} />;
  }
  const page = result.data.find((p) => p.id === pageId);
  if (!page) return null;
  const kind = pageKindOf(pageData(page));
  const look = KIND_LOOK[kind.kind];

  const choose = async (next: PageKind) => {
    await mutateAsync({ params: { id: pageId }, body: { kind: next } });
  };

  return (
    <ControlPanelPopover
      size="menu"
      align="end"
      label="Page kind"
      trigger={
        <IconButton
          icon={look.icon}
          label={look.label}
          tooltip={`${look.label}: ${look.hint} Click to change.`}
          aria-pressed={kind.kind !== "page"}
          className={cn(look.tint)}
        />
      }
    >
      <ControlPanel.Section label="Page kind">
        {KIND_ORDER.map((k) => (
          <ControlPanel.Row
            key={k}
            select="radio"
            checked={kind.kind === k}
            hint={KIND_LOOK[k].hint}
            onSelect={() => {
              if (kind.kind !== k) void choose(kindFor(k));
            }}
          >
            {KIND_LOOK[k].label}
          </ControlPanel.Row>
        ))}
      </ControlPanel.Section>
      {kind.kind === "instructions" && (
        <ControlPanel.Section>
          <ControlPanel.Row
            select="switch"
            checked={kind.global}
            hint="Hand these instructions to every agent conversation at its start, wherever it works."
            onSelect={() => {
              void choose({ kind: "instructions", global: !kind.global });
            }}
          >
            Global
          </ControlPanel.Row>
        </ControlPanel.Section>
      )}
    </ControlPanelPopover>
  );
}
