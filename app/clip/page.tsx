import { supabaseAdmin } from "@/lib/supabase/admin";
import { ClipForm } from "./clip-form";

export default async function ClipPage() {
  const { data: clips } = await supabaseAdmin
    .from("clips")
    .select("id, url, image_url, title, source, caption, clipped_at, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <main className="flex flex-col gap-10 p-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-lg mb-4">Clipper</h1>
        <ClipForm />
      </div>

      <div>
        <h2 className="text-sm mb-2">Recent clips</h2>
        {clips && clips.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {clips.map((clip) => (
              <li key={clip.id} className="text-sm border-b pb-2">
                <a
                  href={clip.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {clip.title || clip.url}
                </a>
                {clip.source && (
                  <span className="opacity-70"> — {clip.source}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm opacity-70">No clips yet.</p>
        )}
      </div>
    </main>
  );
}
