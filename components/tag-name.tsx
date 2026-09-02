// A tag carries two names: the editorial name that gives 04AM its voice
// (BoldGrotesk) and the universal term a working designer would actually
// search for (Grotesk). Both already live on the tags row — universal_term
// is NOT NULL and populated for all 21 — but until 2026-09-02 only the
// editorial name reached the surfaces where a tag is *chosen*, which made
// the taxonomy hard to navigate even for the person who wrote it.
//
// They travel together anywhere a tag is offered as something to pick or
// read. Card chips are deliberately excluded: those sit in a hover scrim
// over the image, where a second line costs more than it returns.
export function TagName({
  editorial,
  universal,
  size = "sm",
  subClassName = "text-bone/70",
}: {
  editorial: string;
  universal: string;
  size?: "sm" | "lg";
  /** Override the universal term's colour when the ground changes — the
   * selected filter pill is Oxide, where bone/70 loses contrast. */
  subClassName?: string;
}) {
  return (
    <span className="block text-left">
      <span
        className={
          size === "lg"
            ? "block text-[15px] font-semibold leading-tight"
            : "block text-[11px] font-semibold uppercase leading-tight tracking-wide"
        }
      >
        {editorial}
      </span>
      <span
        className={`block font-normal normal-case leading-tight tracking-normal ${subClassName} ${
          size === "lg" ? "mt-1 text-[13px]" : "mt-px text-[10px]"
        }`}
      >
        {universal}
      </span>
    </span>
  );
}
