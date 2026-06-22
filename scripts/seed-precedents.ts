// scripts/seed-precedents.ts
import { PrismaClient } from '@prisma/client';
import { EmbeddingProvider } from '../src/ai/embeddings/embeddings.provider';

const prisma = new PrismaClient();

// Example format of your raw data (could be a JSON file you scrape from Indian Kanoon)
const rawPrecedents = [
  {
    title: "Gurbaksh Singh Sibbia v. State of Punjab",
    year: 1980,
    court: "Supreme Court",
    act: "CrPC",
    content: "The Supreme Court held that Section 438 of the Code of Criminal Procedure, 1973, which grants anticipatory bail, is to be interpreted liberally. It is a device to secure the individual's liberty and is not subject to unstated time limits or conditions unless necessary."
  },
  {
    title: "Maneka Gandhi v. Union of India",
    year: 1978,
    court: "Supreme Court",
    act: "Constitution",
    content: "The court expanded the scope of Article 21, establishing that the procedure established by law must be fair, just, and reasonable, not fanciful, oppressive or arbitrary."
  }
];

async function seedPrecedents() {
  console.log("🌱 Starting Vector DB Seeding...");

  for (const item of rawPrecedents) {
    console.log(`Embedding: ${item.title}...`);
    
    // 1. Generate the 1536-dimensional vector using OpenAI
    const embedding = await EmbeddingProvider.embedText(item.content);
    const embeddingString = `[${embedding.join(',')}]`;

    // 2. Insert into the database using pgvector's raw SQL
    await prisma.$executeRaw`
      INSERT INTO precedents (id, title, content, embedding, metadata, "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid(),
        ${item.title},
        ${item.content},
        ${embeddingString}::vector,
        ${JSON.stringify({ year: item.year, court: item.court, act: item.act })}::jsonb,
        NOW(),
        NOW()
      );
    `;
    console.log(`✅ Inserted: ${item.title}`);
  }

  console.log("🎉 Seeding Complete!");
  process.exit(0);
}

seedPrecedents().catch((e) => {
  console.error("Failed to seed:", e);
  process.exit(1);
});