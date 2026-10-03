import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { retrieveCandidates, RETRIEVAL_TOP_K } from "../src/retrieval/retrieveCandidates";
import { buildTestIndex } from "./fixtures";

type EvalQuery = {
  id: string;
  query: string;
  expectedMembers: string[];
  mustNotInclude?: string[];
  category?: string;
};

const evalQueries = JSON.parse(
  readFileSync(path.join(process.cwd(), "evaluation", "test-queries.json"), "utf8"),
) as EvalQuery[];

/**
 * CHECK 8 / Test H — recorded evaluation queries.
 *
 * Every recorded query is run through the deterministic retrieval layer; each
 * must surface its expected members within the retrieved candidates (and the
 * no-match case must retrieve zero candidates).
 */
describe("CHECK 8 / Test H — evaluation queries", () => {
  const index = buildTestIndex();

  it("every recorded query lists expected members explicitly", () => {
    expect(evalQueries.length).toBeGreaterThanOrEqual(8);
    for (const evalQuery of evalQueries) {
      expect(Array.isArray(evalQuery.expectedMembers)).toBe(true);
    }
  });

  for (const evalQuery of evalQueries) {
    it(`[${evalQuery.id}] "${evalQuery.query}"`, () => {
      const candidates = retrieveCandidates(evalQuery.query, index.profiles);
      const names = candidates.map((candidate) => candidate.profile.ensName);

      if (evalQuery.expectedMembers.length === 0) {
        // No-match case: the deterministic retriever must find zero candidates.
        expect(names).toEqual([]);
      } else {
        for (const expected of evalQuery.expectedMembers) {
          expect(names).toContain(expected);
        }
      }

      for (const forbidden of evalQuery.mustNotInclude ?? []) {
        expect(names).not.toContain(forbidden);
      }

      expect(candidates.length).toBeLessThanOrEqual(RETRIEVAL_TOP_K);
    });
  }

  it("expected members are real indexed community names", () => {
    const indexed = new Set(index.profiles.map((profile) => profile.ensName));
    for (const evalQuery of evalQueries) {
      for (const expected of evalQuery.expectedMembers) {
        expect(indexed.has(expected)).toBe(true);
      }
    }
  });
});
