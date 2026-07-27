/**
 * Bracket sugar key tables (ADR 0005 / ADR 0007).
 * Priority: header `bracket-keys` > profile table > core default.
 */

/** Core default (ADR 0005): 表情, 姿勢, 表情2, 表情3, … */
export const BRACKET_CORE_DEFAULT = ["表情", "姿勢"] as const;

/** Profile tables (ADR 0007). Unknown profiles fall back to core. */
export const BRACKET_PROFILE_KEYS: Record<string, readonly string[]> = {
  audio: ["表情", "声質"],
  manga: ["表情", "姿勢", "吹き出し"],
};

const HEADER_BRACKET_KEYS = ["bracket-keys", "bracket_keys", "かぎかっこ"] as const;

function parseKeyList(raw: string): string[] {
  return raw
    .split(/[,，、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Key for bracket position `index` (0-based) given an explicit prefix table.
 * Beyond the table: first overflow → 表情2, then 表情3, … (ADR 0005 / 0007).
 */
export function bracketKeyAt(keys: readonly string[], index: number): string {
  if (index < keys.length) return keys[index]!;
  return `表情${index - keys.length + 2}`;
}

/** Resolve ordered key prefix from Medo-style header fields. */
export function resolveBracketKeys(header: Record<string, string>): string[] {
  for (const name of HEADER_BRACKET_KEYS) {
    const raw = header[name];
    if (raw && raw.trim()) {
      const list = parseKeyList(raw);
      if (list.length > 0) return list;
    }
  }
  const profile = (header.profile ?? "audio").trim().toLowerCase();
  const fromProfile = BRACKET_PROFILE_KEYS[profile];
  if (fromProfile) return [...fromProfile];
  return [...BRACKET_CORE_DEFAULT];
}
