import { createPublicClient, http, namehash, parseAbi } from "viem";
import { createEnsClient, ENS_REGISTRY_SEPOLIA, DEFAULT_SEPOLIA_RPC } from "../src/ens/client";
import { loadCommunityConfig } from "../src/ens/community";
import { readCommunityProfile } from "../src/ens/profileReader";
import { TEXT_RECORD_KEY_LIST } from "../src/ens/textRecords";

/**
 * Live ENS diagnostic for Sepolia:
 *  1. checks RPC reachability against the ENS registry,
 *  2. reads the resolver of the parent community name,
 *  3. runs the real profile reader (getEnsText) for every configured member.
 *
 * Run with: npm run verify:ens
 */
const registryAbi = parseAbi(["function resolver(bytes32 node) view returns (address)"]);

async function main(): Promise<void> {
  const client = createEnsClient();
  console.log(`Chain: ${client.chain.name ?? "sepolia"} (id ${client.chain.id})`);
  console.log(`RPC: ${process.env.SEPOLIA_RPC_URL ?? DEFAULT_SEPOLIA_RPC}`);

  const config = await loadCommunityConfig();
  const parent = config.parent;
  console.log(`\nParent name: ${parent}`);

  let parentResolver = "0x0000000000000000000000000000000000000000";
  try {
    parentResolver = await client.readContract({
      address: ENS_REGISTRY_SEPOLIA,
      abi: registryAbi,
      functionName: "resolver",
      args: [namehash(parent)],
    });
    console.log(`Parent resolver: ${parentResolver}`);
  } catch (error) {
    console.warn(`Parent resolver read failed: ${error instanceof Error ? error.message : error}`);
  }

  console.log(`\nReading profiles for ${config.members.length} members via getEnsText...\n`);
  for (const member of config.members) {
    const result = await readCommunityProfile(client, member.name);
    if (result.ok) {
      const profile = result.profile;
      console.log(`OK  ${member.name}`);
      console.log(`    skills: ${profile.skills.join(", ") || "-"}`);
      console.log(`    availability: ${profile.availability || "-"}`);
      console.log(`    role: ${profile.role || "-"}`);
      console.log(`    mentoring: ${profile.mentoring || "-"}`);
    } else {
      console.log(`ERR ${member.name}: ${result.reason}`);
    }
  }

  console.log(`\nText record keys read: ${TEXT_RECORD_KEY_LIST.join(", ")}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
