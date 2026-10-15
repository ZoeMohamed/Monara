import { catalogSvg } from "@/lib/brands/catalog";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ icon: string }> }) {
  const { icon } = await params;
  const slug = /^([a-z0-9]{1,60})\.svg$/.exec(icon)?.[1];
  const svg = slug ? catalogSvg(slug) : null;
  if (!svg) return new Response("Not found", { status: 404 });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=604800, immutable",
      "Content-Security-Policy": "default-src 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
