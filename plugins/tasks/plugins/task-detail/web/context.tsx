import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type FilePeekState = {
  filePath: string | null;
  openFile: (path: string) => void;
  closeFile: () => void;
};

type FlushFn = () => Promise<void> | void;

type FlushRegistry = {
  register: (fn: FlushFn) => () => void;
  flushAll: () => Promise<void>;
};

const NOOP_PEEK: FilePeekState = {
  filePath: null,
  openFile: () => {},
  closeFile: () => {},
};

const NOOP_FLUSH: FlushRegistry = {
  register: () => () => {},
  flushAll: async () => {},
};

const TaskDetailFilePeekCtx = createContext<FilePeekState>(NOOP_PEEK);
const TaskDetailFlushCtx = createContext<FlushRegistry>(NOOP_FLUSH);

export function TaskDetailFilePeekProvider({
  override,
  children,
}: {
  override?: Pick<FilePeekState, "openFile">;
  children: ReactNode;
}) {
  const [filePath, setFilePath] = useState<string | null>(null);
  const overrideOpen = override?.openFile;
  const value = useMemo<FilePeekState>(
    () =>
      overrideOpen
        ? { filePath: null, openFile: overrideOpen, closeFile: () => {} }
        : {
            filePath,
            openFile: setFilePath,
            closeFile: () => setFilePath(null),
          },
    [filePath, overrideOpen],
  );

  const fns = useRef(new Set<FlushFn>());
  const flushValue = useMemo<FlushRegistry>(
    () => ({
      register: (fn) => {
        fns.current.add(fn);
        return () => {
          fns.current.delete(fn);
        };
      },
      flushAll: async () => {
        await Promise.all([...fns.current].map((f) => Promise.resolve(f())));
      },
    }),
    [],
  );

  return (
    <TaskDetailFilePeekCtx.Provider value={value}>
      <TaskDetailFlushCtx.Provider value={flushValue}>
        {children}
      </TaskDetailFlushCtx.Provider>
    </TaskDetailFilePeekCtx.Provider>
  );
}

export function useTaskDetailFilePeek() {
  return useContext(TaskDetailFilePeekCtx);
}

export function useFlushAll() {
  return useContext(TaskDetailFlushCtx).flushAll;
}

export function useRegisterFlush(fn: FlushFn) {
  const { register } = useContext(TaskDetailFlushCtx);
  const stable = useCallback(fn, [fn]);
  useEffect(() => register(stable), [register, stable]);
}
