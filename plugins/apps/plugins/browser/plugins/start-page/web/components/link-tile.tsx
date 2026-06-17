import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { TruncatingText } from "@plugins/primitives/plugins/css/plugins/truncating-text/web";
import { Favicon } from "@plugins/apps/plugins/browser/plugins/shell/web";

/** Parse a URL's hostname; falls back to the raw string for unparseable input. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch (err) {
    if (err instanceof TypeError) return url; // invalid URL — expected
    throw err;
  }
}

interface LinkTileProps {
  url: string;
  /** Display label; defaults to the URL's hostname. */
  label?: string;
  onClick: () => void;
}

/**
 * A clickable favicon tile used by the quick-links and bookmarks grids: an
 * interactive Card with a centered favicon over a single-line label.
 */
export function LinkTile({ url, label, onClick }: LinkTileProps) {
  const text = label ?? hostOf(url);
  return (
    <Card as="button" interactive onClick={onClick} title={text}>
      <Stack gap="xs" align="center">
        <Favicon url={url} size={28} />
        <TruncatingText className="w-full text-center">{text}</TruncatingText>
      </Stack>
    </Card>
  );
}
