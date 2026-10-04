import { buildIndexFromEns, buildIndexFromFixture, saveIndex } from "../src/ens/indexer";
import { createEnsClient } from "../src/ens/client";
import { loadCommunityConfig } from "../src/ens/community";

/**
 * Rebuilds the retrieval index.
 *
 *   npm run index        -> rebuild from LIVE Sepolia ENS text-record reads
 *   npm run index:demo   -> rebuild from the documented offline demo fixture
 *                           (fixtures/sepolia-community-fixture.json; for demos
 *                           and tests only — ENS remains the source of truth)
 *   npm run refresh      -> alias of npm run index
 */
const args = process.argv.slice(2);
const sourceFlag = args.includes("--source") ? args[args.indexOf("--source") + 1] : "ens";

async function main(): Promise<void> {
  const config = await loadCommunityConfig();
  console.log(
    `Community: ${config.members.length} names under ${config.parent} (chain: ${config.chain})`,
  );

  let source: "ens" | "fixture";
  let index;
  if (sourceFlag === "ens") {
    console.log("Rebuilding index from LIVE Sepolia ENS text-record reads (getEnsText)...");
    const client = createEnsClient();
    source = "ens";
    index = await buildIndexFromEns(client, config.members);
  } else if (sourceFlag === "fixture") {
    console.log("Rebuilding index from the documented offline demo fixture (NOT live ENS).");
    console.log("ENS text records remain the runtime source of truth; this mode is for demos/tests only.");
    source = "fixture";
    index = await buildIndexFromFixture();
  } else {
    throw new Error(`Unknown --source "${sourceFlag}" (expected "ens" or "fixture")`);
  }

  await saveIndex(index);

  console.log(
    `Indexed ${index.profiles.length}/${config.members.length} members -> .data/ens-index.json (source: ${source})`,
  );
  for (const error of index.errors) {
    console.warn(`  skipped ${error.ensName}: ${error.reason}`);
  }
  if (index.profiles.length === 0) {
    console.warn(
      "WARNING: the index is empty. If the ENS names do not exist on Sepolia yet, run `npm run seed` (needs a funded test wallet), or `npm run index:demo` for the documented offline fixture.",
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
