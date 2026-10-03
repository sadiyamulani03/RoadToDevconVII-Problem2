import { describe, expect, it, vi } from "vitest";
import { RETRIEVAL_TOP_K, retrieveCandidates } from "../src/retrieval/retrieveCandidates";
import { buildMessages } from "../src/llm/prompts";
import { buildTestIndex } from "./fixtures";
import type { CommunityProfile } from "../src/types/profile";
import { answerQuery } from "../src/pipeline/answerQuery";
import { saveIndex } from "../src/ens/indexer";
import os from "os";
import path from "path";

vi.mock("../src/llm/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/llm/client")>();
  return { ...actual, chatCompletion: vi.fn() };
});

import { chatCompletion } from "../src/llm/client";

const mockedChatCompletion = vi.mocked(chatCompletion);

function fakeProfiles(count: number): CommunityProfile[] {
  return Array.from({ length: count }, (_, i) => ({
    ensName: `member-${i}.community.eth`,
    label: `member-${i}`,
    bio: "Rust developer available for mentoring.",
    skills: ["Rust"],
    availability: "Available this month",
    role: "Developer",
    mentoring: "open",
  }));
}

describe("CHECK 2 / Test B — top-K bound", () => {
  const index = buildTestIndex();

  it("exports an explicit bounded RETRIEVAL_TOP_K", () => {
    expect(RETRIEVAL_TOP_K).toBe(5);
  });

  it("never returns more than RETRIEVAL_TOP_K candidates from the indexed community", () => {
    const candidates = retrieveCandidates(
      "Who can help with Solidity, React, Rust, Docker, cryptography, Kubernetes and mentoring?",
      index.profiles,
    );
    expect(index.profiles.length).toBe(9);
    expect(candidates.length).toBeLessThanOrEqual(RETRIEVAL_TOP_K);
  });

  it("caps retrieval at RETRIEVAL_TOP_K even when every profile matches", () => {
    const candidates = retrieveCandidates("Who can mentor me in Rust this month?", fakeProfiles(50));
    expect(candidates.length).toBe(RETRIEVAL_TOP_K);
  });

  it("respects a custom topK parameter", () => {
    const candidates = retrieveCandidates("Who can mentor me in Rust this month?", fakeProfiles(50), 2);
    expect(candidates.length).toBe(2);
  });

  it("never passes more than RETRIEVAL_TOP_K profiles into the model prompt", () => {
    const candidates = retrieveCandidates("Who can mentor me in Rust this month?", fakeProfiles(50));
    const messages = buildMessages("Who can mentor me in Rust this month?", candidates);
    const dataMessage = JSON.parse(messages[1]!.content) as { candidates: unknown[] };
    expect(dataMessage.candidates.length).toBeLessThanOrEqual(RETRIEVAL_TOP_K);
  });

  it("the actual model request payload only ever contains at most RETRIEVAL_TOP_K candidates", async () => {
    const tmpIndex = path.join(os.tmpdir(), "ens-index-topk.json");
    await saveIndex(index, tmpIndex);

    mockedChatCompletion.mockResolvedValueOnce(
      JSON.stringify({ matches: [], noMatchReason: null }),
    );

    await answerQuery("Who knows Solidity and has time to help?", { indexPath: tmpIndex });

    expect(mockedChatCompletion).toHaveBeenCalledTimes(1);
    const messages = mockedChatCompletion.mock.calls[0]![0];
    const dataMessage = JSON.parse(messages[1]!.content) as { candidates: unknown[] };
    expect(dataMessage.candidates.length).toBeLessThanOrEqual(RETRIEVAL_TOP_K);
  });
});
