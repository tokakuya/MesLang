import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { rewriteMesCompat } from "../src/mesCompat.ts";
import { firstCharacter, parseMesLang } from "../src/parse.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

test("core parse leaves ○ as non-decorator dialogue (ADR 0006)", () => {
  const medo = parseMesLang(`○駅前

にか「セリフ」
`);
  const pieces = medo.body.sections[0]!.pieces;
  // ○ is not a core decorator mark — first piece is dialogue-ish / sugar expands second
  const joined = pieces.map((p) => p.dialogue).join("\n");
  assert.match(joined, /○駅前|駅前/);
  // Without rewrite, ○ line is not kind comment
  const comments = pieces.flatMap((p) => p.decorators.filter((d) => d.kind === "comment"));
  assert.equal(
    comments.some((c) => c.value.includes("駅前")),
    false,
  );
});

test("rewriteMesCompat: ○ / ◯ → # then parse as comment", () => {
  const rewritten = rewriteMesCompat(`○駅前

◯場面メモ

にか「セリフ」
`);
  assert.match(rewritten, /^#駅前/m);
  assert.match(rewritten, /^#場面メモ/m);
  assert.doesNotMatch(rewritten, /^[○◯]/m);

  const medo = parseMesLang(rewritten);
  const comments = medo.body.sections[0]!.pieces.flatMap((p) =>
    p.decorators.filter((d) => d.kind === "comment"),
  );
  assert.ok(comments.some((c) => c.value === "駅前"));
  assert.ok(comments.some((c) => c.value === "場面メモ"));
  assert.equal(firstCharacter(medo.body.sections[0]!.pieces.find((p) => p.dialogue.includes("セリフ"))!)?.value, "にか");
});

test("rewriteMesCompat does not promote #第一章 to section", () => {
  const rewritten = rewriteMesCompat(`#第一章

@にか
セリフ
`);
  const medo = parseMesLang(rewritten);
  assert.equal(medo.body.sections.length, 1);
  assert.equal(medo.body.sections[0]!.title, "");
  assert.equal(
    medo.body.sections[0]!.pieces[0]!.decorators.find((d) => d.kind === "comment")?.value,
    "第一章",
  );
});

test("examples/audio mes-import before→after path", () => {
  const before = readFileSync(join(root, "examples/audio/mes-import-before.mes"), "utf8");
  const afterRewrite = rewriteMesCompat(before);
  const medo = parseMesLang(afterRewrite);
  const pieces = medo.body.sections.flatMap((s) => s.pieces);
  assert.ok(pieces.some((p) => p.decorators.some((d) => d.kind === "comment" && d.value === "駅前")));
  assert.ok(pieces.some((p) => p.dialogue.includes("キタキタ")));
  // Old-style voice note stays as $ until a human moves it to :声質
  assert.ok(
    pieces.some((p) => p.decorators.some((d) => d.kind === "sound" && d.value.includes("ヒソヒソ"))),
  );

  const after = readFileSync(join(root, "examples/audio/mes-import-after.mes"), "utf8");
  const polished = parseMesLang(after);
  assert.equal(polished.header.profile, "audio");
  assert.equal(polished.body.sections[0]!.title, "駅前");
  const nika = polished.body.sections[0]!.pieces.find((p) => p.dialogue.includes("キタキタ"));
  assert.equal(firstCharacter(nika!)?.attrs["声質"], "ヒソヒソ");
  assert.equal(firstCharacter(nika!)?.attrs["表情"], "焦り");
});

test("audio: speaker 声質 is attr; ambient voice stays $", () => {
  const medo = parseMesLang(`profile: audio
----
@にか :声質 ヒソヒソ
$呼びかける声（やや遠く）
!遠方
……だれか呼んでない？
`);
  const piece = medo.body.sections[0]!.pieces[0]!;
  assert.equal(firstCharacter(piece)?.attrs["声質"], "ヒソヒソ");
  const sounds = piece.decorators.filter((d) => d.kind === "sound").map((d) => d.value);
  assert.deepEqual(sounds, ["呼びかける声（やや遠く）"]);
  assert.ok(piece.decorators.some((d) => d.kind === "position" && d.value === "遠方"));
});
