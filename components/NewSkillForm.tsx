"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to parse post");
      setProposal(await res.json());
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to parse post");
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
              { key: `field_${p.inputSchema.length + 1}`, label: "New field", type: "text", required: false },
            ],
          }
        : p
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-line bg-white p-4">
        <label className="block text-sm font-medium mb-2" htmlFor="postContent">
          Paste the post content (text, transcript of a screenshot, or the link's context)
        </label>
        <textarea
          id="postContent"
          value={postContent}
          onChange={(e) => setPostContent(e.target.value)}
          rows={8}
          placeholder="Paste what your boss posted about the skill/MCP here…"
          className="w-full rounded-md border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <button
          type="button"
          onClick={handleParse}
          disabled={parsing || !postContent.trim()}
          className="mt-3 rounded-md bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90 disabled:opacity-60 transition-colors"
        >
          {parsing ? "Reading…" : "Turn into a skill draft"}
        </button>
        {parseError && <p className="mt-2 text-sm text-red-600">{parseError}</p>}
      </div>

      {proposal && (
        <div className="rounded-lg border border-line bg-white p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Preview — edit anything before saving</h2>
          </div>

          {proposal.needsReview && (
            <p className="text-sm bg-amber-50 text-amber-800 rounded-md p-3">
              {proposal.reviewNote ?? "Please review this draft carefully before saving."}
            </p>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              value={proposal.name}
              onChange={(e) => updateField("name", e.target.value)}
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={proposal.description}
              onChange={(e) => updateField("description", e.target.value)}
              rows={2}
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Prompt template
              <span className="text-ink/40 font-normal"> — use {"{{fieldKey}}"} for per-run inputs</span>
            </label>
            <textarea
              value={proposal.promptTemplate}
              onChange={(e) => updateField("promptTemplate", e.target.value)}
              rows={5}
              className="w-full rounded-md border border-line px-3 py-2 text-sm font-mono"
            />
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={proposal.needsInput}
                onChange={(e) => updateField("needsInput", e.target.checked)}
              />
              Needs input to run
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={proposal.usesCowork}
                onChange={(e) => updateField("usesCowork", e.target.checked)}
              />
              Runs through Claude Cowork
            </label>
          </div>

          {proposal.needsInput && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium">Input fields</label>
                <button
                  type="button"
                  onClick={addInputField}
                  className="text-xs text-accent hover:underline"
                >
                  + add field
                </button>
              </div>
              <div className="space-y-2">
                {proposal.inputSchema.map((field, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-line p-2">
                    <input
                      value={field.key}
                      onChange={(e) => updateInputField(i, { key: e.target.value })}
                      placeholder="key"
                      className="w-28 rounded border border-line px-2 py-1 text-xs font-mono"
                    />
                    <input
                      value={field.label}
                      onChange={(e) => updateInputField(i, { label: e.target.value })}
                      placeholder="label"
                      className="flex-1 min-w-[120px] rounded border border-line px-2 py-1 text-xs"
                    />
                    <select
                      value={field.type}
                      onChange={(e) => updateInputField(i, { type: e.target.value as InputFieldType })}
                      className="rounded border border-line px-2 py-1 text-xs"
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => updateInputField(i, { required: e.target.checked })}
                      />
                      required
                    </label>
                    <button
                      type="button"
                      onClick={() => removeInputField(i)}
                      className="text-xs text-red-600 hover:underline ml-auto"
                    >
                      remove
                    </button>
                  </div>
                ))}
                {proposal.inputSchema.length === 0 && (
                  <p className="text-xs text-ink/50">No fields yet — add one, or it'll run with no input.</p>
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !proposal.name.trim() || !proposal.promptTemplate.trim()}
            className="rounded-md bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90 disabled:opacity-60 transition-colors"
          >
            {saving ? "Saving…" : "Save as draft"}
          </button>
          <p className="text-xs text-ink/50">
            Saved as a draft — it becomes active automatically after its first successful run.
          </p>
        </div>
      )}
    </div>
  );
}
