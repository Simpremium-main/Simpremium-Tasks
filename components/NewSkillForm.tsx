"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Save, Sparkles } from "lucide-react";
import SkillFieldsEditor from "./SkillFieldsEditor";
import type { SkillDraftProposal } from "@/lib/types";

export default function NewSkillForm() {
  const [postContent, setPostContent] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<SkillDraftProposal | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    setSaveError(null);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...proposal, sourcePost: postContent }),
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
          placeholder="Cole aqui o conteúdo do post sobre a skill/MCP…"
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
