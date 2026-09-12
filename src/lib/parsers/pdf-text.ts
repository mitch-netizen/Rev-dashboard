// Server-only: reconstructs each PDF page as line-based text by clustering
// text items on their y-coordinate, then ordering by x within each line.
// Column layout in these reports is well-separated horizontally, so this is
// enough to keep tabular rows intact without full layout analysis.
//
// Uses unpdf rather than importing pdfjs-dist directly: pdf.js always splits
// its parsing implementation into a separate worker module that it loads by
// a dynamically-computed path, even when running single-threaded ("fake
// worker") — there's no way to avoid that file, and Vercel's serverless
// bundler can't trace the dynamic import to know to include it, so plain
// pdfjs-dist reliably fails there with "Cannot find module .../pdf.worker.mjs".
// unpdf vendors a self-contained pdf.js build with no separate worker file
// to lose, specifically to avoid this class of bug in serverless/edge
// environments.

export async function extractPdfText(buffer: Buffer): Promise<string[]> {
  const { getDocumentProxy } = await import("unpdf");

  const doc = await getDocumentProxy(new Uint8Array(buffer));

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
