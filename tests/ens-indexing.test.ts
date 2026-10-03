import { afterEach, describe, expect, it, vi } from "vitest";
import { buildIndexFromEns, loadIndex, saveIndex } from "../src/ens/indexer";
import { loadCommunityConfig } from "../src/ens/community";
import { TEXT_RECORD_KEYS, TEXT_RECORD_KEY_LIST } from "../src/ens/textRecords";
import type { PublicClient } from "viem";
import os from "os";
import path from "path";

/** Mocked ENS client whose getEnsText returns the record values below. */
function mockEnsClient(records: Record<string, Record<string, string>>) {
  return {
    chain: { id: 11155111, name: "Sepolia" },
    getEnsText: vi.fn(async ({ name, key }: { name: string; key: string }) => {
      return records[name]?.[key] ?? null;
    }),
  } as unknown as PublicClient & { getEnsText: ReturnType<typeof vi.fn>; chain: { id: number; name: string } };
}

describe("CHECK 4 / Test D — ENS indexing from text-record reads", () => {
  it("builds the index from mocked getEnsText returns", async () => {
    const config = await loadCommunityConfig();
    const mockedRecords: Record<string, Record<string, string>> = {};
    for (const member of config.members) {
      mockedRecords[member.name] = {
        [TEXT_RECORD_KEYS.bio]: `Bio for ${member.name}`,
        [TEXT_RECORD_KEYS.skills]: "Rust, Solidity",
        [TEXT_RECORD_KEYS.availability]: "Available this month",
        [TEXT_RECORD_KEYS.role]: "Mentor",
        [TEXT_RECORD_KEYS.mentoring]: "open",
      };
    }
    const client = mockEnsClient(mockedRecords);

    const index = await buildIndexFromEns(client, config.members);

    expect(index.profiles).toHaveLength(config.members.length);
    expect(index.errors).toEqual([]);

    const rustMember = index.profiles.find((p) => p.ensName === "rust-mentor.roadtodevcon.eth")!;
    expect(rustMember.bio).toBe("Bio for rust-mentor.roadtodevcon.eth");
    expect(rustMember.skills).toEqual(["Rust", "Solidity"]);
    expect(rustMember.availability).toBe("Available this month");
    expect(rustMember.role).toBe("Mentor");
    expect(rustMember.mentoring).toBe("open");
    expect(rustMember.label).toBe("rust-mentor");
  });

  it("reads exactly the documented text record keys for every member via getEnsText", async () => {
    const config = await loadCommunityConfig();
    const client = mockEnsClient({});
    await buildIndexFromEns(client, config.members);

    const calls = client.getEnsText.mock.calls as Array<[{ name: string; key: string }]>;
    expect(calls.length).toBe(config.members.length * TEXT_RECORD_KEY_LIST.length);

    for (const member of config.members) {
      const keys = calls.filter(([call]) => call.name === member.name).map(([call]) => call.key);
      expect(new Set(keys)).toEqual(new Set(TEXT_RECORD_KEY_LIST));
    }
  });

  it("skips members whose ENS reads fail and records the error", async () => {
    const config = await loadCommunityConfig();
    const records: Record<string, Record<string, string>> = {
      "rust-mentor.roadtodevcon.eth": {
        [TEXT_RECORD_KEYS.bio]: "Solo member with data.",
        [TEXT_RECORD_KEYS.skills]: "Rust",
      },
    };
    const client = mockEnsClient(records);
    // Simulate an RPC failure for one name.
    (client.getEnsText as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ name }: { name: string }) => {
        if (name === "rust-mentor.roadtodevcon.eth") {
          return records[name]?.[TEXT_RECORD_KEYS.bio] ?? null;
        }
        throw new Error("HTTP request failed with status 429.");
      },
    );

    const index = await buildIndexFromEns(client, config.members);

    expect(index.profiles.map((p) => p.ensName)).toEqual(["rust-mentor.roadtodevcon.eth"]);
    expect(index.errors).toHaveLength(config.members.length - 1);
    expect(index.errors[0]!.reason).toContain("429");
  });

  it("normalizes the documented offline fixture into the same profile shape", async () => {
    const { buildTestIndex } = await import("./fixtures");
    const index = buildTestIndex();
    expect(index.profiles.length).toBeGreaterThanOrEqual(8);
    expect(index.meta.source).toBe("fixture");
    for (const profile of index.profiles) {
      expect(profile.ensName).toBeTruthy();
      expect(profile.label).toBe(profile.ensName.split(".")[0]);
      expect(profile.skills.every((skill) => skill.length > 0)).toBe(true);
    }
  });

  it("persists and reloads the index round-trip", async () => {
    const { buildTestIndex } = await import("./fixtures");
    const index = buildTestIndex();
    const tmp = path.join(os.tmpdir(), `ens-index-rt-${Date.now()}.json`);
    await saveIndex(index, tmp);
    const loaded = await loadIndex(tmp);
    expect(loaded).not.toBeNull();
    expect(loaded!.profiles).toEqual(index.profiles);
    expect(loaded!.meta.source).toBe("fixture");
  });

  it("treats a missing or invalid persisted index as absent", async () => {
    expect(await loadIndex(path.join(os.tmpdir(), `missing-${Date.now()}.json`))).toBeNull();
  });
});
