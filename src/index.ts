import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import { ProviderRegistry } from "./facade/provider-registry.js";
import { FacadeCore } from "./facade/facade-core.js";
import { OpenAICompatAdapter } from "./adapters/openai-compat.js";
import { createMessage, FacadeError, type ContentBlock } from "./types/index.js";

// --- Bootstrap ---

const registry = new ProviderRegistry();

registry.register(new OpenAICompatAdapter({
  providerId: "ollama",
  baseUrl: "http://localhost:11434",
}));

const facade = new FacadeCore(registry);
const server = new McpServer({
  name: "llm-api-facade",
  version: "0.1.0",
});

// --- MCP Tool: complete ---

server.tool(
  "complete",
  "Send a prompt to any LLM and receive a completion",
  {
    model: z.string().describe("Model identifier"),
    messages: z.array(z.object({
      role: z.enum(["system", "user", "assistant", "tool"]),
      content: z.union([z.string(), z.array(z.any())]),
      tool_call_id: z.string().optional(),
    })).describe("Conversation messages"),
    max_tokens: z.number().int().positive().optional().describe("Maximum output tokens"),
    temperature: z.number().min(0).max(2).optional().describe("Sampling temperature"),
    top_p: z.number().min(0).max(1).optional().describe("Nucleus sampling threshold"),
    stop_sequences: z.array(z.string()).optional().describe("Stop sequences"),
  },
  async (params) => {
    try {
      const messages = params.messages.map(m =>
        createMessage(m.role, m.content as string | ContentBlock[], m.tool_call_id)
      );

      const response = await facade.complete(
        params.model,
        messages,
        {
          sampling: {
            temperature: params.temperature,
            topP: params.top_p,
          },
          constraints: {
            maxTokens: params.max_tokens,
            stopSequences: params.stop_sequences,
          },
        },
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              completion_id: response.completionId,
              model: response.model,
              content: response.content,
              finish_reason: response.finishReason,
              usage: {
                input_tokens: response.usage.inputTokens,
                output_tokens: response.usage.outputTokens,
                is_approximate: response.usage.isApproximate,
              },
            }, null, 2),
          },
        ],
      };
    } catch (err) {
      if (err instanceof FacadeError) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: {
                code: err.code,
                category: err.category,
                message: err.message,
                retryable: err.retryable,
              },
            }),
          }],
          isError: true,
        };
      }
      throw err;
    }
  },
);

// --- MCP Tool: list_models ---

server.tool(
  "list_models",
  "List all available models across configured backends",
  {},
  async () => {
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          providers: registry.listProviders(),
          note: "Model enumeration via provider APIs — use 'complete' with a specific model ID",
        }, null, 2),
      }],
    };
  },
);

// --- Start ---

async function main(): Promise<void> {
  console.error("[mcp] llm-api-facade starting...");
  console.error(`[mcp] providers: ${registry.listProviders().join(", ")}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[mcp] connected via stdio");
}

main().catch(err => {
  console.error("[mcp] fatal:", err);
  process.exit(1);
});
