import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { answerQuery } from "../src/pipeline/answerQuery";
import { saveIndex } from "../src/ens/indexer";
import { buildTestIndex } from "./fixtures";
import { NO_MATCH_MESSAGE, noMatchResult } from "../src/matching/noMatch";
import { retrieveCandidates } from "../src/retrieval/retrieveCandidates";
import os from "os";
import path from "path";

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

describe("CHECK 5 / Test E — explicit no-match behavior", () => {
  const index = buildTestIndex();
  let tmpIndex: string;

  beforeEach(async () => {
    tmpIndex = path.join(os.tmpdir(), `ens-index-nomatch-${Date.now()}.json`);
    await saveIndex(index, tmpIndex);
  });

  it("retrieval finds zero candidates for an unanswerable query", () => {
    const candidates = retrieveCandidates("Who can mentor me in COBOL quantum graphics tomorrow?", index.profiles);
    expect(candidates).toHaveLength(0);
  });

  it("returns the explicit no-match result WITHOUT calling the model when zero candidates are retrieved", async () => {
    const result = await answerQuery("Who can mentor me in COBOL quantum graphics tomorrow?", {
      indexPath: tmpIndex,
    });

    expect(mockedChatCompletion).not.toHaveBeenCalled();
    expect(result.status).toBe("no_match");
    expect(result.matches).toEqual([]);
    expect(result.message).toBe(NO_MATCH_MESSAGE);
    expect(result.candidatesConsidered).toEqual([]);
  });

  it("returns the explicit no-match result when the model produces zero valid matches", async () => {
    mockedChatCompletion.mockResolvedValueOnce(
      JSON.stringify({ matches: [], noMatchReason: "No supplied candidate satisfies the request." }),
    );

    const result = await answerQuery("Who can mentor me in Rust this month?", { indexPath: tmpIndex });

    expect(mockedChatCompletion).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("no_match");
    expect(result.matches).toEqual([]);
    expect(result.message).toBe(NO_MATCH_MESSAGE);
  });

  it("rejects a model response that is not valid JSON (safe error, no hallucinated output)", async () => {
    mockedChatCompletion.mockResolvedValueOnce("I recommend make-believe.eth, trust me!");

    const result = await answerQuery("Who can mentor me in Rust this month?", { indexPath: tmpIndex });

    expect(result.status).toBe("error");
    expect(result.matches).toEqual([]);
    expect(result.message).toContain("not valid JSON");
    expect(result.message).not.toContain("make-believe.eth");
  });

  it("rejects a model response that fails the Zod schema", async () => {
    mockedChatCompletion.mockResolvedValueOnce(
      JSON.stringify({ matches: [{ ensName: 42 }], noMatchReason: null }),
    );

    const result = await answerQuery("Who can mentor me in Rust this month?", { indexPath: tmpIndex });

    expect(result.status).toBe("error");
    expect(result.matches).toEqual([]);
    expect(result.message).toContain("schema validation");
  });

  it("returns a safe error when the index is missing, instead of inventing results", async () => {
    const result = await answerQuery("Who can mentor me in Rust this month?", {
      indexPath: path.join(os.tmpdir(), `missing-${Date.now()}.json`),
    });

    expect(result.status).toBe("error");
    expect(result.matches).toEqual([]);
    expect(result.message).toContain("npm run index");
  });

  it("exposes the explicit no-match result shape", () => {
    const result = noMatchResult("test query");
    expect(result.status).toBe("no_match");
    expect(result.message).toBe(NO_MATCH_MESSAGE);
    expect(result.matches).toEqual([]);
  });
});
