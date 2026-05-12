import { useCallback } from "react";
import { useConfigValues } from "@plugins/config/web";
import { cn } from "@/lib/utils";
import { conversationCategoryConfig } from "../../internal";
import { useCategoryColors } from "../internal/use-category-colors";
import {
  COLOR_PALETTE,
  COLOR_KEYS,
  type ColorKey,
  autoColorKey,
} from "../internal/colors";

async function setColor(category: string, colorKey: string): Promise<void> {
  const res = await fetch("/api/conversation-category/colors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ category, colorKey }),
  });
  if (!res.ok) throw new Error(`Failed to set color: ${res.status}`);
}

async function deleteColor(category: string): Promise<void> {
  const res = await fetch(
    `/api/conversation-category/colors/${encodeURIComponent(category)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`Failed to reset color: ${res.status}`);
}

export function CategoryColorSettings() {
  const { categories } = useConfigValues(
    conversationCategoryConfig,
    "conversation-category",
  );
  const overrides = useCategoryColors();

  const handlePick = useCallback(
    async (category: string, key: ColorKey) => {
      if (overrides[category] === key) {
        await deleteColor(category); // toggle off → reset to auto
      } else {
        await setColor(category, key);
      }
    },
    [overrides],
  );

  return (
    <div className="space-y-2">
      {categories.map((category) => {
        const manualKey = overrides[category] as ColorKey | undefined;
        const activeKey = manualKey ?? autoColorKey(category);
        const isAuto = !manualKey;

        return (
          <div key={category} className="flex items-center gap-3">
            {/* Preview chip */}
            <span
              className={cn(
                "inline-flex w-36 shrink-0 truncate items-center rounded-full px-2 py-0.5 text-xs font-medium",
                COLOR_PALETTE[activeKey].chip,
              )}
            >
              {category}
            </span>

            {/* Color swatches */}
            <div className="flex items-center gap-1.5">
              {COLOR_KEYS.map((key) => {
                const isActive = key === activeKey;
                const isManual = isActive && !isAuto;
                const isAutoHighlight = isActive && isAuto;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handlePick(category, key)}
                    title={`${key}${isAutoHighlight ? " (auto)" : ""}`}
                    className={cn(
                      "size-3.5 rounded-full transition-all hover:scale-110",
                      COLOR_PALETTE[key].swatch,
                      isManual &&
                        "ring-2 ring-foreground/70 ring-offset-1 ring-offset-background scale-110",
                      isAutoHighlight &&
                        "ring-1 ring-foreground/30 ring-offset-1 ring-offset-background",
                    )}
                  />
                );
              })}
            </div>

            {/* Auto badge */}
            {isAuto && (
              <span className="text-[10px] text-muted-foreground">auto</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
