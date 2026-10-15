export function healthResponse(): Response {
  return Response.json({ service: "monara-agent", status: "ok" });
}

export function notFoundResponse(): Response {
  return Response.json({ error: "Not found." }, { status: 404 });
}
