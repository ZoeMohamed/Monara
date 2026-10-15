import { searchCatalog } from "@/lib/brands/catalog";

export const runtime = "nodejs";

// Public logo catalog search; it reads no user data and needs no session.
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length === 0 || query.length > 60)
    return Response.json({ error: "Enter 1 to 60 characters." }, { status: 400 });
  return Response.json(
    { logos: searchCatalog(query) },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
