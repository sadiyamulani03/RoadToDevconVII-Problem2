import type { FinalAnswer } from "../types/matching";

/**
 * Explicit no-match message. Both no-match paths (zero retrieved candidates,
 * and zero valid matches after LLM validation) return exactly this response —
 * no blank result, no invented fallback person.
 */
export const NO_MATCH_MESSAGE =
  "No community member matches this request based on the current ENS profiles.";

export function noMatchResult(
  query: string,
  candidatesConsidered: string[] = [],
  rejectedNames: string[] = [],
): FinalAnswer {
  return {
    status: "no_match",
    query,
    message: NO_MATCH_MESSAGE,
    matches: [],
    candidatesConsidered,
    rejectedNames,
  };
}

export function errorResult(
  query: string,
  message: string,
  rejectedNames: string[] = [],
): FinalAnswer {
  return {
    status: "error",
    query,
    message,
    matches: [],
    candidatesConsidered: [],
    rejectedNames,
  };
}
