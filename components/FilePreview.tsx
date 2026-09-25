"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Eye, EyeOff, Loader2 } from "lucide-react";

/**
 * A minimal RFC4180-ish CSV parser (quoted fields, escaped "" quotes, CRLF
 * or LF line endings) — hand-rolled rather than a dependency, same as
 * lib/resultTable.ts's markdown table parser, since this app only ever
 * needs to render rows as a table, not round-trip arbitrary CSV. Strips a
 * leading UTF-8 BOM first — this app's own downloadCsv() (lib/exportResult.ts)
 * writes one on purpose for Excel, and a real tool generating a CSV
 * (pandas, etc.) commonly does too.
 */
function parseCsv(text: string): string[][] {
  const withoutBom = text.startsWith("﻿") ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < withoutBom.length; i++) {
    const char = withoutBom[i];
    if (inQuotes) {
      if (char === '"') {
        if (withoutBom[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && withoutBom[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

const MAX_PREVIEW_ROWS = 300;

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type PreviewKind = "pdf" | "csv" | "xlsx" | "text" | null;

/** What kind of preview (if any) a file gets — checked by MIME type first,
 *  falling back to the file's extension. The fallback matters in practice:
 *  a Claude-direct skill's mimeType comes from Anthropic's Files API
 *  metadata, which falls back to a generic "application/octet-stream" when
 *  it doesn't know better (lib/claude.ts), and a Cowork skill's mimeType is
 *  whatever the model itself chooses to send in its tool call — the prompt
 *  gives the canonical string as an example, but nothing enforces it. A
 *  real .xlsx with an off-spec/generic mimeType silently got no preview
 *  button before this fallback existed, even though the file itself was
 *  fine. A skill's own generated .docx/.pptx etc. still has no in-browser
 *  preview here — no library for those in this app, and adding one just
 *  for a preview isn't worth the bundle weight yet — so the button simply
 *  doesn't render for those, same "don't fake it" rule as everywhere else —
 *  a download link is still right there either way. */
function resolvePreviewKind(mimeType: string, fileName: string): PreviewKind {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (mimeType === "application/pdf" || ext === "pdf") return "pdf";
  if (mimeType === XLSX_MIME || ext === "xlsx") return "xlsx";
  if (mimeType === "text/csv" || ext === "csv") return "csv";
  if (
    mimeType === "text/plain" ||
    mimeType === "application/json" ||
    ext === "txt" ||
    ext === "json" ||
    ext === "md"
  ) {
    return "text";
  }
  return null;
}

/** An exceljs cell's raw value can be a rich object, not just a primitive —
 *  a formula ({formula, result}), a hyperlink ({text, hyperlink}), rich
 *  text ({richText: [...]}), or an error ({error}) — coerced to whatever a
 *  person would actually read as that cell's content, not [object Object]. */
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toLocaleString("pt-BR");
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if ("error" in v) return String(v.error);
    if ("richText" in v && Array.isArray(v.richText)) {
      return (v.richText as { text?: string }[]).map((r) => r.text ?? "").join("");
    }
    if ("text" in v && "hyperlink" in v) return String(v.text);
    if ("result" in v) return cellToString(v.result);
    if ("formula" in v) return String(v.formula);
    return "";
  }
  return String(value);
}

/**
 * Reads an .xlsx workbook client-side and returns its first worksheet as
 * rows — dynamically imported (exceljs is a real dependency, but only
 * loaded when an actual .xlsx preview is opened, same lazy pattern
 * lib/exportResult.ts already uses for jspdf). Chose exceljs over the more
 * commonly-reached-for `xlsx` (SheetJS) package specifically because the
 * npm build of `xlsx` has two long-standing, "no fix available"
 * vulnerabilities (prototype pollution, ReDoS) — the actively-maintained
 * SheetJS build only lives on their own CDN, not npm. exceljs is actively
 * maintained and, at the time this was added, its own audit only surfaced
 * a moderate issue in a transitive `uuid` dependency's buffer-provided
 * v3/v5/v6 calls — a code path this app never exercises (only reading
 * workbooks, not using exceljs's id-generation features).
 *
 * Only the FIRST sheet is shown — a multi-sheet workbook's other sheets
 * aren't previewable here, only via the real download. Worth surfacing
 * later if that turns out to matter in practice, not guessed at now.
 */
async function readXlsxFirstSheet(blob: Blob): Promise<string[][]> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow((row) => {
    const values = row.values as unknown[];
    rows.push(values.slice(1).map(cellToString)); // index 0 is always empty in exceljs's 1-indexed row.values
  });
  return rows;
}

/**
 * Toggle button that fetches an execution's real generated file (same
 * authenticated route the download link already uses) and renders it
 * inline — a PDF via the browser's own built-in viewer (an <iframe> on a
 * client-side Blob URL, so it renders instead of triggering a download the
 * way the route's Content-Disposition: attachment would if linked to
 * directly), a CSV or an .xlsx's first sheet (see readXlsxFirstSheet) as an
 * actual table, plain text/JSON as preformatted text. Fetched once per file
 * and kept in memory for the rest of this modal's lifetime — collapsing
 * and reopening the preview doesn't re-fetch.
 */
export default function FilePreview({
  executionId,
  fileIndex,
  fileName,
  mimeType,
}: {
  executionId: string;
  fileIndex: number;
  fileName: string;
  mimeType: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [tableRows, setTableRows] = useState<string[][] | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);

  // Blob URLs aren't garbage-collected on their own — revoke it once this
  // row is gone (the modal closes, or the execution list re-renders it
  // away) instead of leaking one per PDF ever previewed in the session.
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const kind = resolvePreviewKind(mimeType, fileName);
  if (!kind) return null;

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (pdfUrl || tableRows || textContent) return; // already loaded once

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/executions/${executionId}/files/${fileIndex}`);
      if (!res.ok) throw new Error(`Falha ao carregar o arquivo (HTTP ${res.status})`);
      const blob = await res.blob();

      if (kind === "pdf") {
        setPdfUrl(URL.createObjectURL(blob));
      } else if (kind === "csv") {
        setTableRows(parseCsv(await blob.text()));
      } else if (kind === "xlsx") {
        setTableRows(await readXlsxFirstSheet(blob));
      } else {
        setTextContent(await blob.text());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar o arquivo");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full mt-1.5">
      <button
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-hover transition-colors"
      >
        {open ? <EyeOff size={12} /> : <Eye size={12} />}
        {open ? "Ocultar prévia" : "Visualizar"}
      </button>

      {open && (
        <div className="mt-2 rounded-md border border-line bg-surface p-2">
          {loading && (
            <div className="flex items-center gap-1.5 text-xs text-muted py-3 justify-center">
              <Loader2 size={13} className="animate-spin" />
              Carregando prévia...
            </div>
          )}
          {error && (
            <div className="flex items-center gap-1.5 text-xs text-red-600 py-2">
              <AlertTriangle size={12} />
              {error}
            </div>
          )}
          {pdfUrl && (
            <iframe src={pdfUrl} title={fileName} className="w-full h-[70vh] rounded border border-line" />
          )}
          {tableRows && tableRows.length > 0 && (
            <div className="overflow-auto max-h-[60vh]">
              <table className="min-w-full text-xs border-collapse">
                <thead>
                  <tr>
                    {tableRows[0].map((cell, i) => (
                      <th
                        key={i}
                        className="sticky top-0 bg-canvas border-b border-line px-2 py-1.5 text-left font-medium text-ink/80 whitespace-nowrap"
                      >
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.slice(1, MAX_PREVIEW_ROWS + 1).map((row, i) => (
                    <tr key={i} className="border-b border-line/60 last:border-0">
                      {row.map((cell, j) => (
                        <td key={j} className="px-2 py-1 text-ink/70 whitespace-nowrap">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {tableRows.length - 1 > MAX_PREVIEW_ROWS && (
                <p className="text-xs text-muted mt-1.5">
                  Mostrando as primeiras {MAX_PREVIEW_ROWS} de {tableRows.length - 1} linhas — baixe o arquivo pra
                  ver todas.
                </p>
              )}
              {kind === "xlsx" && (
                <p className="text-xs text-muted mt-1.5">
                  Mostrando só a primeira planilha do arquivo — baixe pra ver as outras, se tiver mais de uma.
                </p>
              )}
            </div>
          )}
          {textContent !== null && (
            <pre className="whitespace-pre-wrap break-words text-xs text-ink/70 max-h-[60vh] overflow-y-auto">
              {textContent}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
