import type { ComponentType } from "react";
import type { IdPresenter } from "@plugins/ids/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { Icon } from "@plugins/ui/plugins/icons/web";

/**
 * The chip a presenter renders by default: the referent's title, led by the
 * kind's icon, opening it on click (a push beside the surface holding the text).
 *
 * Every arm that is not a found referent — loading, failed, missing — renders
 * the id exactly as written, unstyled: it is spliced into a sentence, so a
 * placeholder would move the prose as the read settles, and a chip that opens
 * nothing is worse than the text the model wrote.
 *
 * Built once per presenter (at the family's module eval), so the component's
 * identity is a module constant.
 */
export function genericIdChip(
  presenter: IdPresenter,
): ComponentType<{ content: string; attrs: Record<string, string> }> {
  const { useReferent, useOpen, icon } = presenter;
  function GenericIdChip({ content }: { content: string }) {
    const id = content.trim();
    const referent = useReferent(id);
    const open = useOpen();
    if (referent.status !== "found") return <>{id}</>;
    return (
      <LinkChip
        onClick={(e) => {
          e.stopPropagation();
          open(id);
        }}
        title={`${referent.title} · ${id}`}
        leading={icon ? <Icon icon={icon} /> : undefined}
      >
        {referent.title}
      </LinkChip>
    );
  }
  GenericIdChip.displayName = `IdChip(${presenter.kind.prefix})`;
  return GenericIdChip;
}
