import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";

/**
 * Configuration of WHICH community ENS names are indexed.
 *
 * This file contains ONLY public ENS names and the metadata necessary to
 * locate them. It is never a source of profile text: profile data always
 * comes from live ENS text-record reads (or, for offline demos/tests, from the
 * explicitly documented fixture in fixtures/sepolia-community-fixture.json).
 */
export const CommunityConfigSchema = z.object({
  /** Parent ENS name the community subnames live under */
  parent: z.string().min(1),
  /** Chain the names live on (informational; reads always target Sepolia) */
  chain: z.string().min(1),
  members: z
    .array(
      z.object({
        name: z.string().min(1),
        label: z.string().min(1),
      }),
    )
    .min(1),
});

export type CommunityConfig = z.infer<typeof CommunityConfigSchema>;
export type CommunityMember = CommunityConfig["members"][number];

export const COMMUNITY_CONFIG_PATH = path.join(process.cwd(), "community", "members.json");

export async function loadCommunityConfig(configPath = COMMUNITY_CONFIG_PATH): Promise<CommunityConfig> {
  const raw = await fs.readFile(configPath, "utf8");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`Community config is not valid JSON: ${configPath}`);
  }
  const parsed = CommunityConfigSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Invalid community config at ${configPath}: ${parsed.error.message}`);
  }
  return parsed.data;
}
