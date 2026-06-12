import { useEffect, useRef } from "react";

export function defineCommand<Args, Return = void>(id: string) {
  // A stack, not a single slot: the same provider component can legitimately be
  // mounted in two places at once (e.g. ActionBar.Item renders into both the
  // main toolbar and the floating bar). The most-recently-mounted handler is
  // active; when it unmounts the previous one transparently resumes. A single
  // slot would let an unmounting provider null a handler another live provider
  // still owns — during navigation that surfaces as "No handler for command".
  const handlers: Array<(args: Args) => Return> = [];

  return Object.assign(
    (args: Args): Return => {
      const handler = handlers[handlers.length - 1];
      if (!handler) throw new Error(`No handler for command "${id}"`);
      return handler(args);
    },
    {
      id,
      useHandler(fn: (args: Args) => Return) {
        const ref = useRef(fn);
        ref.current = fn;
        useEffect(() => {
          const handler = (args: Args) => ref.current(args);
          handlers.push(handler);
          return () => {
            const i = handlers.indexOf(handler);
            if (i !== -1) handlers.splice(i, 1);
          };
        }, []);
      },
    },
  );
}
