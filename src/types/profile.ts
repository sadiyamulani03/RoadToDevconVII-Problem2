/**
 * A normalized community member profile, produced exclusively from ENS text
 * record reads (see src/ens/profileReader.ts). ENS is the source of truth.
 */
export type CommunityProfile = {
  /** Fully normalized ENS name, e.g. "rust-mentor.roadtodevcon.eth" */
  ensName: string;
  /** First label of the ENS name, e.g. "rust-mentor" */
  label: string;
  /** Raw `description` text record (bio) */
  bio: string;
  /** Comma-split `com.community.skills` text record */
  skills: string[];
  /** Raw `com.community.availability` text record */
  availability: string;
  /** Raw `com.community.role` text record */
  role: string;
  /** Raw `com.community.mentoring` text record, e.g. "open" | "closed" | free text */
  mentoring: string;
};
