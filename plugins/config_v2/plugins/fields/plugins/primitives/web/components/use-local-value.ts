import { useEffect, useRef, useState } from "react";

export function useLocalValue(incoming: string) {
  const [local, setLocal] = useState(incoming);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setLocal(incoming);
  }, [incoming]);
  return {
    local,
    setLocal,
    focus: {
      onFocus: () => {
        focused.current = true;
      },
      onBlur: () => {
        focused.current = false;
      },
    },
  };
}
