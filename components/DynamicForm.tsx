"use client";

import { useState } from "react";
import { AlertTriangle, FileText, KeyRound, Upload } from "lucide-react";
import type { InputField } from "@/lib/types";

// Cap the decoded text so one uploaded file can't blow up the prompt (and
// the cost that comes with it) — plenty for a CSV/JSON/notes file, which is
// what this is actually for; anything longer gets truncated with a visible
// marker rather than silently cut.
const FILE_TEXT_CHAR_LIMIT = 20_000;

async function readFileAsText(file: File): Promise<{ text: string; truncated: boolean }> {
  const raw = await file.text();
  if (raw.length <= FILE_TEXT_CHAR_LIMIT) return { text: raw, truncated: false };
  return { text: raw.slice(0, FILE_TEXT_CHAR_LIMIT) + "\n\n[conteúdo truncado]", truncated: true };
}

export default function DynamicForm({
  schema,
  values,
  onChange,
}: {
  schema: InputField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const [fileMeta, setFileMeta] = useState<Record<string, { name: string; truncated: boolean }>>({});
  const [fileError, setFileError] = useState<Record<string, string>>({});

  if (schema.length === 0) return null;

  async function handleFilePick(field: InputField, file: File | undefined) {
    if (!file) return;
    setFileError((prev) => ({ ...prev, [field.key]: "" }));
    try {
      const { text, truncated } = await readFileAsText(file);
      onChange(field.key, text);
      setFileMeta((prev) => ({ ...prev, [field.key]: { name: file.name, truncated } }));
    } catch {
      setFileError((prev) => ({
        ...prev,
        [field.key]: "Não deu pra ler esse arquivo como texto — use .txt, .csv, .json ou .md.",
      }));
    }
  }

  return (
    <div className="space-y-4">
      {schema.map((field) => (
        <div key={field.key}>
          <label className="flex items-center gap-1.5 text-sm font-medium text-ink mb-1" htmlFor={field.key}>
            {field.type === "secret" && <KeyRound size={12} className="text-muted" />}
            {field.label}
            {field.required && <span className="text-primary">*</span>}
          </label>
          {field.type === "textarea" ? (
            <textarea
              id={field.key}
              required={field.required}
              placeholder={field.placeholder}
              value={values[field.key] ?? ""}
              onChange={(e) => onChange(field.key, e.target.value)}
              rows={4}
              className="w-full rounded-md border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-shadow"
            />
          ) : field.type === "file" ? (
            <div>
              <label
                htmlFor={field.key}
                className="flex items-center gap-2 rounded-md border border-dashed border-line px-3 py-2.5 text-sm text-muted hover:border-primary/40 hover:text-primary cursor-pointer transition-colors"
              >
                <Upload size={14} />
                {fileMeta[field.key] ? (
                  <span className="inline-flex items-center gap-1 text-ink">
                    <FileText size={13} className="text-primary" />
                    {fileMeta[field.key].name}
                  </span>
                ) : (
                  "Escolher arquivo…"
                )}
              </label>
              <input
                id={field.key}
                type="file"
                required={field.required && !values[field.key]}
                accept=".txt,.csv,.json,.md,.log,text/plain,text/csv,application/json"
                onChange={(e) => handleFilePick(field, e.target.files?.[0])}
                className="sr-only"
              />
              {fileMeta[field.key]?.truncated && (
                <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                  <AlertTriangle size={11} />
                  Arquivo grande — só os primeiros {FILE_TEXT_CHAR_LIMIT.toLocaleString("pt-BR")} caracteres
                  vão pro prompt.
                </p>
              )}
              {fileError[field.key] && (
                <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                  <AlertTriangle size={11} />
                  {fileError[field.key]}
                </p>
              )}
              <p className="mt-1 text-xs text-muted">
                Só arquivos de texto (.txt, .csv, .json, .md) — o conteúdo vira parte do prompt, PDF e
                imagem ainda não são suportados.
              </p>
            </div>
          ) : (
            <input
              id={field.key}
              required={field.required}
              placeholder={field.placeholder}
              type={field.type === "secret" ? "password" : field.type === "number" ? "number" : "text"}
              value={values[field.key] ?? ""}
              onChange={(e) => onChange(field.key, e.target.value)}
              className="w-full rounded-md border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-shadow"
            />
          )}
          {field.helpText && <p className="mt-1 text-xs text-muted">{field.helpText}</p>}
        </div>
      ))}
    </div>
  );
}
