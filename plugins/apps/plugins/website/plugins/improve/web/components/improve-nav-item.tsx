import { useState } from "react";
import { MdAutoAwesome } from "react-icons/md";
import { InlinePopover } from "@plugins/primitives/plugins/overlay/plugins/popover/web";
import { useActionForm } from "@plugins/primitives/plugins/action-presentation/web";
import { WebsiteNavLink } from "@plugins/apps/plugins/website/plugins/shell/web";
import { EMPTY_DRAFT, ImprovePanel, type ImproveDraft } from "./improve-panel";

/**
 * "Improve" in the shared site header — the header's one call to action, so the
 * filled pill, with the same sparkle equin's own Improve button wears.
 *
 * It opens a panel hung off its trailing edge (`align="end"`: the button is the
 * last item in the header, so the panel grows back over the page rather than off
 * the side of it). The pill takes the accent fill while the panel is open, which
 * `WebsiteNavLink` reads from the trigger's `aria-expanded`.
 *
 * The draft lives HERE, above the panel, because the panel unmounts when the
 * popover closes: a visitor who clicks away mid-sentence gets their words back
 * when they reopen it. Filing is the one thing that clears it.
 *
 * On a narrow screen the header runs out of room and moves items into its "⋯"
 * menu. The call to action is the one item that must stay, so it pins itself
 * at full size; the page links give way instead.
 */
export function ImproveNavItem() {
  useActionForm({ yields: "never" });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ImproveDraft>(EMPTY_DRAFT);
  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      align="end"
      width="2xl"
      padding="lg"
      trigger={
        <WebsiteNavLink
          label="Improve"
          emphasis="strong"
          icon={<MdAutoAwesome />}
        />
      }
    >
      <ImprovePanel
        draft={draft}
        onDraftChange={setDraft}
        onFiled={() => {
          setOpen(false);
          setDraft(EMPTY_DRAFT);
        }}
      />
    </InlinePopover>
  );
}
