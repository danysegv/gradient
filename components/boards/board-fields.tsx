import { DESCRIPTION_MAX, TITLE_MAX } from "@/lib/boards/input";

// Shared by "New board" and "Edit board", so both enforce the same limits
// the database does.
export function BoardFields({
  idPrefix,
  defaults,
}: {
  idPrefix: string;
  defaults?: { title: string; description: string | null; isPublic: boolean };
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`${idPrefix}-title`}
          className="text-[11px] font-semibold uppercase tracking-wide text-bone/70"
        >
          Title
        </label>
        <input
          id={`${idPrefix}-title`}
          name="title"
          required
          maxLength={TITLE_MAX}
          defaultValue={defaults?.title}
          placeholder="Spring campaign"
          className="rounded-[3px] border border-white/15 bg-ink px-3 py-2 text-[14px] text-bone placeholder:text-bone/45 focus:border-bone/60 focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`${idPrefix}-description`}
          className="text-[11px] font-semibold uppercase tracking-wide text-bone/70"
        >
          Description
        </label>
        <textarea
          id={`${idPrefix}-description`}
          name="description"
          rows={3}
          maxLength={DESCRIPTION_MAX}
          defaultValue={defaults?.description ?? ""}
          placeholder="What this board is for"
          className="resize-y rounded-[3px] border border-white/15 bg-ink px-3 py-2 text-[14px] leading-relaxed text-bone placeholder:text-bone/45 focus:border-bone/60 focus:outline-none"
        />
      </div>
      <label
        htmlFor={`${idPrefix}-public`}
        className="flex items-start gap-2.5 text-[13px] text-bone/85"
      >
        <input
          id={`${idPrefix}-public`}
          name="is_public"
          type="checkbox"
          defaultChecked={defaults?.isPublic ?? false}
          className="mt-[3px] h-4 w-4 accent-[#E7E3D8]"
        />
        <span>
          Show on my profile
          <span className="block text-[12px] text-bone/60">
            Off: only you see this board.
          </span>
        </span>
      </label>
    </>
  );
}
