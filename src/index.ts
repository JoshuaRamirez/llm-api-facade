import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import { ProviderRegistry } from "./facade/provider-registry.js";
import { FacadeCore } from "./facade/facade-core.js";
import { OpenAICompatAdapter } from "./adapters/openai-compat.js";
import { AnthropicAdapter } from "./adapters/anthropic.js";
import { GeminiAdapter } from "./adapters/gemini.js";
import { CohereAdapter } from "./adapters/cohere.js";
import { createMessage, FacadeError, type ContentBlock } from "./types/index.js";

// --- Wire format → Facade type mapping (snake_case → camelCase) ---

function wireBlockToFacade(block: Record<string, unknown>): ContentBlock {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text as string };
    case "tool_use":
      return { type: "tool_use", toolUseId: block.tool_use_id as string, name: block.name as string, input: block.input as Record<string, unknown> };
    case "tool_result":
      return { type: "tool_result", toolUseId: block.tool_use_id as string, content: (block.content as Record<string, unknown>[]).map(wireBlockToFacade) };
    case "thinking":
      return { type: "thinking", thinking: block.thinking as string, signature: block.signature as string };
    case "image":
      return { type: "image", mediaType: block.media_type as string, data: block.data as string | undefined, sourceUrl: block.source_url as string | undefined };
    default:
      return { type: "text", text: `[unknown block type: ${String(block.type)}]` };
  }
}

// --- Bootstrap ---

const registry = new ProviderRegistry();

// Auto-register providers based on available configuration
registry.register(new OpenAICompatAdapter({
  providerId: "ollama",
  baseUrl: "http://localhost:11434",
}));

if (process.env.OPENAI_API_KEY) {
  registry.register(new OpenAICompatAdapter({
    providerId: "openai",
    baseUrl: "https://api.openai.com",
    apiKey: process.env.OPENAI_API_KEY,
  }));
  console.error("[mcp] OpenAI provider registered");
}

if (process.env.ANTHROPIC_API_KEY) {
  registry.register(new AnthropicAdapter({
    apiKey: process.env.ANTHROPIC_API_KEY,
  }));
  console.error("[mcp] Anthropic provider registered");
}

if (process.env.GEMINI_API_KEY) {
  registry.register(new GeminiAdapter({
    apiKey: process.env.GEMINI_API_KEY,
  }));
  console.error("[mcp] Gemini provider registered");
}

if (process.env.COHERE_API_KEY) {
  registry.register(new CohereAdapter({
    apiKey: process.env.COHERE_API_KEY,
  }));
  console.error("[mcp] Cohere provider registered");
}

if (process.env.MISTRAL_API_KEY) {
  registry.register(new OpenAICompatAdapter({
    providerId: "mistral",
    baseUrl: "https://api.mistral.ai",
    apiKey: process.env.MISTRAL_API_KEY,
  }));
  console.error("[mcp] Mistral provider registered");
}

if (process.env.XAI_API_KEY) {
  registry.register(new OpenAICompatAdapter({
    providerId: "xai",
    baseUrl: "https://api.x.ai",
    apiKey: process.env.XAI_API_KEY,
  }));
  console.error("[mcp] xAI provider registered");
}

if (process.env.VLLM_BASE_URL) {
  registry.register(new OpenAICompatAdapter({
    providerId: "vllm",
    baseUrl: process.env.VLLM_BASE_URL,
  }));
  console.error("[mcp] vLLM provider registered");
}

if (process.env.LMSTUDIO_BASE_URL) {
  registry.register(new OpenAICompatAdapter({
    providerId: "lmstudio",
    baseUrl: process.env.LMSTUDIO_BASE_URL,
  }));
  console.error("[mcp] LM Studio provider registered");
}

if (process.env.LLAMACPP_BASE_URL) {
  registry.register(new OpenAICompatAdapter({
    providerId: "llamacpp",
    baseUrl: process.env.LLAMACPP_BASE_URL,
  }));
  console.error("[mcp] llama.cpp provider registered");
}

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
      content: z.union([
        z.string(),
        z.array(z.discriminatedUnion("type", [
          z.object({ type: z.literal("text"), text: z.string() }),
          z.object({ type: z.literal("tool_use"), tool_use_id: z.string(), name: z.string(), input: z.record(z.string(), z.unknown()) }),
          z.object({ type: z.literal("tool_result"), tool_use_id: z.string(), content: z.array(z.any()) }),
          z.object({ type: z.literal("thinking"), thinking: z.string(), signature: z.string() }),
          z.object({ type: z.literal("image"), media_type: z.string(), data: z.string().optional(), source_url: z.string().optional() }),
        ])),
      ]),
      tool_call_id: z.string().optional(),
    })).describe("Conversation messages"),
    max_tokens: z.number().int().positive().optional().describe("Maximum output tokens"),
    temperature: z.number().min(0).max(2).optional().describe("Sampling temperature"),
    top_p: z.number().min(0).max(1).optional().describe("Nucleus sampling threshold"),
    stop_sequences: z.array(z.string()).optional().describe("Stop sequences"),
    tools: z.array(z.object({
      name: z.string(),
      description: z.string().optional(),
      parameters: z.record(z.string(), z.unknown()).optional(),
    })).optional().describe("Tool definitions the model may invoke"),
    response_format: z.object({
      type: z.enum(["text", "json", "json_schema"]),
      schema: z.record(z.string(), z.unknown()).optional(),
      schema_name: z.string().optional(),
    }).optional().describe("Output format constraint"),
  },
  async (params) => {
    try {
      const messages = params.messages.map(m => {
        let content: string | ContentBlock[];
        if (typeof m.content === "string") {
          content = m.content;
        } else {
          content = m.content.map(wireBlockToFacade);
        }
        return createMessage(m.role, content, m.tool_call_id);
      });

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
          structural: (params.tools || params.response_format) ? {
            tools: params.tools?.map(t => ({
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            })),
            responseFormat: params.response_format ? {
              type: params.response_format.type,
              schema: params.response_format.schema,
              schemaName: params.response_format.schema_name,
            } : undefined,
          } : undefined,
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

// --- MCP Tool: stream_complete ---

server.tool(
  "stream_complete",
  "Send a prompt to any LLM and receive a streaming completion (returns accumulated result)",
  {
    model: z.string().describe("Model identifier"),
    messages: z.array(z.object({
      role: z.enum(["system", "user", "assistant", "tool"]),
      content: z.union([
        z.string(),
        z.array(z.discriminatedUnion("type", [
          z.object({ type: z.literal("text"), text: z.string() }),
          z.object({ type: z.literal("tool_use"), tool_use_id: z.string(), name: z.string(), input: z.record(z.string(), z.unknown()) }),
          z.object({ type: z.literal("tool_result"), tool_use_id: z.string(), content: z.array(z.any()) }),
          z.object({ type: z.literal("thinking"), thinking: z.string(), signature: z.string() }),
          z.object({ type: z.literal("image"), media_type: z.string(), data: z.string().optional(), source_url: z.string().optional() }),
        ])),
      ]),
      tool_call_id: z.string().optional(),
    })).describe("Conversation messages"),
    max_tokens: z.number().int().positive().optional(),
    temperature: z.number().min(0).max(2).optional(),
  },
  async (params) => {
    try {
      const messages = params.messages.map(m => {
        let content: string | ContentBlock[];
        if (typeof m.content === "string") {
          content = m.content;
        } else {
          content = m.content.map(wireBlockToFacade);
        }
        return createMessage(m.role, content, m.tool_call_id);
      });

      const chunks: Array<{ chunkIndex: number; blockIndex: number; delta: unknown; finishReason?: string | undefined; usage?: unknown | undefined }> = [];
      let finalFinishReason = "stop";
      let finalUsage: unknown = null;

      for await (const chunk of facade.completeStream(
        params.model,
        messages,
        {
          sampling: { temperature: params.temperature },
          constraints: { maxTokens: params.max_tokens },
        },
      )) {
        chunks.push({
          chunkIndex: chunk.chunkIndex,
          blockIndex: chunk.blockIndex,
          delta: chunk.delta,
          finishReason: chunk.finishReason,
          usage: chunk.usage,
        });
        if (chunk.finishReason) finalFinishReason = chunk.finishReason;
        if (chunk.usage) finalUsage = {
          input_tokens: chunk.usage.inputTokens,
          output_tokens: chunk.usage.outputTokens,
          is_approximate: chunk.usage.isApproximate,
        };
      }

      // Accumulate text from deltas
      const accumulated = chunks
        .filter(c => (c.delta as { type: string }).type === "text_delta")
        .map(c => (c.delta as { text: string }).text)
        .join("");

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            chunk_count: chunks.length,
            accumulated_text: accumulated,
            finish_reason: finalFinishReason,
            usage: finalUsage,
            chunks_sample: chunks.slice(0, 3).concat(chunks.length > 3 ? [chunks[chunks.length - 1]!] : []),
          }, null, 2),
        }],
      };
    } catch (err) {
      if (err instanceof FacadeError) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ error: { code: err.code, category: err.category, message: err.message } }),
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
