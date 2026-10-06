import {
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Bar } from "@plugins/primitives/plugins/bar/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  Button,
  cn,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  PathBar,
  type PathTarget,
} from "@plugins/primitives/plugins/path-bar/web";
import { SurfaceChromeContext } from "@plugins/primitives/plugins/pane/web";
import { useSurfaceShortcuts } from "@plugins/primitives/plugins/shortcuts/web";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { hostFsVolume } from "@plugins/infra/plugins/host-fs/core";
import { symbol } from "@plugins/ui/plugins/icons/core";
import type { HostFsEntry } from "@plugins/infra/plugins/host-fs/core";
import {
  absolutePath,
  baseName,
  formatCount,
  formatSize,
  HOME,
  isWithin,
  joinPath,
  parentPath,
  type EntryRow,
  type LensHideRule,
} from "../../core";
import {
  hostPathSource,
  useHomeDir,
  useRootVolumeName,
} from "../internal/host-path-source";
import { useListings } from "../internal/listings";
import {
  useLocalNavigator,
  type ExplorerNavigator,
} from "../internal/navigator";
import { WithLenses, type ComposedLens } from "../internal/lenses";
import { ExplorerControlsSlot } from "../internal/controls-slot";
import { FileTree, type EntryFilter } from "./file-tree";
import { PreviewPane } from "./preview-pane";

const backIcon = symbol("arrow-back");
const forwardIcon = symbol("arrow-forward");
const upIcon = symbol("arrow-upward");
const hiddenOnIcon = symbol("visibility");
const hiddenOffIcon = symbol("visibility-off");

const SHOW_HIDDEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/** Which lens hide rules are switched to show, by rule id. Absent → hidden. */
type LensShown = Readonly<Record<string, boolean>>;
const NONE_SHOWN: LensShown = {};

export interface FileBrowserProps {
  /**
   * Where the browser is and how it moves. The `/files` app passes its route
   * navigator (back / forward are the browser history; every location is a
   * link). Absent → the browser keeps its own location and history, starting
   * at `initialPath` — for a browser embedded in another surface.
   */
  navigator?: ExplorerNavigator;
  /** Where an embedded browser starts. Default `~`. */
  initialPath?: string;
  /**
   * The highest folder this browser may show: up and the path bar stop here
   * (an embedded browser rooted at a checkout). Absent → the whole host.
   */
  root?: string;
  /**
   * Open a file somewhere else (a consumer with its own preview), given its
   * absolute path. When set, the browser has no preview pane of its own:
   * selecting or opening a file calls this instead.
   */
  onOpenFile?: (path: string) => void;
}

/**
 * A file browser over the host filesystem: a toolbar (back / forward / up, the
 * Dolphin path bar, a filter), the folder as a lazily-listed tree with Name /
 * Modified / Size, a status bar, and the selected file previewed in a
 * resizable pane beside it.
 */
export function FileBrowser(props: FileBrowserProps): ReactNode {
  const home = useHomeDir();
  if (home.kind === "pending") return <Loading variant="rows" />;
  if (home.kind === "failed") {
    return (
      <Placeholder>
        Could not resolve the home directory: {home.message}
      </Placeholder>
    );
  }
  return <FileBrowserReady {...props} home={home.home} />;
}

function FileBrowserReady({
  navigator,
  initialPath = HOME,
  root,
  onOpenFile,
  home,
}: FileBrowserProps & { home: string }): ReactNode {
  const local = useLocalNavigator({ dir: initialPath, open: null });
  const nav = navigator ?? local;
  const { dir, open } = nav.location;
  const { contentOwnsTopChrome, leadingControl } =
    useContext(SurfaceChromeContext);
  const atTopEdge = navigator !== undefined && contentOwnsTopChrome;

  // A device preference, kept like Finder keeps it — so a long TTL.
  const [showHidden, setShowHidden] = useDraft<boolean>(
    "file-explorer:show-hidden",
    false,
    { ttl: SHOW_HIDDEN_TTL_MS },
  );
  const [lensShown, setLensShown] = useDraft<LensShown>(
    "file-explorer:lens-shown",
    NONE_SHOWN,
    { ttl: SHOW_HIDDEN_TTL_MS },
  );

  const listing = (
    <WithLenses dir={absolutePath(dir, home)}>
      {(lens) => (
        <ExplorerControlsSlot.Provider>
          <Listing
            key={dir}
            nav={nav}
            home={home}
            root={root}
            onOpenFile={onOpenFile}
            lens={lens}
            showHidden={showHidden}
            onToggleHidden={() => setShowHidden(!showHidden)}
            lensShown={lensShown}
            onToggleLens={(id) =>
              setLensShown({ ...lensShown, [id]: lensShown[id] !== true })
            }
            leading={atTopEdge ? leadingControl : undefined}
            endSafeArea={atTopEdge && open === null}
          />
        </ExplorerControlsSlot.Provider>
      )}
    </WithLenses>
  );

  // A consumer bringing its own preview gets the listing alone.
  if (onOpenFile !== undefined) return listing;

  return (
    <ResizablePanelGroup orientation="horizontal" id="file-explorer-split">
      <ResizablePanel id="listing" minSize="320px">
        {listing}
      </ResizablePanel>
      {open !== null && (
        <>
          <ResizableHandle />
          <ResizablePanel id="preview" minSize="360px" defaultSize="52%">
            <WithLenses dir={absolutePath(parentPath(open, home) ?? "/", home)}>
              {(lens) => (
                <PreviewPane
                  key={open}
                  path={open}
                  home={home}
                  git={lens.fileGit(absolutePath(open, home))}
                  onClose={() => nav.openFile(null)}
                  endSafeArea={atTopEdge}
                />
              )}
            </WithLenses>
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}

/**
 * One folder's listing: toolbar, tree and status bar. Keyed by the folder, so
 * the filter and the selection start fresh in every folder visited.
 */
function Listing({
  nav,
  home,
  root,
  onOpenFile,
  lens,
  showHidden,
  onToggleHidden,
  lensShown,
  onToggleLens,
  leading,
  endSafeArea,
}: {
  nav: ExplorerNavigator;
  home: string;
  root: string | undefined;
  onOpenFile: ((path: string) => void) | undefined;
  lens: ComposedLens;
  showHidden: boolean;
  onToggleHidden: () => void;
  lensShown: LensShown;
  onToggleLens: (id: string) => void;
  leading: ReactNode;
  endSafeArea: boolean;
}): ReactNode {
  const { dir, open } = nav.location;
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(open);
  const treeRef = useRef<HTMLElement | null>(null);
  const rootName = useRootVolumeName();
  const source = useMemo(
    () => hostPathSource(home, rootName, root),
    [home, rootName, root],
  );
  const { listings, request } = useListings(dir);
  const publishControls = ExplorerControlsSlot.usePublishRef();

  // Show hidden files, then every lens hide rule that is not switched to show.
  const activeHides = useMemo(
    () => lens.hides.filter((rule) => lensShown[rule.id] !== true),
    [lens, lensShown],
  );
  const shows = useCallback<EntryFilter>(
    (entry: HostFsEntry, path: string) => {
      if (!showHidden && entry.hidden) return false;
      if (activeHides.length === 0) return true;
      const abs = absolutePath(path, home);
      return !activeHides.some((rule) => rule.isHidden(abs));
    },
    [showHidden, activeHides, home],
  );

  const atRoot =
    root !== undefined && absolutePath(dir, home) === absolutePath(root, home);
  const up = atRoot ? null : parentPath(dir, home);
  const goTo = (target: PathTarget) => {
    if (target.kind === "dir") nav.navigate(target.path, open);
    else nav.navigate(parentPath(target.path, home) ?? "/", target.path);
  };

  const shortcuts = useMemo(
    () => [
      {
        id: "file-explorer.close-preview",
        keys: "escape",
        label: "Close the preview",
        when: () => open !== null,
        handler: () => nav.openFile(null),
      },
      {
        id: "file-explorer.up",
        keys: "backspace",
        label: "Go to the enclosing folder",
        when: () => up !== null,
        handler: () => {
          if (up !== null) nav.navigate(up, open);
        },
      },
      {
        id: "file-explorer.focus-tree",
        keys: "arrowdown",
        label: "Move into the listing",
        // A focused row walks the tree itself; this only brings focus to it.
        when: (e: KeyboardEvent) =>
          !(e.target instanceof Element && e.target.closest("[data-tree-row]")),
        handler: () => focusRow(treeRef.current, selected),
      },
    ],
    [nav, open, up, selected],
  );
  useSurfaceShortcuts(shortcuts);

  const openFile = (path: string) => {
    if (onOpenFile !== undefined) onOpenFile(absolutePath(path, home));
    else nav.openFile(path);
  };
  const onActivate = (row: EntryRow) => {
    setSelected(row.path);
    if (row.kind !== "dir") openFile(row.path);
  };
  const onOpen = (row: EntryRow) => {
    if (row.kind === "dir") nav.navigate(row.path, open);
    else openFile(row.path);
  };

  const rootListing = listings.get(dir);
  const result = rootListing?.result ?? null;
  const entries =
    result?.kind === "ok"
      ? result.entries.filter((e) => shows(e, joinPath(dir, e.name)))
      : null;

  let body: ReactNode;
  if (rootListing?.error && result === null) {
    body = (
      <ListingProblem message={rootListing.error} retry={rootListing.retry} />
    );
  } else if (rootListing === undefined || result === null) {
    body = <Loading variant="rows" />;
  } else if (result.kind !== "ok") {
    body = (
      <ListingProblem
        message={
          result.kind === "denied"
            ? `You don't have permission to see the contents of “${baseName(dir)}”.`
            : result.kind === "missing"
              ? `“${dir}” does not exist.`
              : `“${dir}” is not a folder.`
        }
        retry={rootListing.retry}
      />
    );
  } else {
    body = (
      <FileTree
        root={dir}
        listings={listings}
        request={request}
        shows={shows}
        query={query}
        onQueryChange={setQuery}
        selectedPath={selected}
        openPath={open}
        onActivate={onActivate}
        onOpen={onOpen}
        emptyState={<Placeholder>This folder is empty</Placeholder>}
      />
    );
  }

  return (
    <Column
      fill
      className="h-full"
      scrollBody={false}
      header={
        <Bar tier="pane" endSafeArea={endSafeArea}>
          {leading}
          <IconButton
            icon={backIcon}
            label="Back"
            variant="ghost"
            disabled={!nav.canBack}
            onClick={nav.back}
          />
          <IconButton
            icon={forwardIcon}
            label="Forward"
            variant="ghost"
            disabled={!nav.canForward}
            onClick={nav.forward}
          />
          <IconButton
            icon={upIcon}
            label="Enclosing folder"
            variant="ghost"
            disabled={up === null}
            onClick={() => {
              if (up !== null) nav.navigate(up, open);
            }}
          />
          <Fill>
            <PathBar path={dir} source={source} onNavigate={goTo} />
          </Fill>
          <SearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                e.currentTarget.blur();
              }
            }}
            placeholder="Filter"
            aria-label="Filter this folder"
            wrapperClassName={cn(open === null ? "w-44" : "w-32")}
          />
          <IconButton
            icon={showHidden ? hiddenOnIcon : hiddenOffIcon}
            label={showHidden ? "Hide hidden files" : "Show hidden files"}
            variant="ghost"
            onClick={onToggleHidden}
          />
          {lens.hides.map((rule) => (
            <LensToggle
              key={rule.id}
              rule={rule}
              shown={lensShown[rule.id] === true}
              onToggle={() => onToggleLens(rule.id)}
            />
          ))}
          {/* The folder view's own controls (view switcher, creators, sort /
              filter / fields), portaled in by the tree's hosted frame. Empty —
              and collapsed — while no tree is mounted. */}
          <Line
            ref={publishControls}
            className={cn(rigidClass(), "gap-sm empty:hidden")}
          />
        </Bar>
      }
      body={
        <Scroll ref={treeRef} className="h-full rail-x-xs">
          {body}
        </Scroll>
      }
      footer={
        <StatusBar
          dir={dir}
          count={entries?.length ?? null}
          selected={selected}
        />
      }
    />
  );
}

/** A lens hide rule's toolbar toggle: "Show ignored files" / "Hide …". */
function LensToggle({
  rule,
  shown,
  onToggle,
}: {
  rule: LensHideRule;
  shown: boolean;
  onToggle: () => void;
}): ReactNode {
  return (
    <IconButton
      icon={rule.icon}
      active={shown}
      aria-pressed={shown}
      label={shown ? `Hide ${rule.label}` : `Show ${rule.label}`}
      variant="ghost"
      onClick={onToggle}
    />
  );
}

/** A folder that cannot be shown, said as such — never as an empty one. */
function ListingProblem({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}): ReactNode {
  return (
    <Center axis="both" className="h-full p-lg">
      <Stack gap="md" align="center">
        <Text as="p" variant="body" className="text-muted-foreground">
          {message}
        </Text>
        <Button variant="outline" onClick={retry}>
          Try again
        </Button>
      </Stack>
    </Center>
  );
}

/** "N items · “name” selected" on the left; the volume's free space on the right. */
function StatusBar({
  dir,
  count,
  selected,
}: {
  dir: string;
  count: number | null;
  selected: string | null;
}): ReactNode {
  const volume = useEndpoint(hostFsVolume, {}, { query: { path: dir } });
  const left = [
    count === null ? null : formatCount(count),
    selected !== null && isWithin(selected, dir)
      ? `“${baseName(selected)}” selected`
      : null,
  ]
    .filter((s) => s !== null)
    .join(" · ");
  return (
    <Text
      as={Line}
      variant="caption"
      className="h-7 gap-md border-t px-md text-muted-foreground"
    >
      <Fill>
        <Text variant="caption">{left}</Text>
      </Fill>
      {volume.data?.kind === "ok" && (
        <Text variant="caption">{formatSize(volume.data.free)} available</Text>
      )}
    </Text>
  );
}

/**
 * Bring keyboard focus into the listing: the selected row, else the first.
 * The rows are the tree's own focusable elements (`data-tree-row`), read
 * inside this listing's own scroll box only.
 */
function focusRow(
  container: HTMLElement | null,
  selected: string | null,
): void {
  if (container === null) return;
  const rows = Array.from(
    container.querySelectorAll<HTMLElement>("[data-tree-row][tabindex]"),
  );
  const target =
    rows.find((r) => r.dataset.treeId === selected) ?? rows[0] ?? null;
  target?.focus();
}
