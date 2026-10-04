import { NextResponse } from "next/server";
import { answerQuery, previewQuery } from "../../../src/pipeline/answerQuery";
import { isLlmConfigured } from "../../../src/llm/client";
import type { FinalAnswer } from "../../../src/types/matching";

export const dynamic = "force-dynamic";

/**
 * POST /api/search — body: { "query": "Who can mentor me in Rust this month?" }
 *
 * Runs the full audited pipeline:
 *   retrieval -> top-K bound -> LLM (static system prompt + data message)
 *   -> Zod schema validation -> candidate membership guard -> final answer.
 * Falls back to a retrieval-only preview when LLM_API_KEY is not configured.
 */
export async function POST(request: Request): Promise<NextResponse<FinalAnswer>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        status: "error",
        query: "",
        message: "Request body must be JSON with a \"query\" field.",
        matches: [],
        candidatesConsidered: [],
        rejectedNames: [],
      },
      { status: 400 },
    );
  }

  const query = typeof (body as { query?: unknown })?.query === "string" ? (body as { query: string }).query : "";
  if (query.trim().length === 0) {
    return NextResponse.json(
      {
        status: "error",
        query,
        message: "The \"query\" field must be a non-empty string.",
        matches: [],
        candidatesConsidered: [],
        rejectedNames: [],
      },
      { status: 400 },
    );
  }

  const result: FinalAnswer = isLlmConfigured()
    ? await answerQuery(query)
    : await previewQuery(query);
  return NextResponse.json(result);
}
