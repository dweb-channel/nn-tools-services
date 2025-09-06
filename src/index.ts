import { ApiException, fromHono } from "chanfana";
import { Hono } from "hono";
import { tasksRouter } from "./endpoints/tasks/router";
import { llmRouter } from "./endpoints/llm/router";
import { ContentfulStatusCode } from "hono/utils/http-status";
import { DummyEndpoint } from "./endpoints/dummyEndpoint";

// Start a Hono app
const app = new Hono<{ Bindings: Env }>();

// Add CORS middleware
app.use("*", async (c, next) => {
  const origin = c.req.header("Origin") || "*";

  // Set CORS headers for all responses
  c.res.headers.set("Access-Control-Allow-Origin", origin);
  c.res.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  c.res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  c.res.headers.set("Access-Control-Allow-Credentials", "true");
  c.res.headers.set("Access-Control-Max-Age", "86400");

  // Handle preflight requests
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      },
    });
  }

  await next();

  // Ensure CORS headers are set on the response
  if (c.res) {
    c.res.headers.set("Access-Control-Allow-Origin", origin);
    c.res.headers.set("Vary", "Origin");
  }
});

app.onError((err, c) => {
  if (err instanceof ApiException) {
    // If it's a Chanfana ApiException, let Chanfana handle the response
    return c.json(
      { success: false, errors: err.buildResponse() },
      err.status as ContentfulStatusCode
    );
  }

  console.error("Global error handler caught:", err); // Log the error if it's not known

  // For other errors, return a generic 500 response
  return c.json(
    {
      success: false,
      errors: [{ code: 7000, message: "Internal Server Error" }],
    },
    500
  );
});

// Setup OpenAPI registry
const openapi = fromHono(app, {
  docs_url: "/",
  schema: {
    info: {
      title: "NN Tools Services API",
      version: "2.0.0",
      description: "集成了任务管理和LLM对话功能的API服务，支持Gemini流式响应。",
    },
  },
});

// Register Tasks Sub router
openapi.route("/tasks", tasksRouter);

// Register LLM Sub router
openapi.route("/llm", llmRouter);

// Register other endpoints
openapi.post("/dummy/:slug", DummyEndpoint);

// Export the Hono app
export default app;
