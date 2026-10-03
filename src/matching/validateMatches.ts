import type { RetrievedCandidate } from "../retrieval/retrieveCandidates";
import type { LlmMatch } from "../llm/schema";
import { normalizeEnsName } from "../retrieval/normalize";
import type { FinalMatch } from "../types/matching";

export type MatchValidation = {
  validMatches: FinalMatch[];
  rejectedNames: string[];
};

/**
 * CHECK 1 — candidate membership guard.
 *
 * The LLM is NOT trusted to decide which ENS names exist. Every ENS name the
 * model returned is compared against the candidate set retrieved for THIS
 * query. A name that was not retrieved is a hallucination: it is rejected,
 * recorded, and never displayed.
 *
 *   const retrievedNames = new Set(candidates.map(c => c.profile.ensName));
 *   const validMatches = llmMatches.filter(match => retrievedNames.has(...));
 *
 * This is not a "does the name look like an ENS name" check — the name must
 * belong to the actual retrieved candidates for this query.
 */
export function validateModelMatches(
  llmMatches: LlmMatch[],
  candidates: RetrievedCandidate[],
): MatchValidation {
  // Membership sets built from the candidates retrieved for THIS query.
  const retrievedNames = new Set(candidates.map((candidate) => candidate.profile.ensName));
  const candidateByName = new Map(
    candidates.map((candidate) => [candidate.profile.ensName, candidate] as const),
  );

  const validLlmMatches = llmMatches.filter((match) => {
    const normalized = normalizeEnsName(match.ensName);
    return normalized.length > 0 && retrievedNames.has(normalized);
  });

  // Hallucinated names: returned by the model but not in the retrieved set.
  const validNormalized = new Set(
    validLlmMatches.map((match) => normalizeEnsName(match.ensName)),
  );
  const rejectedNames = llmMatches
    .filter((match) => !validNormalized.has(normalizeEnsName(match.ensName)))
    .map((match) => match.ensName);
  for (const rejected of rejectedNames) {
    console.warn(
      `[guard] rejected hallucinated model result "${rejected}" (not in the retrieved candidate set)`,
    );
  }

  // Hydrate each surviving match with the trusted retrieved profile, deduped.
  const validMatches: FinalMatch[] = [];
  const seen = new Set<string>();
  for (const match of validLlmMatches) {
    const ensName = normalizeEnsName(match.ensName);
    if (seen.has(ensName)) continue;
    seen.add(ensName);
    const candidate = candidateByName.get(ensName)!;
    validMatches.push({
      ensName: candidate.profile.ensName,
      reason: match.reason,
      bio: candidate.profile.bio,
      skills: candidate.profile.skills,
      availability: candidate.profile.availability,
      role: candidate.profile.role,
      mentoring: candidate.profile.mentoring,
      score: candidate.score,
      matchedTerms: candidate.matchedTerms,
    });
  }

  return { validMatches, rejectedNames };
}
