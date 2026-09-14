"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bot,
  Loader2,
  PenLine,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { InputField, InputFieldType, SkillDraftProposal } from "@/lib/types";

const FIELD_TYPES: InputFieldType[] = ["text", "textarea", "secret", "url", "number"];

export default function NewSkillForm() {
  const router = useRouter();
  const [postContent, setPostContent] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<SkillDraftProposal | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleParse() {
    if (!postContent.trim()) return;
    setParsing(true);
    setParseError(null);
    try {
      const res = await fetch("/api/skills/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postContent }),
      });
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
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...proposal, sourcePost: postContent }),
      });
      const skill = await res.json();
      router.push(`/skills/${skill.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function updateField<K extends keyof SkillDraftProposal>(key: K, value: SkillDraftProposal[K]) {
    setProposal((p) => (p ? { ...p, [key]: value } : p));
  }

  function updateInputField(index: number, patch: Partial<InputField>) {
    setProposal((p) => {
      if (!p) return p;
      const inputSchema = p.inputSchema.map((f, i) => (i === index ? { ...f, ...patch } : f));
      return { ...p, inputSchema };
    });
  }

  function removeInputField(index: number) {
    setProposal((p) => (p ? { ...p, inputSchema: p.inputSchema.filter((_, i) => i !== index) } : p));
  }

  function addInputField() {
    setProposal((p) =>
      p
        ? {
            ...p,
            needsInput: true,
            inputSchema: [
              ...p.inputSchema,
              { key: `campo_${p.inputSchema.length + 1}`, label: "Novo campo", type: "text", required: false },
            ],
          }
        : p
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-line bg-white p-5">
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
          placeholder="Cole aqui o que o chefe postou sobre a skill/MCP…"
          className="w-full rounded-md border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-shadow"
        />
        <button
          type="button"
          onClick={handleParse}
          disabled={parsing || !postContent.trim()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {parsing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {parsing ? "Lendo…" : "Transformar em rascunho de skill"}
        </button>
        {parseError && <p className="mt-2 text-sm text-red-600">{parseError}</p>}
      </div>

      {proposal && (
        <div className="rounded-xl border border-line bg-white p-5 space-y-5 animate-fade-in">
          <h2 className="font-semibold text-ink">Prévia — edite o que quiser antes de salvar</h2>

          {proposal.needsReview && (
            <p className="flex items-start gap-2 text-sm bg-amber-50 text-amber-800 rounded-md p-3">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              {proposal.reviewNote ?? "Revise este rascunho com cuidado antes de salvar."}
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-ink mb-1">Nome</label>
            <input
              value={proposal.name}
              onChange={(e) => updateField("name", e.target.value)}
              className="w-full rounded-md border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-shadow"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">Descrição</label>
            <textarea
              value={proposal.description}
              onChange={(e) => updateField("description", e.target.value)}
              rows={2}
              className="w-full rounded-md border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-shadow"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              Template do prompt
              <span className="text-muted font-normal"> — use {"{{campo}}"} para inputs por execução</span>
            </label>
            <textarea
              value={proposal.promptTemplate}
              onChange={(e) => updateField("promptTemplate", e.target.value)}
              rows={5}
              className="w-full rounded-md border border-line px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-shadow"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm rounded-md border border-line px-3 py-1.5 cursor-pointer hover:bg-canvas transition-colors">
              <input
                type="checkbox"
                checked={proposal.needsInput}
                onChange={(e) => updateField("needsInput", e.target.checked)}
                className="accent-primary"
              />
              <PenLine size={14} className="text-muted" />
              Precisa de input pra rodar
            </label>
            <label className="flex items-center gap-2 text-sm rounded-md border border-line px-3 py-1.5 cursor-pointer hover:bg-canvas transition-colors">
              <input
                type="checkbox"
                checked={proposal.usesCowork}
                onChange={(e) => updateField("usesCowork", e.target.checked)}
                className="accent-primary"
              />
              <Bot size={14} className="text-muted" />
              Roda via Claude Cowork
            </label>
          </div>

          {proposal.needsInput && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-ink">Campos de input</label>
                <button
                  type="button"
                  onClick={addInputField}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-hover font-medium transition-colors"
                >
                  <Plus size={13} />
                  adicionar campo
                </button>
              </div>
              <div className="space-y-2">
                {proposal.inputSchema.map((field, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-line p-2 bg-canvas/40 animate-fade-in"
                  >
                    <input
                      value={field.key}
                      onChange={(e) => updateInputField(i, { key: e.target.value })}
                      placeholder="key"
                      className="w-28 rounded border border-line bg-white px-2 py-1 text-xs font-mono"
                    />
                    <input
                      value={field.label}
                      onChange={(e) => updateInputField(i, { label: e.target.value })}
                      placeholder="label"
                      className="flex-1 min-w-[120px] rounded border border-line bg-white px-2 py-1 text-xs"
                    />
                    <select
                      value={field.type}
                      onChange={(e) => updateInputField(i, { type: e.target.value as InputFieldType })}
                      className="rounded border border-line bg-white px-2 py-1 text-xs"
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => updateInputField(i, { required: e.target.checked })}
                        className="accent-primary"
                      />
                      obrigatório
                    </label>
                    <button
                      type="button"
                      onClick={() => removeInputField(i)}
                      className="text-red-500 hover:text-red-700 ml-auto transition-colors"
                      title="Remover campo"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {proposal.inputSchema.length === 0 && (
                  <p className="text-xs text-muted">Nenhum campo ainda — adicione um, ou ela roda sem input.</p>
                )}
              </div>
            </div>
          )}

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
        </div>
      )}
    </div>
  );
}
