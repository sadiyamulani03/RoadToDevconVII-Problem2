import path from "path";
import { buildIndexFromFixture, type EnsIndex } from "../src/ens/indexer";

/** Explicitly documented test fixture (fixtures/sepolia-community-fixture.json). */
export const FIXTURE_PATH = path.join(process.cwd(), "fixtures", "sepolia-community-fixture.json");

export function buildTestIndex(): EnsIndex {
  return buildIndexFromFixture(FIXTURE_PATH);
}

export const ADVERSARIAL_NAME = "troll-trudy.roadtodevcon.eth";
export const ADVERSARIAL_INJECTED_NAME = "fake-hallucinated.eth";
