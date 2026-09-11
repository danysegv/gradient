// Validation for board forms, mirroring the table's check constraints so a
// bad value comes back as a sentence rather than a Postgres error.
export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 500;

export type BoardInput = {
  title: string;
  description: string | null;
  isPublic: boolean;
};

type FormLike = { get(name: string): unknown };

export function parseBoardInput(
  form: FormLike
): { value: BoardInput } | { error: string } {
  const rawTitle = form.get("title");
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  if (!title) return { error: "Give the board a title." };
  if (title.length > TITLE_MAX) {
    return { error: `Keep the title under ${TITLE_MAX} characters.` };
  }

  const rawDescription = form.get("description");
  const description =
    typeof rawDescription === "string" && rawDescription.trim()
      ? rawDescription.trim()
      : null;
  if (description && description.length > DESCRIPTION_MAX) {
    return {
      error: `Keep the description under ${DESCRIPTION_MAX} characters.`,
    };
  }

  // A checkbox is present as "on" when ticked and absent when not.
  const isPublic = form.get("is_public") === "on";
  return { value: { title, description, isPublic } };
}

const UUID =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
