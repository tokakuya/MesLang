import type { Medo } from "./types.ts";
import { firstCharacter } from "./parse.ts";

export interface DialogueCountBySpeaker {
  /** `@` の値。話者なしのピースは空文字 */
  speaker: string;
  chars: number;
  pieces: number;
}

export interface DialogueCount {
  /** 空白を除いたセリフ文字数の合計 */
  total: number;
  bySpeaker: DialogueCountBySpeaker[];
}

/** セリフ集計用: 空白類を除いた Unicode コードポイント数 */
export function dialogueCharLength(dialogue: string): number {
  const stripped = dialogue.replace(/[\s\u3000]+/g, "");
  return Array.from(stripped).length;
}

/**
 * Medo からセリフ文字数を集計する（台本の分量目安用）。
 * 記号行（`@` `#` `$` など）は含めず、ピースの dialogue だけを数える。
 */
export function countDialogueChars(medo: Medo): DialogueCount {
  const map = new Map<string, { chars: number; pieces: number }>();
  let total = 0;

  for (const section of medo.body.sections) {
    for (const piece of section.pieces) {
      const n = dialogueCharLength(piece.dialogue);
      if (n === 0 && !piece.dialogue.trim()) continue;
      total += n;
      const speaker = firstCharacter(piece)?.value ?? "";
      const prev = map.get(speaker) ?? { chars: 0, pieces: 0 };
      prev.chars += n;
      prev.pieces += 1;
      map.set(speaker, prev);
    }
  }

  const bySpeaker: DialogueCountBySpeaker[] = [...map.entries()]
    .map(([speaker, v]) => ({ speaker, chars: v.chars, pieces: v.pieces }))
    .sort((a, b) => b.chars - a.chars || a.speaker.localeCompare(b.speaker, "ja"));

  return { total, bySpeaker };
}
