import { MdCheckCircle, MdFlag } from "react-icons/md";

export function TokenChip({
  children,
}: {
  children: string;
  attrs: Record<string, string>;
}) {
  const token = children.trim();

  if (token === "EXIT_CLEAN") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
        <MdCheckCircle className="size-3 shrink-0" />
        Clean exit
      </span>
    );
  }

  if (token === "FLAG_RAISE") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        <MdFlag className="size-3 shrink-0" />
        Flag raised
      </span>
    );
  }

  return null;
}
