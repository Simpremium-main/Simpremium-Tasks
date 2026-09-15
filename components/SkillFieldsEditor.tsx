"use client";

import { useState } from "react";
import { Bot, Folder, PenLine, Plus, Tag, Trash2, X } from "lucide-react";
import type { EditableSkillFields, InputField, InputFieldType } from "@/lib/types";

const FIELD_TYPES: InputFieldType[] = ["text", "textarea", "secret", "url", "number"];

/**
 * The editable-fields form shared by NewSkillForm (reviewing a freshly
 * parsed draft) and EditSkillForm (editing a skill that already exists) —
 * name/description/group/tags/prompt/flags/input-schema, nothing about how
 * the value got there or what happens on save (that's each caller's job).
 */
export default function SkillFieldsEditor({
  value,
  onChange,
}: {
  value: EditableSkillFields;
  onChange: (patch: Partial<EditableSkillFields>) => void;
}) {
  const [tagDraft, setTagDraft] = useState("");

  function updateInputField(index: number, patch: Partial<InputField>) {
    onChange({ inputSchema: value.inputSchema.map((f, i) => (i === index ? { ...f, ...patch } : f)) });
  }

  function removeInputField(index: number) {
    onChange({ inputSchema: value.inputSchema.filter((_, i) => i !== index) });
  }

  function addInputField() {
    onChange({
      needsInput: true,
      inputSchema: [
        ...value.inputSchema,
        { key: `campo_${value.inputSchema.length + 1}`, label: "Novo campo", type: "text", required: false },
      ],
    });
  }

  function addTag() {
    const tag = tagDraft.trim().toLowerCase();
    if (tag && !value.tags.includes(tag)) onChange({ tags: [...value.tags, tag] });
    setTagDraft("");
  }

  function removeTag(tag: string) {
    onChange({ tags: value.tags.filter((t) => t !== tag) });
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-ink mb-1">Nome</label>
        <input
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="w-full rounded-md border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-shadow"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-ink mb-1">Descrição</label>
        <textarea
          value={value.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={2}
          className="w-full rounded-md border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-shadow"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="flex items-center gap-1.5 text-sm font-medium text-ink mb-1">
            <Folder size={13} className="text-muted" />
            Grupo
          </label>
          <input
            value={value.group ?? ""}
            onChange={(e) => onChange({ group: e.target.value || null })}
            placeholder="ex: Relatórios, Pesquisa, Atendimento"
            className="w-full rounded-md border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-shadow"
          />
        </div>
        <div>
          <label className="flex items-center gap-1.5 text-sm font-medium text-ink mb-1">
            <Tag size={13} className="text-muted" />
            Tags
          </label>
          <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-line px-2 py-1.5 focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/50 transition-shadow">
            {value.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-primary-soft text-primary text-xs px-2 py-0.5"
              >
                {tag}
                <button type="button" onClick={() => removeTag(tag)} className="hover:text-primary-hover">
                  <X size={11} />
                </button>
              </span>
            ))}
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag();
                }
              }}
              onBlur={addTag}
              placeholder={value.tags.length ? "" : "Digite e pressione Enter"}
              className="flex-1 min-w-[90px] text-sm focus:outline-none py-0.5"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-ink mb-1">
          Template do prompt
          <span className="text-muted font-normal"> — use {"{{campo}}"} para inputs por execução</span>
        </label>
        <textarea
          value={value.promptTemplate}
          onChange={(e) => onChange({ promptTemplate: e.target.value })}
          rows={5}
          className="w-full rounded-md border border-line px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-shadow"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm rounded-md border border-line px-3 py-1.5 cursor-pointer hover:bg-canvas transition-colors">
          <input
            type="checkbox"
            checked={value.needsInput}
            onChange={(e) => onChange({ needsInput: e.target.checked })}
            className="accent-primary"
          />
          <PenLine size={14} className="text-muted" />
          Precisa de input pra rodar
        </label>
        <label className="flex items-center gap-2 text-sm rounded-md border border-line px-3 py-1.5 cursor-pointer hover:bg-canvas transition-colors">
          <input
            type="checkbox"
            checked={value.usesCowork}
            onChange={(e) => onChange({ usesCowork: e.target.checked })}
            className="accent-primary"
          />
          <Bot size={14} className="text-muted" />
          Roda via Claude Cowork
        </label>
      </div>

      {value.needsInput && (
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
            {value.inputSchema.map((field, i) => (
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
            {value.inputSchema.length === 0 && (
              <p className="text-xs text-muted">Nenhum campo ainda — adicione um, ou ela roda sem input.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
