import { MdMusicNote } from "react-icons/md";
import type { CreateOption } from "@plugins/primitives/plugins/data-view/web";
import { openDialog } from "@plugins/primitives/plugins/imperative-dialog/web";
import { UgImportDialog } from "./ug-import-dialog";

/**
 * The UG source's create affordance, contributed to `Library.Source` and mapped
 * by the library into the data-view `creators` "+" menu. Unlike chord-grid (a
 * static starter) or MIDI (a native file picker), UG needs a tab URL up front,
 * so `onSelect` opens the import dialog via the imperative-dialog primitive. The
 * dialog owns fetch → compile → create → open; awaiting its close keeps the "+"
 * control busy while it's open. Fetch-first means the library never gains a
 * half-formed "Untitled" song when the user cancels. Fully imperative — no hooks.
 */
export const ultimateGuitarCreateOption: CreateOption = {
  id: "ultimate-guitar",
  label: "Import from Ultimate Guitar",
  description: "Paste a tab URL to import chords, sections, and lyrics.",
  icon: <MdMusicNote className="size-4" />,
  onSelect: () => openDialog((close) => <UgImportDialog onClose={close} />),
};
