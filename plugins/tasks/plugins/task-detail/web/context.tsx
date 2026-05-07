import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

type FlushFn = () => Promise<void> | void;

type FlushRegistry = {
  register: (fn: FlushFn) => () => void;
  flushAll: () => Promise<void>;
};

type TaskNavigateHandler = (taskId: string) => void;

const NOOP_FLUSH: FlushRegistry = {
  register: () => () => {},
  flushAll: async () => {},
};

const TaskDetailFlushCtx = createContext<FlushRegistry>(NOOP_FLUSH);
const TaskNavigateCtx = createContext<TaskNavigateHandler | undefined>(undefined);

export function TaskDetailFlushProvider({ children }: { children: ReactNode }) {
  const fns = useRef(new Set<FlushFn>());
  const value = useMemo<FlushRegistry>(
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
    <TaskDetailFlushCtx.Provider value={value}>
      {children}
    </TaskDetailFlushCtx.Provider>
  );
}

export function useFlushAll() {
  return useContext(TaskDetailFlushCtx).flushAll;
}

export function useRegisterFlush(fn: FlushFn) {
  const { register } = useContext(TaskDetailFlushCtx);
  const stable = useCallback(fn, [fn]);
  useEffect(() => register(stable), [register, stable]);
}

export const TaskNavigateProvider = TaskNavigateCtx.Provider;

export function useTaskNavigate(): TaskNavigateHandler | undefined {
  return useContext(TaskNavigateCtx);
}
