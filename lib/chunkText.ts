export function chunkText(text: string, maxChars = 1200) {
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();

  const chunks: string[] = [];
  let start = 0;

  while (start < cleaned.length) {
    let end = start + maxChars;

    if (end < cleaned.length) {
      const lastPeriod = cleaned.lastIndexOf(".", end);
      if (lastPeriod > start + 300) {
        end = lastPeriod + 1;
      }
    }

    const chunk = cleaned.slice(start, end).trim();

    if (chunk.length > 100) {
      chunks.push(chunk);
    }

    start = end;
  }

  return chunks;
}