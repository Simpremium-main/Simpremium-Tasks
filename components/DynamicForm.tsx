"use client";

import type { InputField } from "@/lib/types";

export default function DynamicForm({
  schema,
  values,
  onChange,
}: {
  schema: InputField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  if (schema.length === 0) return null;

  return (
    <div className="space-y-4">
      {schema.map((field) => (
        <div key={field.key}>
          <label className="block text-sm font-medium text-ink mb-1" htmlFor={field.key}>
            {field.label}
            {field.required && <span className="text-accent"> *</span>}
          </label>
          {field.type === "textarea" ? (
            <textarea
              id={field.key}
              required={field.required}
              placeholder={field.placeholder}
              value={values[field.key] ?? ""}
              onChange={(e) => onChange(field.key, e.target.value)}
              rows={4}
              className="w-full rounded-md border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          ) : (
            <input
              id={field.key}
              required={field.required}
              placeholder={field.placeholder}
              type={field.type === "secret" ? "password" : field.type === "number" ? "number" : "text"}
              value={values[field.key] ?? ""}
              onChange={(e) => onChange(field.key, e.target.value)}
              className="w-full rounded-md border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          )}
          {field.helpText && <p className="mt-1 text-xs text-ink/50">{field.helpText}</p>}
        </div>
      ))}
    </div>
  );
}
