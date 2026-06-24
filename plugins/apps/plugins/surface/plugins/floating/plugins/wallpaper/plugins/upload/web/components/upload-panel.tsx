import { useRef } from "react";
import { MdUpload } from "react-icons/md";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { WallpaperCandidate } from "@plugins/apps/plugins/surface/plugins/floating/plugins/wallpaper/web";

/**
 * Upload provider Panel: pick a local image file. A hidden `<input type="file">`
 * is driven by a styled Button (the accessible label + click target); selecting a
 * file emits a `file` candidate and the picker funnels it through the upload
 * endpoint, which validates it server-side.
 */
export function UploadPanel({
  onPick,
}: {
  onPick: (candidate: WallpaperCandidate) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so re-picking the same file still fires `change`.
    e.target.value = "";
    if (file) onPick({ kind: "file", file });
  }

  return (
    <Stack gap="sm" align="center">
      <Button type="button" onClick={() => inputRef.current?.click()}>
        <MdUpload className="icon-auto" />
        Choose image…
      </Button>
      <Text variant="caption" tone="muted">
        Pick an image from your computer.
      </Text>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
    </Stack>
  );
}
