import { AnswerSchema, type LlmAnswer } from "./schema";
import { chatCompletion } from "./client";
import { buildMessages } from "./prompts";
import type { RetrievedCandidate } from "../retrieval/retrieveCandidates";

export type GenerateAnswerResult =
  | { ok: true; answer: LlmAnswer; raw: string }
  | { ok: false; reason: string };

/** Strips optional markdown code fences some models wrap JSON in. */
export function extractJsonPayload(raw: string): unknown {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  return JSON.parse(stripped);
}

function logValidationFailure(reason: string, raw: string): void {
  console.warn(
    `[llm] validation failure: ${reason}. Raw model response (truncated): ${raw.slice(0, 300)}`,
  );
}

/**
 * Calls the model with a static system prompt + a separate data message, then
 * validates the response against AnswerSchema (Zod).
 *
 * If the request fails (timeout, API error) or the response is not valid JSON
 * or fails schema validation, the result is rejected — hallucinated output is
 * never displayed; a safe error/no-match style response is returned instead.
 */
export async function generateAnswer(
  query: string,
  candidates: RetrievedCandidate[],
): Promise<GenerateAnswerResult> {
  const messages = buildMessages(query, candidates);

  let raw: string;
  try {
    raw = await chatCompletion(messages);
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "LLM request failed.",
    };
  }

  let parsed: unknown;
  try {
    parsed = extractJsonPayload(raw);
  } catch {
    logValidationFailure("model response was not valid JSON", raw);
    return { ok: false, reason: "Model response was not valid JSON, so it was rejected." };
  }

  const result = AnswerSchema.safeParse(parsed);
  if (!result.success) {
    logValidationFailure("model response failed schema validation", raw);
    return { ok: false, reason: "Model response failed schema validation, so it was rejected." };
  }

  return { ok: true, answer: result.data, raw };
}
