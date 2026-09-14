/**
 * Exports an execution's real text result as a downloadable file. This does
 * NOT generate a file the way Claude/Cowork might one day return one —
 * neither the Claude API call in lib/claude.ts nor the (still needs_setup)
 * Cowork adapter in lib/cowork.ts returns binary file content today, only
 * text. So a skill whose prompt says "generate a PDF" still only gets a
 * text result back from Claude; this utility takes that real text and
 * formats it into an actual downloadable .txt or .pdf, honestly labeled as
 * an export of the text result rather than a fabricated file.
 */

export function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  triggerDownload(blob, filename);
}

export async function downloadPdf(filename: string, title: string, content: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 48;
  const marginTop = 56;
  const maxWidth = doc.internal.pageSize.getWidth() - marginX * 2;
  const pageHeight = doc.internal.pageSize.getHeight();
  const lineHeight = 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, marginX, marginTop);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  const lines: string[] = doc.splitTextToSize(content, maxWidth);

  let y = marginTop + 28;
  for (const line of lines) {
    if (y > pageHeight - marginTop) {
      doc.addPage();
      y = marginTop;
    }
    doc.text(line, marginX, y);
    y += lineHeight;
  }

  triggerDownload(doc.output("blob"), filename);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
