interface Env {
  MONARA_BACKEND_URL?: string;
  MONARA_AGENT_BACKEND_SECRET?: string;
  COMPOSIO_API_KEY?: string;
  KAPSO_API_KEY?: string;
  KAPSO_WEBHOOK_SECRET?: string;
  LLM_BASE_URL?: string;
  LLM_API_KEY?: string;
  LLM_MODEL?: string;
}

export default {
  fetch(request: Request) {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/health") {
      return Response.json({ service: "monara-agent", status: "scaffold" });
    }
    return Response.json({ error: "Agent workflows are not implemented yet." }, { status: 501 });
  },
} satisfies ExportedHandler<Env>;
