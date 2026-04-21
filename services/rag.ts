import { Index } from "@upstash/vector";
import { embed } from "ai";
import { getEmbeddingModel } from "@/lib/ai/config";

// Initialize Upstash Vector client
// Note: UPSTASH_VECTOR_REST_URL and UPSTASH_VECTOR_REST_TOKEN must be in .env
const index = new Index({
  url: process.env.UPSTASH_VECTOR_REST_URL as string,
  token: process.env.UPSTASH_VECTOR_REST_TOKEN as string,
});

export async function upsertQuestion(questionId: string, text: string) {
  try {
    // 1. Generate embedding using Google's text-embedding-004
    const { embedding } = await embed({
      model: getEmbeddingModel(),
      value: text,
    });

    // 2. Upsert to Upstash Vector
    await index.upsert({
      id: questionId,
      vector: embedding,
      metadata: { text },
    });

    console.log(`[RAG] Successfully upserted question ${questionId}`);
    return true;
  } catch (error) {
    console.error(`[RAG] Failed to upsert question ${questionId}:`, error);
    throw error;
  }
}

export async function searchSimilar(text: string, limit: number = 3) {
  try {
    // 1. Generate embedding for the search query
    const { embedding } = await embed({
      model: getEmbeddingModel(),
      value: text,
    });

    // 2. Query Upstash Vector
    const results = await index.query({
      vector: embedding,
      topK: limit,
      includeMetadata: true,
    });

    console.log(`[RAG] Found ${results.length} similar questions`);
    return results;
  } catch (error) {
    console.error(`[RAG] Failed to search similar questions:`, error);
    throw error;
  }
}
