/**
 * Finds the first GitHub-flavored markdown table in a run's `result` text
 * and parses it into an array of row objects keyed by (trimmed) column
 * header — the exact shape any skill returning tabular data already
 * produces alongside its generated file (see README's "default tabular
 * results to a real file" note — the markdown table stays in the text
 * precisely so it's still parseable this way, even once the file exists
 * too). Returns null if no table is found; never throws on malformed input.
 */
export function parseMarkdownTable(text: string): Record<string, string>[] | null {
  const lines = text.split("\n");

  for (let i = 0; i < lines.length - 1; i++) {
    const headerLine = lines[i];
    const separatorLine = lines[i + 1];
    if (!headerLine.includes("|")) continue;
    if (!isSeparatorLine(separatorLine)) continue;

    const headers = splitRow(headerLine);
    if (headers.length === 0 || headers.every((h) => !h)) continue;

    const rows: Record<string, string>[] = [];
    for (let j = i + 2; j < lines.length; j++) {
      const line = lines[j];
      if (!line.includes("|") || !line.trim()) break;
      const cells = splitRow(line);
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header] = cells[idx] ?? "";
      });
      rows.push(row);
    }
    if (rows.length > 0) return rows;
  }

  return null;
}

function isSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("-")) return false;
  return /^\|?[\s:|-]+\|?$/.test(trimmed);
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}
