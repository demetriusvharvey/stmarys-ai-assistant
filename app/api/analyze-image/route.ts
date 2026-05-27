import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { openai } from "@/lib/openai";

export const runtime = "nodejs";

type ChatRole = "user" | "assistant";

type StoredMessage = {
  role: ChatRole;
  content: string;
};

type SearchChunk = {
  chunk_id: string;
  document_id: string;
  content: string;
  chunk_index: number | null;
  title: string;
  category: string;
  source: string;
  source_url: string | null;
  external_id: string | null;
  similarity: number | string;
};

function vectorToSql(vector: number[]) {
  return `[${vector.join(",")}]`;
}

function toOpenAIMessages(messages: StoredMessage[]) {
  return messages
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        message.content?.trim()
    )
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const file = formData.get("image") as File | null;
    const question = String(formData.get("question") || "").trim();
    const conversationId = String(formData.get("conversationId") || "").trim();

    if (!file) {
      return NextResponse.json(
        { success: false, error: "image is required" },
        { status: 400 }
      );
    }

    let conversationHistory: StoredMessage[] = [];

    if (conversationId) {
      const historyResult = await db.query(
        `
        select role, content
        from messages
        where conversation_id = $1
        order by created_at desc
        limit 12
        `,
        [conversationId]
      );

      conversationHistory = historyResult.rows.reverse();
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");
    const mimeType = file.type || "image/png";

    const imageSummaryResult = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You analyze images for a St. Mary's internal AI assistant.

Describe what is visible clearly and neutrally.
Use conversation history when it helps understand what the user is referring to.
Identify apps, systems, screens, error messages, forms, documents, or workflows if visible.
Do not assume there is a problem unless the image clearly shows an error or the user asks for troubleshooting.
Do not identify real people.
Do not provide medical advice or clinical decisions.

Return a concise image summary useful for searching internal St. Mary's documents.
          `.trim(),
        },
        ...toOpenAIMessages(conversationHistory),
        {
          role: "user",
          content: [
            {
              type: "text",
              text: question
                ? `User question about this image:\n${question}`
                : "The user uploaded this image without a question. Summarize what is visible for internal knowledge search.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
              },
            },
          ],
        },
      ],
      temperature: 0.15,
    });

    const imageSummary =
      imageSummaryResult.choices[0]?.message?.content ||
      "No image summary could be generated.";

    const searchText = question
      ? `${question}\n\nImage summary:\n${imageSummary}`
      : imageSummary;

    const embeddingResult = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: searchText,
    });

    const vector = vectorToSql(embeddingResult.data[0].embedding);

    const searchResult = await db.query(
      `
      select
        dc.id as chunk_id,
        dc.document_id,
        dc.content,
        dc.chunk_index,
        d.title,
        d.category,
        d.source,
        d.source_url,
        d.external_id,
        1 - (dc.embedding <=> $1::vector) as similarity
      from document_chunks dc
      join documents d
        on d.id = dc.document_id
      where
        d.is_active = true
      order by dc.embedding <=> $1::vector
      limit 6
      `,
      [vector]
    );

    const chunks = searchResult.rows as SearchChunk[];

    const context = chunks
      .map(
        (chunk, index) => `
[Document ${index + 1}]
Title: ${chunk.title}
Category: ${chunk.category}
Similarity: ${chunk.similarity}
Content:
${chunk.content}
`
      )
      .join("\n\n-------------------\n\n");

    const finalResult = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are St. Mary's internal AI assistant.

You are a general-purpose operational assistant, not only a troubleshooter.

Use conversation history to understand follow-up questions about previous screenshots or messages.

Behavior:
- Do NOT assume every screenshot is an error.
- Do NOT jump into troubleshooting unless the user asks for help, asks what is wrong, asks how to fix it, or the image clearly shows an error.
- If the user uploaded an image with no question, describe what is visible and ask what they want help with.
- If the user asks a follow-up like "where do I click?" use the current image and previous conversation context.
- If internal documents clearly match, mention the document title naturally.
- If internal documents are only possibly related, say they may need verification.
- If no useful internal document appears relevant, answer normally using the image and general reasoning.
- Do not present general guidance as official St. Mary's policy.
- Do not identify real people in images.
- Do not provide medical advice or clinical decisions.
          `.trim(),
        },
        ...toOpenAIMessages(conversationHistory),
        {
          role: "user",
          content: `
User question:
${question || "(No question provided)"}

Image summary:
${imageSummary}

Retrieved active internal St. Mary's knowledge:
${context || "No active internal knowledge found."}

Now respond naturally and helpfully.
          `.trim(),
        },
      ],
      temperature: 0.25,
    });

    const answer =
      finalResult.choices[0]?.message?.content ||
      "I could not analyze this image.";

    return NextResponse.json({
      success: true,
      answer,
      fileName: file.name,
      mimeType,
      imageSummary,
      retrievedChunks: chunks.length,
      usedConversationHistory: conversationHistory.length,
      sources: chunks.map((chunk) => ({
        id: chunk.chunk_id,
        documentId: chunk.document_id,
        title: chunk.title,
        category: chunk.category,
        source: chunk.source,
        sourceUrl: chunk.source_url,
        externalId: chunk.external_id,
        similarity: Number(chunk.similarity),
        chunkIndex: chunk.chunk_index,
      })),
    });
  } catch (error: any) {
    console.error("ANALYZE_IMAGE_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to analyze image",
      },
      { status: 500 }
    );
  }
}
