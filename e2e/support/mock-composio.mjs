// A local stand-in for Composio during account-deletion tests, as the deletion
// evidence used: it reports no connected accounts or triggers for any User.
// Usage: node e2e/support/mock-composio.mjs <port> <expected-api-key>
import { createServer } from "node:http";

const [port, apiKey] = process.argv.slice(2);
if (!port || !apiKey) throw new Error("Usage: mock-composio.mjs <port> <expected-api-key>");

createServer((request, response) => {
  const path = (request.url ?? "").split("?")[0];
  // Methods and paths only: no headers, query values or bodies are written out.
  process.stdout.write(`${new Date().toISOString()} ${request.method} ${path}\n`);
  if (request.headers["x-api-key"] !== apiKey) {
    response.writeHead(401, { "Content-Type": "application/json" });
    response.end('{"error":"unauthorized"}');
    return;
  }
  if (
    request.method === "GET" &&
    (path === "/trigger_instances/active" || path === "/connected_accounts")
  ) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end('{"items":[],"next_cursor":null}');
    return;
  }
  response.writeHead(404, { "Content-Type": "application/json" });
  response.end('{"error":"not mocked"}');
}).listen(Number(port), "127.0.0.1");
