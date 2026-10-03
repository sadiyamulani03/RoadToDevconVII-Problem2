/**
 * ENS text record keys used to build community profiles.
 *
 * Each community member stores their profile as ENS text records on Sepolia.
 * These keys are the documented contract between the community, the seed
 * script (scripts/seed-community.ts) and the indexer (src/ens/indexer.ts).
 */
export const TEXT_RECORD_KEYS = {
  /** Bio / free-form description */
  bio: "description",
  /** Comma-separated skill list, e.g. "Rust, WebAssembly" */
  skills: "com.community.skills",
  /** Availability, e.g. "Available this month for mentoring" */
  availability: "com.community.availability",
  /** Role in the community, e.g. "Mentor" */
  role: "com.community.role",
  /** Mentoring status: "open" or "closed" */
  mentoring: "com.community.mentoring",
} as const;

export const TEXT_RECORD_KEY_LIST: string[] = Object.values(TEXT_RECORD_KEYS);
