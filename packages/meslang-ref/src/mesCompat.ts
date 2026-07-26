/**
 * Optional Mes → MesLang import helpers (ADR 0006).
 * Not part of core doFlat / parseMesLang.
 */

/** Row-start ○ / ◯ (old Mes hashira) → # stage direction. */
const HASHIRA_RE = /^[○◯]/u;

/**
 * Apply the v0-recommended mechanical compat rewrite.
 * Does NOT promote `#第一章`-style lines to `==` sections.
 */
export function rewriteMesCompat(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => {
      if (HASHIRA_RE.test(line)) return `#${line.slice(1)}`;
      return line;
    })
    .join("\n");
}
