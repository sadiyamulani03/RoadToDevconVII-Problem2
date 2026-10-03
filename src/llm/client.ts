/**
 * Minimal OpenAI-compatible chat-completions client.
 *
 * Security properties:
 *  - The API key comes from LLM_API_KEY (env only; never committed).
 *  - The request has an EXPLICIT timeout (MODEL_TIMEOUT_MS) enforced with an
 *    AbortController, so a hanging model call cannot stall the pipeline.
 *  - Message separation is the caller's job (see src/llm/prompts.ts): the
 *    system message is application-authored and profile data is sent as a
 *    separate structured data message.
 */

/** Explicit model request timeout (ms). Easy to find and configure. */
export const MODEL_TIMEOUT_MS = 15_000;

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export class LlmError extends Error {}

export function isLlmConfigured(): boolean {
  return Boolean(process.env.LLM_API_KEY);
}

export async function chatCompletion(messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new LlmError("LLM_API_KEY is not configured. Copy .env.example to .env and set it.");
  }
  const baseUrl = (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.LLM_MODEL ?? "gpt-4o-mini";
  const jsonMode = process.env.LLM_JSON_MODE !== "0";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0,
        ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new LlmError(
        `LLM request failed with status ${response.status}. ${detail.slice(0, 200)}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new LlmError("LLM response did not contain a message content string.");
    }
    return content;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new LlmError(`LLM request timed out after ${MODEL_TIMEOUT_MS}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
