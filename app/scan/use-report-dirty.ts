import { useEffect } from "react";

/** Tells the scan screen whether the open form holds input; an unmounted form counts as clean. */
export function useReportDirty(dirty: boolean, onDirtyChange?: (dirty: boolean) => void) {
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
}
