import { useEffect, useRef } from "react";

export function defineCommand<Args, Return = void>(id: string) {
  let handler: ((args: Args) => Return) | null = null;

  return Object.assign(
    (args: Args): Return => {
      if (!handler) throw new Error(`No handler for command "${id}"`);
      return handler(args);
    },
    {
      id,
      useHandler(fn: (args: Args) => Return) {
        const ref = useRef(fn);
        ref.current = fn;
        useEffect(() => {
          if (handler !== null) {
            console.error(
              `Command "${id}" already has a handler. Two components called useHandler for the same command — this is a bug.`,
            );
          }
          handler = (args) => ref.current(args);
          return () => {
            handler = null;
          };
        }, []);
      },
    },
  );
}
