import type { CommunityProfile } from "../types/profile";
import { containsPhrase, tokenize, toMatchText, type ParsedQuery } from "./normalize";

/**
 * Deterministic, explainable scoring of community profiles against a parsed
 * query. No LLM involved: scores are computed purely from ENS profile data so
 * retrieval is testable and reproducible.
 */
export const SKILL_PHRASE_WEIGHT = 3;
export const SKILL_WORD_WEIGHT = 1;
export const SKILL_WORD_CAP = 3;
export const BIO_TERM_WEIGHT = 0.5;
export const BIO_TERM_CAP = 2;
export const LABEL_TERM_WEIGHT = 1;
export const MENTORING_OPEN_BONUS = 2;
export const MENTORING_CLOSED_PENALTY = 2.5;
export const AVAILABILITY_MATCH_BONUS = 2;
export const AVAILABILITY_CONFLICT_PENALTY = 1.5;

const AVAILABILITY_NEGATIVE = ["not available", "unavailable", "busy", "booked", "no time", "until next month"];
const AVAILABILITY_POSITIVE = ["available", "free", "open"];
const AVAILABILITY_NOWISH = ["this month", "now", "right now", "today", "this week", "asap"];

export type ScoredCandidate = {
  profile: CommunityProfile;
  score: number;
  /** Distinct terms/phrases that matched for this query */
  matchedTerms: string[];
  /** Which profile fields matched (skills, bio, ensName, availability, mentoring) */
  matchedFields: string[];
};

/**
 * Availability is only scored when the profile was otherwise matched: an
 * explicit availability request must not by itself drag every member in.
 */
function availabilityScore(intent: string, availabilityText: string): number {
  const text = availabilityText.toLowerCase();
  if (text.length === 0) return 0;
  if (text.includes("next month") && AVAILABILITY_NOWISH.includes(intent)) {
    return -AVAILABILITY_CONFLICT_PENALTY;
  }
  if (AVAILABILITY_NEGATIVE.some((negative) => text.includes(negative))) {
    return -AVAILABILITY_CONFLICT_PENALTY;
  }
  if (text.includes(intent) || AVAILABILITY_POSITIVE.some((positive) => text.includes(positive))) {
    return AVAILABILITY_MATCH_BONUS;
  }
  return 0;
}

/** A raw ENS mentoring value ("open", "closed", or free text) -> boolean. */
function isMentoringOpen(mentoring: string): boolean {
  const text = mentoring.toLowerCase();
  if (text.length === 0) return false;
  if (/(open|available|yes|accepting)/.test(text)) {
    return !/(closed|unavailable|not open|not available|no\b)/.test(text);
  }
  return false;
}

export function scoreCandidate(query: ParsedQuery, profile: CommunityProfile): ScoredCandidate {
  const matchedTerms = new Set<string>();
  const matchedFields = new Set<string>();

  let skillScore = 0;
  const skillTokens = new Set(profile.skills.flatMap((skill) => tokenize(skill)));
  for (const skill of profile.skills) {
    const phrase = toMatchText(skill);
    if (containsPhrase(query.matchText, phrase)) {
      skillScore += SKILL_PHRASE_WEIGHT;
      matchedTerms.add(phrase);
      matchedFields.add("skills");
      continue;
    }
    let wordHits = 0;
    for (const word of tokenize(skill)) {
      if (query.terms.includes(word)) {
        wordHits += 1;
        matchedTerms.add(word);
      }
    }
    if (wordHits > 0) {
      skillScore += Math.min(wordHits, SKILL_WORD_CAP) * SKILL_WORD_WEIGHT;
      matchedFields.add("skills");
    }
  }

  let bioScore = 0;
  const bioTokens = new Set(tokenize(profile.bio));
  for (const term of query.terms) {
    if (bioTokens.has(term)) {
      bioScore += BIO_TERM_WEIGHT;
      matchedTerms.add(term);
      matchedFields.add("bio");
    }
  }
  bioScore = Math.min(bioScore, BIO_TERM_CAP);

  let labelScore = 0;
  const labelTokens = tokenize(profile.label);
  for (const term of query.terms) {
    if (labelTokens.includes(term)) {
      labelScore += LABEL_TERM_WEIGHT;
      matchedTerms.add(term);
      matchedFields.add("ensName");
    }
  }

  const baseScore = skillScore + bioScore + labelScore;

  // Context bonuses (availability, mentoring) only apply when the candidate
  // already matched profile content, so generic words can't rank everyone in.
  let contextScore = 0;
  if (baseScore > 0) {
    if (query.mentoringIntent) {
      if (isMentoringOpen(profile.mentoring)) {
        contextScore += MENTORING_OPEN_BONUS;
      } else {
        contextScore -= MENTORING_CLOSED_PENALTY;
      }
      matchedFields.add("mentoring");
    }
    if (query.availabilityIntent !== null) {
      const availability = availabilityScore(query.availabilityIntent, profile.availability);
      if (availability !== 0) {
        contextScore += availability;
        matchedFields.add("availability");
      }
    }
  }

  return {
    profile,
    score: baseScore + contextScore,
    matchedTerms: [...matchedTerms],
    matchedFields: [...matchedFields],
  };
}

/** Scores every profile, drops non-matches, sorts by score (stable tie-break). */
export function scoreCandidates(query: ParsedQuery, profiles: CommunityProfile[]): ScoredCandidate[] {
  return profiles
    .map((profile) => scoreCandidate(query, profile))
    .filter((candidate) => candidate.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.profile.ensName.localeCompare(b.profile.ensName),
    );
}
