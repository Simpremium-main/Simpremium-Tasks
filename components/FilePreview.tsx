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

/** MIME types this component actually knows how to render — a skill's
 *  generated .xlsx/.docx/.pptx etc. has no in-browser preview here (no
 *  library for that in this app, and adding one just for a preview isn't
 *  worth the bundle weight yet), so the button simply doesn't render for
 *  those, same "don't fake it" rule as everywhere else — a download link
 *  is still right there either way. */
function isPreviewable(mimeType: string): boolean {
  return (
    mimeType === "application/pdf" ||
    mimeType === "text/csv" ||
    mimeType === "text/plain" ||
    mimeType === "application/json"
  );
}

/**
 * Toggle button that fetches an execution's real generated file (same
 * authenticated route the download link already uses) and renders it
 * inline — a PDF via the browser's own built-in viewer (an <iframe> on a
 * client-side Blob URL, so it renders instead of triggering a download the
 * way the route's Content-Disposition: attachment would if linked to
 * directly), a CSV as an actual table, plain text/JSON as preformatted
 * text. Fetched once per file and kept in memory for the rest of this
 * modal's lifetime — collapsing and reopening the preview doesn't
 * re-fetch.
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
  const [csvRows, setCsvRows] = useState<string[][] | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);

  // Blob URLs aren't garbage-collected on their own — revoke it once this
  // row is gone (the modal closes, or the execution list re-renders it
  // away) instead of leaking one per PDF ever previewed in the session.
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  if (!isPreviewable(mimeType)) return null;

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (pdfUrl || csvRows || textContent) return; // already loaded once

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/executions/${executionId}/files/${fileIndex}`);
      if (!res.ok) throw new Error(`Falha ao carregar o arquivo (HTTP ${res.status})`);
      const blob = await res.blob();

      if (mimeType === "application/pdf") {
        setPdfUrl(URL.createObjectURL(blob));
      } else if (mimeType === "text/csv") {
        setCsvRows(parseCsv(await blob.text()));
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
          {csvRows && csvRows.length > 0 && (
            <div className="overflow-auto max-h-[60vh]">
              <table className="min-w-full text-xs border-collapse">
                <thead>
                  <tr>
                    {csvRows[0].map((cell, i) => (
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
                  {csvRows.slice(1, MAX_PREVIEW_ROWS + 1).map((row, i) => (
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
              {csvRows.length - 1 > MAX_PREVIEW_ROWS && (
                <p className="text-xs text-muted mt-1.5">
                  Mostrando as primeiras {MAX_PREVIEW_ROWS} de {csvRows.length - 1} linhas — baixe o arquivo pra
                  ver todas.
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
