// A curator's picture, as a square tile.
//
// THIS CROPS, and it is the second and last deliberate exception to the
// rule in lib/clip-images.test.ts. The reasoning is different from a clip's:
// a clip is a reference, and cropping it shows a designer a composition
// nobody clipped. An avatar is a picture someone chose OF THEMSELVES to
// stand for them in a list, and squaring it off is what makes a roster read
// as a roster. Portraits arrive at every ratio; without this, four curators
// side by side sit at four different heights.
//
// A tile rather than a circle on purpose: 04AM is a grid, and a round
// avatar imports a social-profile idiom the rest of the app doesn't use.
//
// No picture yet falls back to the initial on a flat tile — a letter, not a
// photo, so there is nothing to misrepresent.
export function Avatar({
  name,
  displayName,
  src,
  size = 48,
}: {
  name: string;
  displayName?: string | null;
  src: string | null;
  /** Rendered square, in px. */
  size?: number;
}) {
  const label = displayName || name;
  const initial = label.trim().charAt(0).toUpperCase() || "?";

  if (!src) {
    return (
      <div
        aria-hidden
        style={{ width: size, height: size }}
        className="flex flex-none items-center justify-center rounded-[3px] bg-ink-2 font-semibold text-bone/55"
      >
        <span style={{ fontSize: Math.round(size * 0.4) }}>{initial}</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Supabase storage, same as ClipThumbnail
    <img
      src={src}
      alt=""
      loading="lazy"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="flex-none rounded-[3px] object-cover"
    />
  );
}
