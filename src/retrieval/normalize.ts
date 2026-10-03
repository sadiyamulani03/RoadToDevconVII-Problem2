/**
 * Deterministic query normalization for the retrieval layer.
 *
 * The retriever never uses an LLM: the query is normalized into terms,
 * phrases and explicit intents that are scored against ENS profile data in
 * src/retrieval/scoring.ts.
 */

/** Words too generic to match profile text directly (removed from terms). */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "else", "when", "at", "by",
  "for", "with", "about", "into", "to", "from", "in", "on", "of", "is", "are",
  "was", "were", "be", "been", "being", "am", "do", "does", "did", "have", "has",
  "had", "i", "me", "my", "we", "our", "you", "your", "he", "she", "it", "they",
  "them", "who", "whom", "whose", "what", "which", "this", "that", "these",
  "those", "there", "here", "can", "could", "will", "would", "shall", "should",
  "may", "might", "must", "need", "needs", "needed", "want", "wants", "someone",
  "somebody", "anybody", "anyone", "everybody", "everyone", "no", "not", "know",
  "knows", "knowing", "like", "both", "so", "as", "up", "out", "just", "very",
  "really", "some", "any", "eth", "one",
  // Mentoring/availability words are handled as explicit intents, not terms.
  "mentor", "mentors", "mentoring", "help", "helps", "helping", "guide",
  "guidance", "teach", "teacher", "teaching", "tutor", "tutoring", "advice",
  "advise", "advising", "available", "availability", "free", "busy", "booked",
  "now", "today", "tomorrow", "weekend", "weekends", "asap", "month", "week",
]);

/** Availability phrases extracted from a query before stopword removal. */
const AVAILABILITY_PHRASES = [
  "this month", "next month", "this week", "next week", "right now", "now",
  "today", "tomorrow", "weekend", "asap", "available", "free",
];

const MENTORING_WORDS = new Set([
  "mentor", "mentors", "mentoring", "help", "helps", "helping", "guide",
  "guidance", "teach", "teacher", "teaching", "tutor", "tutoring", "advice",
  "advise", "advising",
]);

/** Common aliases normalized so query and profile text match consistently. */
const ALIASES: Record<string, string> = {
  k8s: "kubernete",
  js: "javascript",
  zk: "zero knowledge",
};

/**
 * Lightweight deterministic stemmer: strips a trailing "s" so "contracts" and
 * "contract" match. Applied consistently to query and profile text.
 */
export function stem(token: string): string {
  if (
    token.length > 3 &&
    token.endsWith("s") &&
    !token.endsWith("ss") &&
    !token.endsWith("us")
  ) {
    return token.slice(0, -1);
  }
  return token;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => ALIASES[token] ?? token)
    .map(stem);
}

/** Stemmed token sequence of arbitrary text (used for skill-phrase matching). */
export function toMatchText(text: string): string {
  return tokenize(text).join(" ");
}

export function containsPhrase(text: string, phrase: string): boolean {
  if (phrase.length === 0) return false;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(text);
}

export type ParsedQuery = {
  raw: string;
  /** Stemmed token sequence of the whole query */
  matchText: string;
  /** Deduped, stopword-free, stemmed terms */
  terms: string[];
  /** Multi-word n-grams (2-3 tokens) for phrases like "smart contract" */
  phrases: string[];
  /** Availability phrase found in the query, e.g. "this month", or null */
  availabilityIntent: string | null;
  /** True when the query asks about mentoring/help/guidance */
  mentoringIntent: boolean;
};

export function parseQuery(raw: string): ParsedQuery {
  const lower = raw.toLowerCase();

  const availabilityIntent =
    AVAILABILITY_PHRASES.find((phrase) => containsPhrase(lower, phrase)) ?? null;

  const tokens = tokenize(raw);
  const mentoringIntent = tokens.some((token) => MENTORING_WORDS.has(token));

  const meaningful = tokens.filter((token) => !STOPWORDS.has(token));
  const terms = [...new Set(meaningful)];

  const phrases: string[] = [];
  for (let n = 3; n >= 2; n -= 1) {
    for (let i = 0; i + n <= meaningful.length; i += 1) {
      phrases.push(meaningful.slice(i, i + n).join(" "));
    }
  }

  return {
    raw: lower,
    matchText: meaningful.join(" "),
    terms,
    phrases: [...new Set(phrases)],
    availabilityIntent,
    mentoringIntent,
  };
}

/** Normalizes an ENS name for comparison (trim, lowercase, strip prefixes). */
export function normalizeEnsName(raw: string): string {
  return raw
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/[^/]+\//, "")
    .toLowerCase();
}
