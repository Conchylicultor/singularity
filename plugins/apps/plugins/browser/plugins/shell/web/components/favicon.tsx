import { useState } from "react";
import { MdPublic } from "react-icons/md";

export interface FaviconProps {
  /** Full URL whose host's favicon to show. */
  url: string;
  /** Pixel size of the icon box. Defaults to 16. */
  size?: number;
}

/** Parse a URL's hostname; returns `""` for unparseable / empty input. */
function hostOf(url: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch (err) {
    if (err instanceof TypeError) return ""; // invalid URL — expected
    throw err;
  }
}

/**
 * A site favicon via Google's favicon service, falling back to a globe icon on
 * load error (degrades offline). Self-contained and reusable across the browser
 * sub-plugins (bookmarks bar, start page tiles, …).
 */
export function Favicon({ url, size = 16 }: FaviconProps) {
  const host = hostOf(url);
  const [failed, setFailed] = useState(false);

  if (!host || failed) {
    return <MdPublic style={{ width: size, height: size }} />;
  }

  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}
