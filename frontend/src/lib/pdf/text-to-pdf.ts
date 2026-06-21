// Render a title + body of plain text into a simple, paginated A4 PDF blob.
// jsPDF is lazy-imported so it never enters the initial bundle.

export async function textToPdfBlob(title: string, body: string): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const margin = 56;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  if (title.trim()) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    const titleLines = doc.splitTextToSize(title.trim(), maxWidth) as string[];
    doc.text(titleLines, margin, y);
    y += titleLines.length * 20 + 10;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  const lineHeight = 16;
  // Preserve the author's paragraph breaks, wrapping each within the page width.
  for (const paragraph of body.split("\n")) {
    const lines =
      paragraph.length > 0
        ? (doc.splitTextToSize(paragraph, maxWidth) as string[])
        : [""];
    for (const line of lines) {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += lineHeight;
    }
  }

  return doc.output("blob");
}
