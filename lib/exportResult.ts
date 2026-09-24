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

/**
 * Turns a result's already-parsed markdown table (lib/resultTable.ts) into
 * a real downloadable .csv — unlike .txt/.pdf above, this is structured
 * data a spreadsheet can actually open as columns, not a text dump. Exists
 * because Cowork attaching its own real .xlsx/.csv is best-effort (depends
 * on the model actually doing it, see mac-agent/agent.js's driveCowork()
 * instruction) — this gives a guaranteed CSV from the same markdown table
 * every tabular result already includes in its text, regardless of whether
 * Cowork also attached a file.
 */
export function downloadCsv(filename: string, rows: Record<string, string>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = [
    headers.map(escape).join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h] ?? "")).join(",")),
  ];
  // ﻿: UTF-8 BOM so Excel (still the default on Windows) doesn't mangle
  // accented pt-BR characters when double-clicking the file open.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, filename);
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
