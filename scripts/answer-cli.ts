import { answerQuery, previewQuery } from "../src/pipeline/answerQuery";
import { isLlmConfigured } from "../src/llm/client";
import type { FinalAnswer } from "../src/types/matching";

/** CLI: npm run answer -- "Who can mentor me in Rust this month?" */
async function main(): Promise<void> {
  const query = process.argv.slice(2).join(" ").trim();
  if (query.length === 0) {
    console.error('Usage: npm run answer -- "Who can mentor me in Rust this month?"');
    process.exit(1);
  }

  const useLlm = isLlmConfigured();
  console.log(`Query: ${query}`);
  console.log(
    useLlm
      ? "Mode: full pipeline (retrieval -> top-K -> LLM -> Zod validation -> membership guard)\n"
      : "Mode: retrieval preview (LLM_API_KEY is not set; no LLM call is made)\n",
  );

  const result: FinalAnswer = useLlm ? await answerQuery(query) : await previewQuery(query);

  console.log(`Status: ${result.status}`);
  console.log(result.message);
  if (result.rejectedNames.length > 0) {
    console.log(`Rejected hallucinated name(s): ${result.rejectedNames.join(", ")}`);
  }
  if (result.candidatesConsidered.length > 0) {
    console.log(`Candidates sent to the model: ${result.candidatesConsidered.join(", ")}`);
  }
  for (const match of result.matches) {
    console.log(`\n- ${match.ensName}`);
    console.log(`  ${[match.role, ...match.skills].filter(Boolean).join(" | ")}`);
    if (match.availability) console.log(`  Availability: ${match.availability}`);
    console.log(`  Why: ${match.reason}`);
    if (match.matchedTerms.length > 0) {
      console.log(`  Matched terms: ${match.matchedTerms.join(", ")} (score ${match.score})`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
