import { forwardRef, type ComponentType, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface PaneIconActionProps {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onClick?: () => void;
  children?: ReactNode;
}

/**
 * Standard ghost icon button for `pane.Actions` contributions. Wraps a
 * `<Button variant="ghost" size="icon">` and renders `icon` (or
 * `children`) sized to fit the chrome bar. Forwards refs so it composes
 * with components that need a button ref (tooltips, dropdowns, etc.).
 */
export const PaneIconAction = forwardRef<
  HTMLButtonElement,
  PaneIconActionProps
>(function PaneIconAction({ label, icon: Icon, onClick, children }, ref) {
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children ?? (Icon ? <Icon className="size-4" /> : null)}
    </Button>
  );
});
