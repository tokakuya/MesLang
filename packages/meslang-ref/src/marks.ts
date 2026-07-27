import type { DecoratorKind } from "./types.ts";

/** Half-width and full-width marks map to the same kind. */
export const MARK_TO_KIND: Record<string, DecoratorKind> = {
  "@": "character",
  "＠": "character",
  "#": "comment",
  "＃": "comment",
  $: "sound",
  "＄": "sound",
  "!": "position",
  "！": "position",
  "&": "timing",
  "＆": "timing",
  "?": "ext",
  "？": "ext",
  "%": "frame",
  "^": "camera",
  "*": "beat",
};

export const DECORATOR_MARKS = new Set(Object.keys(MARK_TO_KIND));

/** Bracket shorthand first-key default (ADR 0002 / 0005). Prefer resolveBracketKeys. */
export const BRACKET_DEFAULT_KEY = "表情";

export {
  BRACKET_CORE_DEFAULT,
  BRACKET_PROFILE_KEYS,
  bracketKeyAt,
  resolveBracketKeys,
} from "./bracketKeys.ts";