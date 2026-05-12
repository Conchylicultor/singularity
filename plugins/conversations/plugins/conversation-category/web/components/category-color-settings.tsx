import { useCallback } from "react";
import { Avatar, AvatarPicker, type AvatarSpec } from "@plugins/primitives/plugins/avatar/web";
import { useConfigValues } from "@plugins/config/web";
import { conversationCategoryConfig } from "../../shared";
import { useCategoryColors } from "../internal/use-category-colors";
import { autoColorKey } from "../internal/colors";

async function setAvatar(category: string, spec: AvatarSpec): Promise<void> {
  const res = await fetch("/api/conversation-category/colors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ category, colorKey: spec.color, iconKey: spec.icon }),
  });
  if (!res.ok) throw new Error(`Failed to set avatar: ${res.status}`);
}

async function deleteAvatar(category: string): Promise<void> {
  const res = await fetch(
    `/api/conversation-category/colors/${encodeURIComponent(category)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`Failed to reset avatar: ${res.status}`);
}

export function CategoryColorSettings() {
  const { categories } = useConfigValues(
    conversationCategoryConfig,
    "conversation-category",
  );
  const overrides = useCategoryColors();

  const handleChange = useCallback(
    async (category: string, next: AvatarSpec) => {
      if (!next.icon && !next.color) {
        await deleteAvatar(category);
      } else {
        await setAvatar(category, next);
      }
    },
    [],
  );

  return (
    <div className="space-y-3">
      {categories.map((category) => {
        const override = overrides[category];
        const spec: AvatarSpec = {
          icon: override?.iconKey ?? null,
          color: override?.colorKey ?? null,
        };
        const isAuto = !spec.icon && !spec.color;
        const autoColor = autoColorKey(category);

        return (
          <div key={category} className="flex items-center gap-3">
            <AvatarPicker
              value={spec}
              onChange={(next) => handleChange(category, next)}
              triggerLabel={`Edit avatar for ${category}`}
            >
              <Avatar
                icon={spec.icon}
                color={spec.color ?? autoColor}
                size="sm"
                title={category}
              />
            </AvatarPicker>

            <span className="text-sm">{category}</span>

            {isAuto && (
              <span className="text-[10px] text-muted-foreground">auto</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
