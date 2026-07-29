import type { Medo } from "./types.ts";

const DECORATOR_KINDS = new Set([
  "character",
  "comment",
  "sound",
  "position",
  "timing",
  "ext",
  "frame",
  "camera",
  "beat",
  "unknown",
]);

const PROFILES = new Set(["audio", "manga", "anime", "vn", "unknown"]);

export type MedoValidationIssue = { path: string; message: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function checkDecorator(d: unknown, path: string, issues: MedoValidationIssue[]): void {
  if (!isPlainObject(d)) {
    issues.push({ path, message: "decorator must be an object" });
    return;
  }
  for (const key of Object.keys(d)) {
    if (!["kind", "rawMark", "value", "attrs"].includes(key)) {
      issues.push({ path, message: `unexpected property "${key}"` });
    }
  }
  if (typeof d.kind !== "string" || !DECORATOR_KINDS.has(d.kind)) {
    issues.push({ path: `${path}.kind`, message: `invalid kind: ${String(d.kind)}` });
  }
  if (typeof d.rawMark !== "string") {
    issues.push({ path: `${path}.rawMark`, message: "rawMark must be a string" });
  }
  if (typeof d.value !== "string") {
    issues.push({ path: `${path}.value`, message: "value must be a string" });
  }
  if (!isPlainObject(d.attrs)) {
    issues.push({ path: `${path}.attrs`, message: "attrs must be an object" });
  } else {
    for (const [k, v] of Object.entries(d.attrs)) {
      if (typeof v !== "string") {
        issues.push({ path: `${path}.attrs.${k}`, message: "attr values must be strings" });
      }
    }
  }
}

function checkPiece(p: unknown, path: string, issues: MedoValidationIssue[]): void {
  if (!isPlainObject(p)) {
    issues.push({ path, message: "piece must be an object" });
    return;
  }
  for (const key of Object.keys(p)) {
    if (!["dialogue", "decorators"].includes(key)) {
      issues.push({ path, message: `unexpected property "${key}"` });
    }
  }
  if (typeof p.dialogue !== "string") {
    issues.push({ path: `${path}.dialogue`, message: "dialogue must be a string" });
  }
  if (!Array.isArray(p.decorators)) {
    issues.push({ path: `${path}.decorators`, message: "decorators must be an array" });
    return;
  }
  p.decorators.forEach((d, i) => checkDecorator(d, `${path}.decorators[${i}]`, issues));
}

function checkSection(s: unknown, path: string, issues: MedoValidationIssue[]): void {
  if (!isPlainObject(s)) {
    issues.push({ path, message: "section must be an object" });
    return;
  }
  for (const key of Object.keys(s)) {
    if (!["title", "pieces"].includes(key)) {
      issues.push({ path, message: `unexpected property "${key}"` });
    }
  }
  if (typeof s.title !== "string") {
    issues.push({ path: `${path}.title`, message: "title must be a string" });
  }
  if (!Array.isArray(s.pieces)) {
    issues.push({ path: `${path}.pieces`, message: "pieces must be an array" });
    return;
  }
  s.pieces.forEach((p, i) => checkPiece(p, `${path}.pieces[${i}]`, issues));
}

/**
 * Lightweight shape check aligned with `schema/medo.schema.json`.
 * Avoids pulling in a schema library; keeps the reference package tiny.
 */
export function validateMedo(data: unknown): MedoValidationIssue[] {
  const issues: MedoValidationIssue[] = [];
  if (!isPlainObject(data)) {
    return [{ path: "", message: "Medo must be an object" }];
  }
  for (const key of Object.keys(data)) {
    if (!["version", "header", "body"].includes(key)) {
      issues.push({ path: "", message: `unexpected property "${key}"` });
    }
  }
  if (data.version !== "medo/0.0") {
    issues.push({ path: "version", message: `expected "medo/0.0", got ${String(data.version)}` });
  }
  if (!isPlainObject(data.header)) {
    issues.push({ path: "header", message: "header must be an object" });
  } else {
    for (const [k, v] of Object.entries(data.header)) {
      if (typeof v !== "string") {
        issues.push({ path: `header.${k}`, message: "header values must be strings" });
      }
    }
    if (typeof data.header.profile === "string" && !PROFILES.has(data.header.profile)) {
      issues.push({
        path: "header.profile",
        message: `profile must be one of ${[...PROFILES].join(", ")}`,
      });
    }
  }
  if (!isPlainObject(data.body)) {
    issues.push({ path: "body", message: "body must be an object" });
  } else {
    for (const key of Object.keys(data.body)) {
      if (key !== "sections") {
        issues.push({ path: "body", message: `unexpected property "${key}"` });
      }
    }
    if (!Array.isArray(data.body.sections)) {
      issues.push({ path: "body.sections", message: "sections must be an array" });
    } else {
      data.body.sections.forEach((s, i) => checkSection(s, `body.sections[${i}]`, issues));
    }
  }
  return issues;
}

/** Throws if Medo does not match the schema shape. */
export function assertValidMedo(data: unknown): asserts data is Medo {
  const issues = validateMedo(data);
  if (issues.length > 0) {
    throw new Error(issues.map((i) => `${i.path || "(root)"}: ${i.message}`).join("\n"));
  }
}
