import type { ConteTable } from "./conteTable.ts";

export type ConteValidationIssue = { path: string; message: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fieldPath(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

/** Empty string is present; missing key is not. */
function requireString(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  issues: ConteValidationIssue[],
): void {
  const at = fieldPath(path, key);
  if (!Object.hasOwn(obj, key)) {
    issues.push({ path: at, message: `${key} is required` });
    return;
  }
  if (typeof obj[key] !== "string") {
    issues.push({ path: at, message: `${key} must be a string` });
  }
}

function requireArray(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  issues: ConteValidationIssue[],
): unknown[] | undefined {
  const at = fieldPath(path, key);
  if (!Object.hasOwn(obj, key)) {
    issues.push({ path: at, message: `${key} is required` });
    return undefined;
  }
  if (!Array.isArray(obj[key])) {
    issues.push({ path: at, message: `${key} must be an array` });
    return undefined;
  }
  return obj[key] as unknown[];
}

function checkStringArray(v: unknown, path: string, issues: ConteValidationIssue[]): void {
  if (!Array.isArray(v)) {
    issues.push({ path, message: "must be an array of strings" });
    return;
  }
  v.forEach((item, i) => {
    if (typeof item !== "string") {
      issues.push({ path: `${path}[${i}]`, message: "must be a string" });
    }
  });
}

function checkDialogue(d: unknown, path: string, issues: ConteValidationIssue[]): void {
  if (!isPlainObject(d)) {
    issues.push({ path, message: "dialogue must be an object" });
    return;
  }
  for (const key of Object.keys(d)) {
    if (!["speaker", "text"].includes(key)) {
      issues.push({ path, message: `unexpected property "${key}"` });
    }
  }
  requireString(d, "speaker", path, issues);
  requireString(d, "text", path, issues);
}

function checkCut(c: unknown, path: string, issues: ConteValidationIssue[]): void {
  if (!isPlainObject(c)) {
    issues.push({ path, message: "cut must be an object" });
    return;
  }
  const required = [
    "cut",
    "camera",
    "timing",
    "action",
    "sound",
    "position",
    "beat",
    "ext",
    "dialogues",
  ];
  for (const key of Object.keys(c)) {
    if (!required.includes(key)) {
      issues.push({ path, message: `unexpected property "${key}"` });
    }
  }
  requireString(c, "cut", path, issues);
  for (const field of ["camera", "timing", "action", "sound", "position", "beat", "ext"] as const) {
    if (!Object.hasOwn(c, field)) {
      issues.push({ path: `${path}.${field}`, message: `${field} is required` });
    } else {
      checkStringArray(c[field], `${path}.${field}`, issues);
    }
  }
  const dialogues = requireArray(c, "dialogues", path, issues);
  if (!dialogues) return;
  dialogues.forEach((d, i) => checkDialogue(d, `${path}.dialogues[${i}]`, issues));
}

/**
 * Lightweight shape check aligned with `schema/conte-table.schema.json`.
 * Keeps the reference package tiny (no schema library).
 * Empty values (`cut: ""` / `[]`) are valid; missing required keys are not.
 */
export function validateConteTable(data: unknown): ConteValidationIssue[] {
  const issues: ConteValidationIssue[] = [];
  if (!isPlainObject(data)) {
    return [{ path: "", message: "ConteTable must be an object" }];
  }
  for (const key of Object.keys(data)) {
    if (!["version", "title", "profile", "cuts"].includes(key)) {
      issues.push({ path: "", message: `unexpected property "${key}"` });
    }
  }
  if (!Object.hasOwn(data, "version")) {
    issues.push({ path: "version", message: "version is required" });
  } else if (data.version !== "conte-table/0.0") {
    issues.push({
      path: "version",
      message: `expected "conte-table/0.0", got ${String(data.version)}`,
    });
  }
  requireString(data, "title", "", issues);
  requireString(data, "profile", "", issues);
  const cuts = requireArray(data, "cuts", "", issues);
  if (cuts) {
    cuts.forEach((c, i) => checkCut(c, `cuts[${i}]`, issues));
  }
  return issues;
}

/** Throws if ConteTable does not match the schema shape. */
export function assertValidConteTable(data: unknown): asserts data is ConteTable {
  const issues = validateConteTable(data);
  if (issues.length > 0) {
    throw new Error(issues.map((i) => `${i.path || "(root)"}: ${i.message}`).join("\n"));
  }
}
