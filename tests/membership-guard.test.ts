import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateModelMatches } from "../src/matching/validateMatches";
import { retrieveCandidates } from "../src/retrieval/retrieveCandidates";
import { answerQuery } from "../src/pipeline/answerQuery";
import { saveIndex } from "../src/ens/indexer";
import { buildTestIndex, ADVERSARIAL_INJECTED_NAME } from "./fixtures";
import os from "os";
import path from "path";

// Mock only the model transport: the pipeline under test still runs end to end
// (retrieval -> top-K -> LLM -> Zod validation -> membership guard).
vi.mock("../src/llm/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/llm/client")>();
  return { ...actual, chatCompletion: vi.fn() };
});

import { chatCompletion } from "../src/llm/client";

const mockedChatCompletion = vi.mocked(chatCompletion);

beforeEach(() => {
  mockedChatCompletion.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("CHECK 1 / Test A — candidate membership guard", () => {
  const index = buildTestIndex();

  it("removes a hallucinated ENS name and keeps only retrieved candidates", () => {
    const candidates = retrieveCandidates("Who can mentor me in Rust this month?", index.profiles);
    expect(candidates.length).toBeGreaterThan(0);

    const llmMatches = [
      { ensName: candidates[0]!.profile.ensName, reason: "Real retrieved candidate." },
      { ensName: "hallucinated-person.eth", reason: "Made up by the model." },
    ];

    const { validMatches, rejectedNames } = validateModelMatches(llmMatches, candidates);

    expect(validMatches.map((match) => match.ensName)).toEqual([candidates[0]!.profile.ensName]);
    expect(rejectedNames).toEqual(["hallucinated-person.eth"]);
    expect(validMatches.some((match) => match.ensName === "hallucinated-person.eth")).toBe(false);
  });

  it("matches names after normalization (case, whitespace, @ prefix) but still only from the retrieved set", () => {
    const candidates = retrieveCandidates("Who can help with Docker?", index.profiles);
    const realName = candidates[0]!.profile.ensName;

    const { validMatches, rejectedNames } = validateModelMatches(
      [
        { ensName: realName.toUpperCase(), reason: "Case-insensitive variant of a retrieved candidate." },
        { ensName: `  @${realName}  `, reason: "Prefixed variant of a retrieved candidate." },
        { ensName: "looks-like-ens.eth", reason: "Plausible ENS name but never retrieved." },
      ],
      candidates,
    );

    expect(validMatches.map((match) => match.ensName)).toEqual([realName, realName]);
    expect(rejectedNames).toEqual(["looks-like-ens.eth"]);
  });

  it("rejects every match when the candidate list is empty", () => {
    const { validMatches, rejectedNames } = validateModelMatches(
      [{ ensName: "anyone.eth", reason: "Nobody was retrieved." }],
      [],
    );
    expect(validMatches).toEqual([]);
    expect(rejectedNames).toEqual(["anyone.eth"]);
  });

  it("dedupes repeated valid candidates", () => {
    const candidates = retrieveCandidates("Who can mentor me in Rust this month?", index.profiles);
    const realName = candidates[0]!.profile.ensName;
    const { validMatches } = validateModelMatches(
      [
        { ensName: realName, reason: "First." },
        { ensName: realName, reason: "Duplicate." },
      ],
      candidates,
    );
    expect(validMatches).toHaveLength(1);
  });

  it("enforces the guard at the pipeline boundary: only retrieved candidates reach the final answer", async () => {
    const tmpIndex = path.join(os.tmpdir(), "ens-index-membership-guard.json");
    await saveIndex(index, tmpIndex);

    const candidates = retrieveCandidates("Who can mentor me in Rust this month?", index.profiles);
    const realName = candidates[0]!.profile.ensName;

    mockedChatCompletion.mockResolvedValueOnce(
      JSON.stringify({
        matches: [
          { ensName: realName, reason: "Experienced Rust developer, mentoring open." },
          { ensName: ADVERSARIAL_INJECTED_NAME, reason: "Injected by the model." },
        ],
        noMatchReason: null,
      }),
    );

    const result = await answerQuery("Who can mentor me in Rust this month?", { indexPath: tmpIndex });

    expect(result.status).toBe("match");
    expect(result.matches.map((match) => match.ensName)).toEqual([realName]);
    expect(result.rejectedNames).toEqual([ADVERSARIAL_INJECTED_NAME]);
    expect(result.matches.some((match) => match.ensName === ADVERSARIAL_INJECTED_NAME)).toBe(false);
  });
});
