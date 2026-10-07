# File explorer: folder item counts in Size, bounded to the screen (v2)

Supersedes `2026-10-07-apps-file-explorer-item-count.md` (v1).

## Why v1 was wrong

v1 added a hidden-by-default **Items** column and gated its reads on whether
the field was in use (a new DataView `isInUse` signal). Two problems:

1. **The cost was bounded by the wrong thing.** While Items was in use, v1
   peeked every folder row in the tree, on screen or not. A folder with 2,000
   subfolders cost 2,000 directory reads. "Pay only while shown" means paying
   for the rows on screen.
2. **The count appeared twice.** An expanded folder showed "2 items" under
   Size and "2" under Items.

The tree already windows its rows: above 100 visible rows it renders only the
on-screen ones plus an overscan of 8 (`tree-list.tsx`, `VirtualRows`). A
hidden column renders no cells. So a count that each **rendered cell** asks for
is bounded by the screen, and costs nothing for a hidden column, with no new
machinery.

## Design

- **The count lives in the Size column.** A folder's Size cell shows "N items"
  for every folder on screen, expanded or not.
- **Sorting.** Decided: no sort by count. Size still sorts by bytes, and a
  folder's sort value stays null. Sorting by count would need every folder's
  count, which cannot be bounded to the screen.
- **A rendered folder cell asks for its own count.**
  - An expanded folder counts its own listing, with no read.
  - Otherwise the cell calls `useFolderPeek(path)`. That is a per-path query
    whose fetch goes through a module batcher: every path asked for in the
    same macrotask (`yieldMacrotask`) goes into one `POST /api/host-fs/peek`,
    chunked to the cap.
  - The query key carries the tree's **visit id**. Scrolling away and back
    hits the cache, while a new visit re-reads, just as a listing does.
- **Visibility rules.** The peek returns names and a hidden flag, and the cell
  applies the browser's `shows` rule to them. The count matches the expanded
  count, Show hidden files and lens hide rules included.
- **States.** These come from the kept `itemCount` (dir-only now). None of them
  is ever 0.

  | State | Size cell shows |
  |---|---|
  | denied | "No access" |
  | unreadable archive | "Unreadable", tooltip with the reason |
  | gone | "—" |
  | more than 10,000 entries | "N items", tooltip "counted without visibility rules" |
  | loading | shimmer |

  An archive *file* is a file: its Size cell stays its bytes.

## Kept from v1

- The host-fs `peek` endpoint: names only, one `readdir` per folder, the
  cached index inside an archive, typed denied / missing / not-a-dir /
  unreadable / archive answers, plus its tests.
- `itemCount` in browser core plus its test, simplified: dir rows only, no
  sort value.

## Dropped from v1

- The DataView `isInUse` change (types, fold threading, `fieldInUse` and its
  test, the CLAUDE.md section).
- The Items field, `tree-context`, the all-folders `folder-peeks`, and the
  `fields.jsonc` order seed.

## Verification

- Unit tests: `peek` (kept), `itemCount` (updated).
- e2e `item-count-verify.ts` (rewritten):
  - Fixture: three / empty / locked / a zip, plus **300 subfolders**.
  - Unexpanded folders show counts in Size: "2 items", "0 items", "No access".
  - Show hidden files counts the dotfile.
  - A folder inside the zip is counted.
  - **The paths peeked stay far below 300**, which proves the screen bound.
  - Scrolling to the bottom counts the folders there.
