// The eight taxonomy axes, in display order. One list, imported everywhere
// a page groups tags by axis. Before 2026-09-11 the filter chips and the
// clip page each kept their own six-axis copy, so `medium` and `subject`
// (added 2026-09-08) could never be filtered on or shown as traits.
export const AXES = [
  { key: "movement", label: "Movement" },
  { key: "typography", label: "Typography" },
  { key: "palette_light", label: "Palette & Light" },
  { key: "layout", label: "Layout" },
  { key: "treatment", label: "Treatment" },
  { key: "medium", label: "Medium" },
  { key: "subject", label: "Subject" },
  { key: "format_motion", label: "Format & Motion" },
] as const;

export type AxisKey = (typeof AXES)[number]["key"];

export const AXIS_LABEL: Record<string, string> = Object.fromEntries(
  AXES.map((a) => [a.key, a.label])
);
