import { z } from "zod";

/**
 * Structured LLM output schema. The model must return JSON matching this
 * schema; arbitrary prose is never parsed with string matching. If schema
 * parsing fails, the response is rejected and a safe no-match/error style
 * response is returned (see src/llm/generateAnswer.ts).
 */
export const MatchSchema = z.object({
  ensName: z.string(),
  reason: z.string(),
});

export const AnswerSchema = z.object({
  matches: z.array(MatchSchema),
  noMatchReason: z.string().nullable(),
});

export type LlmMatch = z.infer<typeof MatchSchema>;
export type LlmAnswer = z.infer<typeof AnswerSchema>;
