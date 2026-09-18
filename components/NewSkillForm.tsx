"use client";

import { useRef, useState } from "react";
import { AlertTriangle, FileText, Film, Image as ImageIcon, Loader2, Paperclip, Save, Sparkles, X } from "lucide-react";
import SkillFieldsEditor from "./SkillFieldsEditor";
import type { SkillDraftProposal } from "@/lib/types";

// Soft, client-side guidance rather than a hard block — Vercel's own
// request-body cap (a few MB by default) binds before this app's code
// ever sees the request, so this is just an early, friendlier warning
// instead of a generic 413 after waiting for the upload.
const ATTACHMENT_WARN_TOTAL_BYTES = 4 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function attachmentIcon(file: File) {
  if (file.type.startsWith("image/")) return <ImageIcon size={13} className="text-primary shrink-0" />;
  if (file.type.startsWith("video/") || file.type.startsWith("audio/")) {
    return <Film size={13} className="text-primary shrink-0" />;
  }
  return <FileText size={13} className="text-primary shrink-0" />;
}

export default function NewSkillForm() {
  const [postContent, setPostContent] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<SkillDraftProposal | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const totalAttachmentBytes = attachments.reduce((sum, f) => sum + f.size, 0);

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setAttachments((prev) => [...prev, ...Array.from(files)]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleParse() {
    if (!postContent.trim() && attachments.length === 0) return;
    setParsing(true);
    setParseError(null);
    try {
      let res: Response;
      if (attachments.length > 0) {
        const form = new FormData();
        form.set("postContent", postContent);
        for (const file of attachments) form.append("attachments", file);
        res = await fetch("/api/skills/parse", { method: "POST", body: form });
      } else {
        res = await fetch("/api/skills/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postContent }),
        });
      }
      if (!res.ok) throw new Error((await res.json()).error ?? "Falha ao interpretar o post");
      setProposal(await res.json());
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Falha ao interpretar o post");
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    if (!proposal) return;
    setSaving(true);
    setSaveError(null);
    try {
      // The uploaded files themselves aren't kept (only what got extracted
      // from them at parse time — same "no raw media stored" scope as
      // video-link transcription) — this just leaves a note in the saved
      // source text that attachments existed and what they were named.
      const sourcePost =
        attachments.length > 0
          ? `${postContent}\n\n[+ ${attachments.length} anexo${attachments.length === 1 ? "" : "s"}: ${attachments
              .map((f) => f.name)
              .join(", ")}]`
          : postContent;
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...proposal, sourcePost }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Falha ao salvar (HTTP ${res.status})`);
      }
      const skill = await res.json();
      // Hard navigation, not router.push()+router.refresh() — see the same
      // note in DeleteSkillButton.tsx. The sidebar lives in the shared
      // (app) layout, which client-side navigation to a sibling page
      // doesn't re-fetch on its own, and refresh() called right after
      // push() in the same tick can race the navigation and miss it —
      // that's why a newly created skill showed up on its own page but not
      // in the sidebar's list. A full navigation always re-fetches
      // everything, layout included.
      window.location.href = `/skills/${skill.id}`;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Falha ao salvar a skill");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-line bg-surface p-5">
        <label className="block text-sm font-semibold text-ink mb-2" htmlFor="postContent">
          Cole o conteúdo do post
        </label>
        <p className="text-xs text-muted mb-2.5">
          Texto, a transcrição de um print, ou o contexto de um link.
        </p>
        <textarea
          id="postContent"
          value={postContent}
          onChange={(e) => setPostContent(e.target.value)}
          rows={8}
          placeholder="Cole aqui o conteúdo do post sobre a skill/MCP…"
          className="w-full rounded-md border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-shadow"
        />

        <div className="mt-3">
          <label
            htmlFor="attachments"
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-line px-3 py-2 text-sm text-muted hover:border-primary/40 hover:text-primary cursor-pointer transition-colors"
          >
            <Paperclip size={14} />
            Anexar imagem, vídeo ou arquivo…
          </label>
          <input
            id="attachments"
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,audio/*,.pdf,.txt,.csv,.json,.md"
            onChange={(e) => addFiles(e.target.files)}
            className="sr-only"
          />
          <p className="mt-1 text-xs text-muted">
            Prints, vídeos/áudios (transcritos automaticamente) e PDFs/arquivos de texto — o Claude
            olha pra eles junto com o texto colado. Anexos grandes podem falhar por limite da
            hospedagem — prefira arquivos pequenos (um print, um clipe curto).
          </p>

          {attachments.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {attachments.map((file, i) => (
                <li
                  key={`${file.name}-${i}`}
                  className="flex items-center gap-2 rounded-md border border-line bg-canvas/40 px-2.5 py-1.5 text-xs animate-fade-in"
                >
                  {attachmentIcon(file)}
                  <span className="truncate flex-1 text-ink/80">{file.name}</span>
                  <span className="text-muted shrink-0">{formatBytes(file.size)}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="text-muted hover:text-red-600 shrink-0 transition-colors"
                    title="Remover anexo"
                  >
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {totalAttachmentBytes > ATTACHMENT_WARN_TOTAL_BYTES && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-amber-600">
              <AlertTriangle size={11} />
              {formatBytes(totalAttachmentBytes)} de anexos — pode ser grande demais pra hospedagem
              aceitar de uma vez. Se falhar, tente com menos/menores.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleParse}
          disabled={parsing || (!postContent.trim() && attachments.length === 0)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {parsing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {parsing ? "Lendo…" : "Transformar em rascunho de skill"}
        </button>
        {parseError && <p className="mt-2 text-sm text-red-600">{parseError}</p>}
      </div>

      {proposal && (
        <div className="rounded-xl border border-line bg-surface p-5 space-y-5 animate-fade-in">
          <h2 className="font-semibold text-ink">Prévia — edite o que quiser antes de salvar</h2>

          {proposal.needsReview && (
            <p className="flex items-start gap-2 text-sm bg-amber-50 text-amber-800 rounded-md p-3">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              {proposal.reviewNote ?? "Revise este rascunho com cuidado antes de salvar."}
            </p>
          )}

          <SkillFieldsEditor
            value={proposal}
            onChange={(patch) => setProposal((p) => (p ? { ...p, ...patch } : p))}
          />

          <div>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !proposal.name.trim() || !proposal.promptTemplate.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {saving ? "Salvando…" : "Salvar como rascunho"}
              </button>
              <p className="text-xs text-muted">
                Fica ativa sozinha depois da primeira execução bem-sucedida.
              </p>
            </div>
            {saveError && (
              <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3 mt-3">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                <span>
                  <strong className="font-semibold">Não salvou.</strong> {saveError}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
