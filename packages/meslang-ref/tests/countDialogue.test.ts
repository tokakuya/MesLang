import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { countDialogueChars, dialogueCharLength } from "../src/countDialogue.ts";
import { parseMesLang } from "../src/parse.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("dialogueCharLength strips whitespace and counts code points", () => {
  assert.equal(dialogueCharLength("こんにちは。"), 6);
  assert.equal(dialogueCharLength("あ　い\nう"), 3);
  assert.equal(dialogueCharLength("  "), 0);
});

test("countDialogueChars aggregates by speaker", () => {
  const medo = parseMesLang(`@にか
あいうえお

@こいと
かきくけこ
さしすせそ

セリフだけ
`);
  const counts = countDialogueChars(medo);
  assert.equal(counts.total, 5 + 10 + 5);
  assert.equal(counts.bySpeaker.length, 3);
  const nika = counts.bySpeaker.find((s) => s.speaker === "にか")!;
  const koito = counts.bySpeaker.find((s) => s.speaker === "こいと")!;
  const none = counts.bySpeaker.find((s) => s.speaker === "")!;
  assert.equal(nika.chars, 5);
  assert.equal(nika.pieces, 1);
  assert.equal(koito.chars, 10);
  assert.equal(koito.pieces, 1);
  assert.equal(none.chars, 5);
});

test("examples/audio/station.mes dialogue count is stable and positive", () => {
  const text = readFileSync(join(root, "examples/audio/station.mes"), "utf8");
  const counts = countDialogueChars(parseMesLang(text));
  assert.ok(counts.total > 80);
  assert.ok(counts.bySpeaker.some((s) => s.speaker === "にか"));
  assert.ok(counts.bySpeaker.some((s) => s.speaker === "こいと"));
  // 記号行は数えない（セリフだけの合計）
  assert.equal(
    counts.total,
    counts.bySpeaker.reduce((sum, s) => sum + s.chars, 0),
  );
});
