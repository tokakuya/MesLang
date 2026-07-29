import type { Medo, Piece } from "./types.ts";
import { firstCharacter } from "./parse.ts";

export interface ConteDialogue {
  speaker: string;
  text: string;
}

export interface ConteCut {
  /** `%` の値。番号なしのときは空文字 */
  cut: string;
  camera: string[];
  timing: string[];
  action: string[];
  sound: string[];
  position: string[];
  beat: string[];
  ext: string[];
  dialogues: ConteDialogue[];
}

export interface ConteTable {
  version: "conte-table/0.0";
  title: string;
  profile: string;
  cuts: ConteCut[];
}

function emptyCut(cutId: string): ConteCut {
  return {
    cut: cutId,
    camera: [],
    timing: [],
    action: [],
    sound: [],
    position: [],
    beat: [],
    ext: [],
    dialogues: [],
  };
}

function appendPiece(cut: ConteCut, piece: Piece): void {
  for (const d of piece.decorators) {
    switch (d.kind) {
      case "frame":
        // カット ID は行開始時に取る。同一ピース内の追加 % はいまは無視
        break;
      case "camera":
        cut.camera.push(d.value);
        break;
      case "timing":
        cut.timing.push(d.value);
        break;
      case "comment":
        cut.action.push(d.value);
        break;
      case "sound":
        cut.sound.push(d.value);
        break;
      case "position":
        cut.position.push(d.value);
        break;
      case "beat":
        cut.beat.push(d.value);
        break;
      case "ext":
        cut.ext.push(d.value);
        break;
      case "character":
      case "unknown":
        break;
    }
  }
  const text = piece.dialogue.trim();
  if (text) {
    cut.dialogues.push({
      speaker: firstCharacter(piece)?.value ?? "",
      text,
    });
  }
}

/**
 * Medo から絵コンテ／カット表の仮形を組み立てる（二次出力）。
 * `%`（frame）があるピースで新しいカットを始める。
 * @see docs/spec/07-conte-table.md / ADR 0008
 */
export function toConteTable(medo: Medo): ConteTable {
  const cuts: ConteCut[] = [];
  let current: ConteCut | null = null;

  for (const section of medo.body.sections) {
    for (const piece of section.pieces) {
      const frame = piece.decorators.find((d) => d.kind === "frame");
      if (frame) {
        current = emptyCut(frame.value);
        cuts.push(current);
      } else if (!current) {
        current = emptyCut("");
        cuts.push(current);
      }
      appendPiece(current, piece);
    }
  }

  return {
    version: "conte-table/0.0",
    title: medo.header.title ?? "",
    profile: medo.header.profile ?? "audio",
    cuts,
  };
}
