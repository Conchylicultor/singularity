import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MdCheck, MdContentCopy } from "react-icons/md";
import { useCopyToClipboard } from "./use-copy-to-clipboard";

export interface CopyButtonProps {
  text: string;
  title?: string;
  className?: string;
  /** Button size box. "icon"/"icon-xs"/"icon-sm"/"icon-lg" = fixed control squares ("icon" is the default); "inline" = collapses to surrounding text height. */
  size?: "icon" | "icon-xs" | "icon-sm" | "icon-lg" | "inline";
  /** Optional escape hatch to size/style the glyph. Unset → Button's per-size svg fallback (or icon-auto for "inline"). */
  iconClassName?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export function CopyButton({
  text,
  title,
  className,
  size = "icon",
  iconClassName,
  onClick,
}: CopyButtonProps) {
  const { copy, copied } = useCopyToClipboard(text);
  return (
    <Button
      variant="ghost"
      size={size}
      className={className}
      title={title}
      aria-label={title}
      onClick={(e) => { onClick?.(e); copy(); }}
    >
      {copied ? (
        <MdCheck className={iconClassName} />
      ) : (
        <MdContentCopy className={iconClassName} />
      )}
    </Button>
  );
}
