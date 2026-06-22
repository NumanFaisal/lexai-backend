// scripts/test-retrieval.ts
import { EmbeddingProvider } from '../src/ai/embeddings/embeddings.provider';
import { VectorStore } from '../src/ai/embeddings/vector.store';

async function testRetrieval() {
  const query = "What are the rules regarding anticipatory bail in India?";
  console.log(`🔍 Testing retrieval for query: "${query}"`);

  try {
    const embedding = await EmbeddingProvider.embedText(query);
    const results = await VectorStore.searchSimilarPrecedents(embedding, 3, 0.4);

    console.log(`\n📋 Retrieval Results (Total: ${results.length}):`);
    results.forEach((res, i) => {
      console.log(`\n[${i + 1}] Title: ${res.title}`);
      console.log(`    Similarity: ${(res.similarity * 100).toFixed(2)}%`);
      console.log(`    Content: ${res.content.slice(0, 150)}...`);
    });
  } catch (error) {
    console.error("Error during retrieval test:", error);
  }

  process.exit(0);
}

testRetrieval().catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
