"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bot,
  Check,
  Copy,
  Download,
  Eye,
  FileText,
  Hand,
  Paperclip,
  Sparkles,
  User,
  X,
} from "lucide-react";
import StatusBadge from "./StatusBadge";
import { downloadPdf, downloadText } from "@/lib/exportResult";

export interface ExecutionFileItem {
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ExecutionItem {
  id: string;
  status: string;
  source: string;
  inputValues: Record<string, string> | null;
  promptSnapshot: string;
  result: string | null;
  error: string | null;
  files: ExecutionFileItem[] | null;
  ranBy: string | null;
  startedAt: string;
  finishedAt: string | null;
  skill?: { id: string; name: string };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  cowork: <Bot size={13} />,
  claude: <Sparkles size={13} />,
  manual: <Hand size={13} />,
};

const SOURCE_LABELS: Record<string, string> = {
  cowork: "Cowork",
  claude: "Claude",
  manual: "Manual",
};

export default function ExecutionList({
  executions,
  showSkillName = false,
  highlightId,
}: {
  executions: ExecutionItem[];
  showSkillName?: boolean;
  highlightId?: string | null;
}) {
  const [detailsFor, setDetailsFor] = useState<ExecutionItem | null>(null);

  if (executions.length === 0) {
    return (
      <p className="text-sm text-muted border border-dashed border-line rounded-lg p-6 text-center">
        Nenhuma execução ainda.
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-2 animate-stagger">
        {executions.map((execution) => (
          <ExecutionRow
            key={execution.id}
            execution={execution}
            showSkillName={showSkillName}
            highlighted={execution.id === highlightId}
            onViewDetails={() => setDetailsFor(execution)}
          />
        ))}
      </ul>
      {detailsFor && (
        <ExecutionDetailsModal execution={detailsFor} onClose={() => setDetailsFor(null)} />
      )}
    </>
  );
}

function ExecutionRow({
  execution,
  showSkillName,
  highlighted,
  onViewDetails,
}: {
  execution: ExecutionItem;
  showSkillName: boolean;
  highlighted?: boolean;
  onViewDetails: () => void;
}) {
  return (
    <li
      className={`rounded-lg border bg-white transition-shadow hover:shadow-sm ${
        highlighted ? "border-primary/40 animate-highlight" : "border-line"
      }`}
    >
      <button
        type="button"
        onClick={onViewDetails}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <StatusBadge status={execution.status} />
        <span className="inline-flex items-center gap-1 text-xs text-muted">
          {SOURCE_ICONS[execution.source]}
          {SOURCE_LABELS[execution.source] ?? execution.source}
        </span>
        {execution.ranBy && (
          <span className="hidden sm:inline-flex items-center gap-1 text-xs text-muted">
            <User size={11} />
            {execution.ranBy}
          </span>
        )}
        {execution.files && execution.files.length > 0 && (
          <span
            className="inline-flex items-center gap-1 text-xs text-primary"
            title={`${execution.files.length} arquivo(s) gerado(s)`}
          >
            <Paperclip size={11} />
            {execution.files.length}
          </span>
        )}
        {showSkillName && execution.skill && (
          <Link
            href={`/skills/${execution.skill.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-sm font-medium hover:text-primary transition-colors"
          >
            {execution.skill.name}
          </Link>
        )}
        <span className="ml-auto text-xs text-muted hidden sm:inline">
          {new Date(execution.startedAt).toLocaleString("pt-BR")}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary shrink-0">
          <Eye size={13} />
          <span className="hidden sm:inline">Ver detalhes</span>
        </span>
      </button>
    </li>
  );
}

function ExecutionDetailsModal({
  execution,
  onClose,
}: {
  execution: ExecutionItem;
  onClose: () => void;
}) {
  const fileBase = `execucao-${execution.id.slice(0, 8)}`;

  return (
    <div
      className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] flex items-center justify-center p-4 z-50 animate-backdrop-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-line max-w-2xl w-full max-h-[85vh] overflow-y-auto p-5 shadow-xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={execution.status} />
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              {SOURCE_ICONS[execution.source]}
              {SOURCE_LABELS[execution.source] ?? execution.source}
            </span>
            {execution.ranBy && (
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <User size={11} />
                {execution.ranBy}
              </span>
            )}
            {execution.skill && (
              <Link
                href={`/skills/${execution.skill.id}`}
                className="text-xs font-medium text-primary hover:text-primary-hover"
              >
                {execution.skill.name}
              </Link>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-muted hover:text-ink rounded-md p-1 hover:bg-canvas transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="text-xs text-muted mb-4">
          Iniciada em {new Date(execution.startedAt).toLocaleString("pt-BR")}
          {execution.finishedAt &&
            ` · finalizada em ${new Date(execution.finishedAt).toLocaleString("pt-BR")}`}
        </div>

        <DetailBlock label="Prompt enviado" text={execution.promptSnapshot} tone="canvas" />

        {execution.files && execution.files.length > 0 && (
          <div className="mb-4">
            <div className="text-xs uppercase tracking-wide text-muted mb-1.5">
              Arquivo{execution.files.length > 1 ? "s" : ""} gerado{execution.files.length > 1 ? "s" : ""}
            </div>
            <div className="space-y-1.5">
              {execution.files.map((file, i) => (
                <a
                  key={i}
                  href={`/api/executions/${execution.id}/files/${i}`}
                  className="flex items-center gap-2 rounded-md border border-line bg-primary-soft/40 px-3 py-2 text-sm hover:border-primary/40 hover:bg-primary-soft transition-colors"
                >
                  <Paperclip size={14} className="text-primary shrink-0" />
                  <span className="flex-1 truncate">{file.name}</span>
                  <span className="text-xs text-muted shrink-0">{formatBytes(file.sizeBytes)}</span>
                  <Download size={13} className="text-primary shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}

        {execution.result && (
          <DetailBlock
            label="Resultado"
            text={execution.result}
            tone="emerald"
            // Only offer the .txt/.pdf export-of-text convenience when there's
            // no real generated file — showing it next to an actual PDF/CSV
            // would look like a second, fake copy of the same thing.
            downloadBase={execution.files?.length ? undefined : fileBase}
            downloadTitle={execution.skill?.name ?? "Resultado da execução"}
          />
        )}

        {execution.error && <DetailBlock label="Erro" text={execution.error} tone="red" />}
      </div>
    </div>
  );
}

function DetailBlock({
  label,
  text,
  tone,
  downloadBase,
  downloadTitle,
}: {
  label: string;
  text: string;
  tone: "canvas" | "emerald" | "red";
  downloadBase?: string;
  downloadTitle?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — silently ignore, copy button just won't confirm
    }
  }

  const bg = tone === "canvas" ? "bg-canvas" : tone === "emerald" ? "bg-emerald-50" : "bg-red-50";
  const textColor = tone === "red" ? "text-red-800" : "text-ink/80";

  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copiado" : "Copiar"}
          </button>
          {downloadBase && (
            <>
              <button
                type="button"
                onClick={() => downloadText(`${downloadBase}.txt`, text)}
                className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors"
                title="Baixar como .txt"
              >
                <Download size={12} />
                .txt
              </button>
              <button
                type="button"
                onClick={() => downloadPdf(`${downloadBase}.pdf`, downloadTitle ?? "Resultado", text)}
                className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors"
                title="Baixar como PDF"
              >
                <FileText size={12} />
                PDF
              </button>
            </>
          )}
        </div>
      </div>
      <pre className={`whitespace-pre-wrap break-words rounded-md p-3 text-xs max-h-64 overflow-y-auto ${bg} ${textColor}`}>
        {text}
      </pre>
    </div>
  );
}
