import type { ConteTable } from "./conteTable.ts";

export type ConteValidationIssue = { path: string; message: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
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
  if (typeof d.speaker !== "string") {
    issues.push({ path: `${path}.speaker`, message: "speaker must be a string" });
  }
  if (typeof d.text !== "string") {
    issues.push({ path: `${path}.text`, message: "text must be a string" });
  }
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
  if (typeof c.cut !== "string") {
    issues.push({ path: `${path}.cut`, message: "cut must be a string" });
  }
  for (const field of ["camera", "timing", "action", "sound", "position", "beat", "ext"] as const) {
    checkStringArray(c[field], `${path}.${field}`, issues);
  }
  if (!Array.isArray(c.dialogues)) {
    issues.push({ path: `${path}.dialogues`, message: "dialogues must be an array" });
    return;
  }
  c.dialogues.forEach((d, i) => checkDialogue(d, `${path}.dialogues[${i}]`, issues));
}

/**
 * Lightweight shape check aligned with `schema/conte-table.schema.json`.
 * Keeps the reference package tiny (no schema library).
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
  if (data.version !== "conte-table/0.0") {
    issues.push({
      path: "version",
      message: `expected "conte-table/0.0", got ${String(data.version)}`,
    });
  }
  if (typeof data.title !== "string") {
    issues.push({ path: "title", message: "title must be a string" });
  }
  if (typeof data.profile !== "string") {
    issues.push({ path: "profile", message: "profile must be a string" });
  }
  if (!Array.isArray(data.cuts)) {
    issues.push({ path: "cuts", message: "cuts must be an array" });
  } else {
    data.cuts.forEach((c, i) => checkCut(c, `cuts[${i}]`, issues));
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
