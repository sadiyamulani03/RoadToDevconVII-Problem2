import { loadIndex } from "../ens/indexer";
import { RETRIEVAL_TOP_K, retrieveCandidates } from "../retrieval/retrieveCandidates";
import { generateAnswer } from "../llm/generateAnswer";
import { validateModelMatches } from "../matching/validateMatches";
import { errorResult, noMatchResult } from "../matching/noMatch";
import type { FinalAnswer } from "../types/matching";

export type AnswerQueryOptions = {
  indexPath?: string;
};

/**
 * Full question-answering pipeline:
 *
 *   retrieve candidates (deterministic)
 *     -> bounded candidate list (.slice(0, RETRIEVAL_TOP_K))
 *     -> LLM generates structured answer (static system prompt + data message)
 *     -> parse/validate LLM output (Zod)
 *     -> compare every returned ENS name against the retrieved candidate set
 *     -> remove/reject hallucinated names
 *     -> only then display the answer
 */
export async function answerQuery(query: string, options: AnswerQueryOptions = {}): Promise<FinalAnswer> {
  const trimmed = query.trim();

  const index = await loadIndex(options.indexPath);
  if (!index || index.profiles.length === 0) {
    return errorResult(
      trimmed,
      "The community index is empty or has not been built yet. Run `npm run index` to rebuild it from live Sepolia ENS text records.",
    );
  }

  // Step 1: deterministic retrieval, hard-bounded to RETRIEVAL_TOP_K.
  const candidates = retrieveCandidates(trimmed, index.profiles).slice(0, RETRIEVAL_TOP_K);

  // Step 2: explicit no-match branch — never send an empty candidate list to
  // the model and hope it responds correctly.
  if (candidates.length === 0) {
    return noMatchResult(trimmed);
  }

  // Step 3: the LLM receives ONLY the bounded candidate list. The system
  // prompt is static application-authored text; profiles travel as a separate
  // JSON data message (see src/llm/prompts.ts).
  const generated = await generateAnswer(trimmed, candidates);
  if (!generated.ok) {
    return errorResult(trimmed, generated.reason);
  }

  // Step 4: membership guard — every model-returned ENS name is checked
  // against the retrieved candidate set; hallucinated names are rejected.
  const { validMatches, rejectedNames } = validateModelMatches(generated.answer.matches, candidates);
  if (rejectedNames.length > 0) {
    console.warn(
      `[pipeline] ${rejectedNames.length} hallucinated model result(s) rejected: ${rejectedNames.join(", ")}`,
    );
  }

  // Step 5: explicit no-match branch when the model produced zero valid matches.
  if (validMatches.length === 0) {
    return noMatchResult(
      trimmed,
      candidates.map((candidate) => candidate.profile.ensName),
      rejectedNames,
    );
  }

  return {
    status: "match",
    query: trimmed,
    message: `${validMatches.length} match${validMatches.length === 1 ? "" : "es"}`,
    matches: validMatches,
    candidatesConsidered: candidates.map((candidate) => candidate.profile.ensName),
    rejectedNames,
  };
}

/**
 * Retrieval-only preview (no LLM call). Used when LLM_API_KEY is not
 * configured so users can still inspect deterministic retrieval results.
 */
export async function previewQuery(query: string, options: AnswerQueryOptions = {}): Promise<FinalAnswer> {
  const trimmed = query.trim();

  const index = await loadIndex(options.indexPath);
  if (!index || index.profiles.length === 0) {
    return errorResult(
      trimmed,
      "The community index is empty or has not been built yet. Run `npm run index` to rebuild it from live Sepolia ENS text records.",
    );
  }

  const candidates = retrieveCandidates(trimmed, index.profiles).slice(0, RETRIEVAL_TOP_K);
  if (candidates.length === 0) {
    return noMatchResult(trimmed);
  }

  return {
    status: "preview",
    query: trimmed,
    message: `Retrieval preview — ${candidates.length} candidate(s) retrieved. LLM_API_KEY is not configured, so no LLM reasoning was applied.`,
    matches: candidates.map((candidate) => ({
      ensName: candidate.profile.ensName,
      reason:
        candidate.matchedTerms.length > 0
          ? `Retrieved deterministically: matched ${candidate.matchedTerms.join(", ")} in ${candidate.matchedFields.join(", ")}.`
          : "Retrieved deterministically from profile data.",
      bio: candidate.profile.bio,
      skills: candidate.profile.skills,
      availability: candidate.profile.availability,
      role: candidate.profile.role,
      mentoring: candidate.profile.mentoring,
      score: candidate.score,
      matchedTerms: candidate.matchedTerms,
    })),
    candidatesConsidered: candidates.map((candidate) => candidate.profile.ensName),
    rejectedNames: [],
  };
}
