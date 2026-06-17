import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import { MdRefresh } from "react-icons/md";

export interface SpinnerProps {
  spinning?: boolean;
  className?: string;
}

export function Spinner({ spinning = true, className }: SpinnerProps) {
  return <MdRefresh className={cn(spinning && "animate-spin", className)} />;
}
