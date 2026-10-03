import {
  createPublicClient,
  createWalletClient,
  http,
  namehash,
  parseAbi,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { labelhash } from "viem/ens";
import { promises as fs } from "fs";
import { ENS_REGISTRY_SEPOLIA, PUBLIC_RESOLVER_SEPOLIA } from "../src/ens/client";
import { loadCommunityConfig } from "../src/ens/community";
import { TEXT_RECORD_KEYS, TEXT_RECORD_KEY_LIST } from "../src/ens/textRecords";
import { DEFAULT_FIXTURE_PATH } from "../src/ens/indexer";

/**
 * Seeds the Sepolia ENS community:
 *
 *   1. points the parent community name's resolver at the Sepolia PublicResolver,
 *   2. creates every subname in community/members.json under that parent,
 *   3. writes the documented text records for every member
 *      (profile text comes from the documented fixture file, mirroring on-chain values).
 *
 * Requires PRIVATE_KEY (env only, never committed) for a throwaway TEST wallet
 * that owns the parent name on Sepolia. The application itself never touches a
 * private key.
 *
 *   npm run seed        (send transactions)
 *   npm run seed:dry    (print the planned calls without sending)
 */
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

const registryAbi = parseAbi([
  "function owner(bytes32 node) view returns (address)",
  "function resolver(bytes32 node) view returns (address)",
  "function setResolver(bytes32 node, address resolver)",
]);

const resolverAbi = parseAbi([
  "function setSubnodeRecord(bytes32 parentNode, bytes32 label, address owner, address resolver, uint64 ttl)",
  "function setText(bytes32 node, string key, string value)",
]);

async function main(): Promise<void> {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error(
      "PRIVATE_KEY is not set. This script seeds ENS records on Sepolia and needs a funded throwaway test wallet that owns the parent community name. Copy .env.example to .env and set PRIVATE_KEY (never commit it).",
    );
    process.exit(1);
  }

  const config = await loadCommunityConfig();
  const fixtureRaw = await fs.readFile(DEFAULT_FIXTURE_PATH, "utf8");
  const fixture = JSON.parse(fixtureRaw) as {
    profiles?: Array<{ name?: string; records?: Record<string, string> }>;
  };
  const recordsByName = new Map<string, Record<string, string>>();
  for (const profile of fixture.profiles ?? []) {
    if (profile?.name && profile.records) recordsByName.set(profile.name, profile.records);
  }

  const rpcUrl = process.env.SEPOLIA_RPC_URL ?? undefined;
  const account = privateKeyToAccount(privateKey.trim() as `0x${string}`);
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl, { timeout: 15_000, retryCount: 1 }),
  });
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl, { timeout: 15_000, retryCount: 1 }),
  });

  console.log(`Seeding ${config.members.length} subnames under ${config.parent} on Sepolia`);
  console.log(`Wallet: ${account.address}${dryRun ? " (dry run — nothing is sent)" : ""}\n`);

  const parentNode = namehash(config.parent);

  const parentOwner = await publicClient.readContract({
    address: ENS_REGISTRY_SEPOLIA,
    abi: registryAbi,
    functionName: "owner",
    args: [parentNode],
  });
  if (parentOwner.toLowerCase() !== account.address.toLowerCase()) {
    console.error(
      `Wallet ${account.address} does not own ${config.parent} on Sepolia (owner: ${parentOwner}). Register/transfer a parent name you control first (e.g. via the Sepolia ENS app), then re-run.`,
    );
    process.exit(1);
  }

  const parentResolver = await publicClient.readContract({
    address: ENS_REGISTRY_SEPOLIA,
    abi: registryAbi,
    functionName: "resolver",
    args: [parentNode],
  });

  let resolverAddress = parentResolver;
  if (resolverAddress === zeroAddress || resolverAddress.toLowerCase() !== PUBLIC_RESOLVER_SEPOLIA.toLowerCase()) {
    if (resolverAddress !== zeroAddress) {
      console.warn(`Parent resolver ${resolverAddress} is not the Sepolia PublicResolver; switching it (existing parent records would be lost).`);
    }
    console.log(`Setting parent resolver -> ${PUBLIC_RESOLVER_SEPOLIA}`);
    if (!dryRun) {
      const hash = await walletClient.writeContract({
        address: ENS_REGISTRY_SEPOLIA,
        abi: registryAbi,
        functionName: "setResolver",
        args: [parentNode, PUBLIC_RESOLVER_SEPOLIA],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  tx: ${hash}`);
    }
    resolverAddress = PUBLIC_RESOLVER_SEPOLIA;
  } else {
    console.log(`Parent resolver already set: ${resolverAddress}`);
  }

  for (const member of config.members) {
    console.log(`\nMember: ${member.name}`);
    const label = labelhash(member.label);
    console.log(`  setSubnodeRecord(${config.parent}, ${member.label}) -> owner ${account.address}`);
    if (!dryRun) {
      const hash = await walletClient.writeContract({
        address: resolverAddress,
        abi: resolverAbi,
        functionName: "setSubnodeRecord",
        args: [parentNode, label, account.address, PUBLIC_RESOLVER_SEPOLIA, 0n],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  tx: ${hash}`);
    }

    const records = recordsByName.get(member.name) ?? {};
    for (const key of TEXT_RECORD_KEY_LIST) {
      const value = records[key];
      if (value === undefined || value.length === 0) continue;
      console.log(`  setText(${key}) -> "${value.slice(0, 60)}${value.length > 60 ? "..." : ""}"`);
      if (!dryRun) {
        const hash = await walletClient.writeContract({
          address: PUBLIC_RESOLVER_SEPOLIA,
          abi: resolverAbi,
          functionName: "setText",
          args: [namehash(member.name), TEXT_RECORD_KEYS[key as keyof typeof TEXT_RECORD_KEYS], value],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        console.log(`    tx: ${hash}`);
      }
    }
  }

  console.log(
    `\nDone${dryRun ? " (dry run)" : ""}. Verify with: npm run verify:ens`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
