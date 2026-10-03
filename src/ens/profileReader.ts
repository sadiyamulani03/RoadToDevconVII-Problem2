import type { PublicClient } from "viem";
import { TEXT_RECORD_KEYS, TEXT_RECORD_KEY_LIST } from "./textRecords";
import type { CommunityProfile } from "../types/profile";

/**
 * Reads one community member's profile from ENS.
 *
 * ENS name -> resolver -> text records -> normalized profile.
 *
 * Every field is a live ENS text-record read via viem's getEnsText:
 *   description                 -> bio
 *   com.community.skills        -> skills
 *   com.community.availability  -> availability
 *   com.community.role          -> role
 *   com.community.mentoring     -> mentoring
 *
 * The returned profile content is treated as UNTRUSTED DATA downstream (it is
 * never placed into the LLM system prompt; see src/llm/prompts.ts).
 */
export type ProfileReadResult =
  | { ok: true; profile: CommunityProfile }
  | { ok: false; ensName: string; reason: string };

/**
 * Shared normalization from raw text-record values to a CommunityProfile.
 * Used by BOTH the live ENS path and the documented offline fixture path so
 * they produce byte-identical profiles for the same record values.
 */
export function normalizeProfile(ensName: string, records: Record<string, string>): CommunityProfile | null {
  const bio = records[TEXT_RECORD_KEYS.bio]?.trim() ?? "";
  const skills = (records[TEXT_RECORD_KEYS.skills] ?? "")
    .split(",")
    .map((skill) => skill.trim())
    .filter((skill) => skill.length > 0);
  const availability = records[TEXT_RECORD_KEYS.availability]?.trim() ?? "";
  const role = records[TEXT_RECORD_KEYS.role]?.trim() ?? "";
  const mentoring = records[TEXT_RECORD_KEYS.mentoring]?.trim() ?? "";

  if (bio.length === 0 && skills.length === 0) {
    return null;
  }
  return {
    ensName,
    label: ensName.split(".")[0] ?? ensName,
    bio,
    skills,
    availability,
    role,
    mentoring,
  };
}

/** Reads all documented text records for one ENS name via getEnsText. */
export async function readTextRecords(
  client: PublicClient,
  ensName: string,
): Promise<{ records: Record<string, string>; failedKeys: string[]; lastError: string }> {
  const records: Record<string, string> = {};
  const failedKeys: string[] = [];
  let lastError = "";

  const results = await Promise.all(
    TEXT_RECORD_KEY_LIST.map(async (key) => {
      try {
        const value = await client.getEnsText({ name: ensName, key });
        return { key, value, error: null as string | null };
      } catch (error) {
        return {
          key,
          value: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  for (const result of results) {
    if (result.error !== null) {
      failedKeys.push(result.key);
      lastError = result.error;
    } else if (result.value !== null && result.value !== undefined) {
      records[result.key] = result.value;
    }
  }
  return { records, failedKeys, lastError };
}

export async function readCommunityProfile(client: PublicClient, ensName: string): Promise<ProfileReadResult> {
  const { records, failedKeys, lastError } = await readTextRecords(client, ensName);

  const profile = normalizeProfile(ensName, records);
  if (profile === null) {
    if (failedKeys.length === TEXT_RECORD_KEY_LIST.length) {
      return {
        ok: false,
        ensName,
        reason: `no resolvable ENS record (all ${TEXT_RECORD_KEY_LIST.length} text-record reads failed)${lastError ? `: ${lastError}` : ""}`,
      };
    }
    return { ok: false, ensName, reason: "no profile content found (bio and skills text records are empty)" };
  }
  return { ok: true, profile };
}
