import { useContext, useMemo, type ReactNode } from "react";
import type { Contribution } from "@core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  isRenderSlot,
  RenderSlotSubIdContext,
} from "@plugins/primitives/plugins/slot-render/web";
import { reorderPrefsResource } from "../../shared/resource";

export function ReorderSortMiddleware({
  slotId,
  contributions,
  renderItem,
  children,
}: {
  slotId: string;
  contributions: Contribution[];
  renderItem: (contribution: Contribution) => ReactNode;
  children: ReactNode;
}) {
  const subId = useContext(RenderSlotSubIdContext);
  const storageId = subId ? `${slotId}:${subId}` : slotId;
  const { data: rankMap } = useResource(reorderPrefsResource, {
    slotId: storageId,
  });

  const sorted = useMemo(() => {
    if (!isRenderSlot(slotId)) return null;
    const visible: Contribution[] = [];
    for (const c of contributions) {
      const id = c.id as string | undefined;
      if (!id) continue;
      if (rankMap[id]?.hidden) continue;
      visible.push(c);
    }
    return visible
      .map((c, naturalIdx) => ({ c, naturalIdx }))
      .sort((a, b) => {
        const ar = rankMap[a.c.id as string]?.rank ?? null;
        const br = rankMap[b.c.id as string]?.rank ?? null;
        if (ar && br) return Rank.compare(ar, br);
        if (ar) return -1;
        if (br) return 1;
        return a.naturalIdx - b.naturalIdx;
      })
      .map((r) => r.c);
  }, [slotId, contributions, rankMap]);

  if (!sorted) return <>{children}</>;
  return <>{sorted.map((c) => renderItem(c))}</>;
}
