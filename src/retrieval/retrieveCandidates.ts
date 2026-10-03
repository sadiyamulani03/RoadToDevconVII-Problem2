import type { CommunityProfile } from "../types/profile";
import { parseQuery } from "./normalize";
import { scoreCandidates, type ScoredCandidate } from "./scoring";

/**
 * RETRIEVAL_TOP_K is the hard upper bound on how many retrieved candidates may
 * ever be sent to the LLM. It exists to keep the model context small and to
 * guarantee that the entire indexed community is NEVER placed into a model
 * prompt. retrieveCandidates() applies .slice(0, RETRIEVAL_TOP_K) after
 * scoring, so callers physically cannot pass more candidates to the model.
 */
export const RETRIEVAL_TOP_K = 5;

export type RetrievedCandidate = ScoredCandidate;

/**
 * Deterministic retrieval: normalize the query, score every indexed profile,
 * drop non-matches, sort, and hard-cap the result at RETRIEVAL_TOP_K.
 */
export function retrieveCandidates(
  query: string,
  profiles: CommunityProfile[],
  topK: number = RETRIEVAL_TOP_K,
): RetrievedCandidate[] {
  const parsed = parseQuery(query);
  return scoreCandidates(parsed, profiles).slice(0, topK);
}
