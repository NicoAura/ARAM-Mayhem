import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Data files live at the repo root (data/, simulator/, dashboard/), one level above web/.
const REPO_ROOT = join(process.cwd(), "..");

export function repoPath(rel: string) {
  return join(REPO_ROOT, rel);
}

export function repoHas(rel: string) {
  return existsSync(repoPath(rel));
}

export function readRepoJson<T>(rel: string): T | null {
  return repoHas(rel) ? (JSON.parse(readFileSync(repoPath(rel), "utf8")) as T) : null;
}

export type CsvRow = Record<string, string>;

export function readRepoCsv(rel: string): CsvRow[] | null {
  return repoHas(rel) ? parseCsv(readFileSync(repoPath(rel), "utf8")) : null;
}

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}
