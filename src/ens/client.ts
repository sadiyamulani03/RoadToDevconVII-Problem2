import { createPublicClient, http, type PublicClient } from "viem";
import { sepolia } from "viem/chains";

/**
 * Public client used for every ENS read. Targets Sepolia; the transport has an
 * explicit timeout + bounded retries so a hanging RPC cannot stall indexing.
 *
 * The RPC URL comes from SEPOLIA_RPC_URL (see .env.example). No credentials are
 * required: without SEPOLIA_RPC_URL we fall back to a keyless public Sepolia
 * RPC (thirdweb's anonymous endpoint rate-limits ENS-heavy workloads).
 */
export const DEFAULT_SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

export function createEnsClient(rpcUrl?: string): PublicClient {
  const url = rpcUrl ?? process.env.SEPOLIA_RPC_URL ?? DEFAULT_SEPOLIA_RPC;
  return createPublicClient({
    chain: sepolia,
    transport: http(url, {
      timeout: 10_000,
      retryCount: 1,
    }),
  });
}

/**
 * Canonical ENS Registry address on Sepolia (legacy ENSv1 deployment).
 * Source: https://docs.ens.domains/ens-deployments and
 * ensdomains/ens-contracts deployments/sepolia.
 * Used by scripts/seed-community.ts and scripts/verify-ens.ts only.
 */
export const ENS_REGISTRY_SEPOLIA = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as const;

/**
 * PublicResolver on Sepolia (legacy ENSv1 deployment) that the seed script
 * points community subnames at so their text records become readable.
 */
export const PUBLIC_RESOLVER_SEPOLIA = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5" as const;
