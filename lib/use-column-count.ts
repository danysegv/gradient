import { useSyncExternalStore } from "react";

// Column count for the "dealt" grid layout, read from the breakpoint rather
// than set in a useEffect: an effect that calls setState to sync external
// state (matchMedia here) is exactly the pattern React's eslint rules now
// flag, and it would also mean a first paint at the wrong column count on
// every load, corrected a tick later. useSyncExternalStore subscribes
// directly and gives the server snapshot (5 — the 1024px tier) for SSR, so
// hydration has nothing to correct when the viewport is already there.
const BREAKPOINT_QUERIES = [
  "(min-width: 1280px)",
  "(min-width: 1024px)",
  "(min-width: 768px)",
  "(min-width: 640px)",
] as const;

function getColumnCountSnapshot(): number {
  if (window.matchMedia(BREAKPOINT_QUERIES[0]).matches) return 6;
  if (window.matchMedia(BREAKPOINT_QUERIES[1]).matches) return 5;
  if (window.matchMedia(BREAKPOINT_QUERIES[2]).matches) return 4;
  if (window.matchMedia(BREAKPOINT_QUERIES[3]).matches) return 3;
  return 2;
}

function subscribeToBreakpoints(onChange: () => void): () => void {
  const lists = BREAKPOINT_QUERIES.map((q) => window.matchMedia(q));
  lists.forEach((mql) => mql.addEventListener("change", onChange));
  return () => lists.forEach((mql) => mql.removeEventListener("change", onChange));
}

function getServerColumnCount(): number {
  return 5;
}

export function useColumnCount(): number {
  return useSyncExternalStore(
    subscribeToBreakpoints,
    getColumnCountSnapshot,
    getServerColumnCount
  );
}
