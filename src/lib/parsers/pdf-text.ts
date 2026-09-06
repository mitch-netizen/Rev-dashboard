// Server-only: reconstructs each PDF page as line-based text by clustering
// text items on their y-coordinate, then ordering by x within each line.
// Column layout in these reports is well-separated horizontally, so this is
// enough to keep tabular rows intact without full layout analysis.

export async function extractPdfText(buffer: Buffer): Promise<string[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const data = new Uint8Array(buffer);
  const doc = await getDocument({ data, useSystemFonts: true }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    const lines = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = Math.round(item.transform[5]);
      if (!lines.has(y)) lines.set(y, []);
      lines.get(y)!.push({ x: item.transform[4], str: item.str });
    }

    const sortedY = [...lines.keys()].sort((a, b) => b - a);
    const pageLines = sortedY
      .map((y) =>
        lines
          .get(y)!
          .sort((a, b) => a.x - b.x)
          .map((it) => it.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
      )
      .filter(Boolean);

    pages.push(pageLines.join("\n"));
  }

  return pages;
}
