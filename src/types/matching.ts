/**
 * A single person the final answer presents. Built by the membership guard
 * (src/matching/validateMatches.ts) from a model match PLUS the trusted
 * retrieved profile, so everything shown is anchored to real retrieved data.
 */
export type FinalMatch = {
  ensName: string;
  /** Why the person matches (LLM reason, for a candidate verified to exist in the retrieved set) */
  reason: string;
  bio: string;
  skills: string[];
  availability: string;
  role: string;
  mentoring: string;
  score: number;
  /** Terms the deterministic retriever matched for this query */
  matchedTerms: string[];
};

export type FinalAnswer = {
  status: "match" | "no_match" | "error" | "preview";
  query: string;
  message: string;
  matches: FinalMatch[];
  /** ENS names that were sent to the model (bounded top-K). Transparent for inspection. */
  candidatesConsidered: string[];
  /** ENS names the model hallucinated and that the membership guard rejected before display. */
  rejectedNames: string[];
};
