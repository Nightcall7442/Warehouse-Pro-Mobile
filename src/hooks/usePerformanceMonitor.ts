import { useRef, useCallback } from "react";

export function usePerformanceMonitor(label: string) {
  const marks = useRef<Map<string, number>>(new Map());

  const start = useCallback((markName?: string) => {
    const key = markName ?? label;
    marks.current.set(key, performance.now());
  }, [label]);

  const end = useCallback((markName?: string) => {
    const key = markName ?? label;
    const startTime = marks.current.get(key);
    if (startTime !== undefined) {
      const duration = performance.now() - startTime;
      if (__DEV__) {
        console.log(`[Perf] ${key}: ${duration.toFixed(1)}ms`);
      }
      marks.current.delete(key);
      return duration;
    }
    return 0;
  }, [label]);

  const measure = useCallback((fn: () => void, markName?: string) => {
    const key = markName ?? label;
    start(key);
    fn();
    return end(key);
  }, [label, start, end]);

  return { start, end, measure };
}
