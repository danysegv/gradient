// State colour as a mark, never as small type (contrast pass, Daniela,
// 2026-10-16). Oxide measures ~4.1:1 and Slate ~3.7:1 on Ink, under the 4.5:1
// small text needs, so a small label stays Bone and its state colour sits
// beside it as a dot. Large numerals (24px+) may still be coloured.
// "Marks are dots, not squares."
export function StateDot({ tone, className = "" }: { tone: "oxide" | "slate"; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-1.5 w-1.5 flex-none rounded-full ${tone === "oxide" ? "bg-oxide" : "bg-slate"} ${className}`}
    />
  );
}
