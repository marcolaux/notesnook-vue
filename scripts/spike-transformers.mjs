import { pipeline, env } from "@huggingface/transformers";

console.log("=== Phase 0 Spike B: Testing @huggingface/transformers ===");

// Configure local cache / on-device execution settings
env.allowRemoteModels = true; // allow fetching model on initial test run if needed

try {
  console.log("1. Loading Feature Extraction Pipeline (Xenova/all-MiniLM-L6-v2)...");
  const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
    dtype: "fp32"
  });

  console.log("2. Computing embedding for test prompt 'Notesnook Vue local vector search'...");
  const text = "Notesnook Vue local vector search";
  const output = await extractor(text, { pooling: "mean", normalize: true });

  const embeddingArray = new Float32Array(output.data);
  console.log(`3. Generated Embedding Vector! Dimensions: ${embeddingArray.length}`);
  console.log(`First 5 components:`, Array.from(embeddingArray.slice(0, 5)));

  console.log("=== Spike B PASSED CLEANLY! ===");
} catch (err) {
  console.error("Spike B Failed with Error:", err);
  process.exit(1);
}
