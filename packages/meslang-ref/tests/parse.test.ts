import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { doFlat, firstCharacter, parseMesLang } from "../src/parse.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("parses character, comment, sound, position", () => {
  const medo = parseMesLang(`@にか
#駅前
$雑踏
!正面
こんにちは。
`);
  const piece = medo.body.sections[0]!.pieces[0]!;
  assert.equal(piece.dialogue, "こんにちは。");
  assert.equal(firstCharacter(piece)?.value, "にか");
  assert.deepEqual(
    piece.decorators.map((d) => d.kind),
    ["character", "comment", "sound", "position"],
  );
});

test("attributes on character and attr-only lines", () => {
  const medo = parseMesLang(`@にか :表情 泣 :姿勢 前傾
生ぎたいっ!!!
`);
  const ch = firstCharacter(medo.body.sections[0]!.pieces[0]!)!;
  assert.equal(ch.attrs["表情"], "泣");
  assert.equal(ch.attrs["姿勢"], "前傾");
  assert.equal(ch.value, "にか");

  const medo2 = parseMesLang(`@にか
:表情 微笑
やあ。
`);
  const ch2 = firstCharacter(medo2.body.sections[0]!.pieces[0]!)!;
  assert.equal(ch2.attrs["表情"], "微笑");
});

test("bracket sugar maps to 表情 / 姿勢", () => {
  const medo = parseMesLang(`@にか[泣][前傾]
セリフ
`);
  const ch = firstCharacter(medo.body.sections[0]!.pieces[0]!)!;
  assert.equal(ch.value, "にか");
  assert.equal(ch.attrs["表情"], "泣");
  assert.equal(ch.attrs["姿勢"], "前傾");
});

test("blank line splits pieces; postfix decorators ok", () => {
  const medo = parseMesLang(`こんにちは。
@にか

@こいと
やあ。
#笑顔
`);
  const pieces = medo.body.sections[0]!.pieces;
  assert.equal(pieces.length, 2);
  assert.equal(pieces[0]!.dialogue, "こんにちは。");
  assert.equal(firstCharacter(pieces[0]!)?.value, "にか");
  assert.equal(pieces[1]!.decorators.find((d) => d.kind === "comment")?.value, "笑顔");
});

test("sugar 名前「セリフ」", () => {
  assert.match(doFlat(`想太「りんご剥いたよ」`), /@想太\nりんご剥いたよ/);
  const medo = parseMesLang(`想太「りんご剥いたよ」\n`);
  assert.equal(firstCharacter(medo.body.sections[0]!.pieces[0]!)?.value, "想太");
  assert.equal(medo.body.sections[0]!.pieces[0]!.dialogue, "りんご剥いたよ");
});

test("header profile and sections", () => {
  const medo = parseMesLang(`profile: manga
title: テスト
----
== 1ページ

%1
^俯瞰
#状況
@にか
セリフ
`);
  assert.equal(medo.header.profile, "manga");
  assert.equal(medo.header.title, "テスト");
  assert.equal(medo.body.sections[0]!.title, "1ページ");
  const kinds = medo.body.sections[0]!.pieces[0]!.decorators.map((d) => d.kind);
  assert.deepEqual(kinds, ["frame", "camera", "comment", "character"]);
});

test("ADR 0003: #第一章 stays comment; == is the only section mark", () => {
  const asComment = parseMesLang(`#第一章

@にか
セリフ
`);
  assert.equal(asComment.body.sections.length, 1);
  assert.equal(asComment.body.sections[0]!.title, "");
  assert.equal(
    asComment.body.sections[0]!.pieces[0]!.decorators.find((d) => d.kind === "comment")?.value,
    "第一章",
  );

  const asSection = parseMesLang(`== 第一章

@にか
セリフ
`);
  assert.equal(asSection.body.sections[0]!.title, "第一章");
  assert.equal(asSection.body.sections[0]!.pieces[0]!.dialogue, "セリフ");
});

test("fullwidth marks accepted", () => {
  const medo = parseMesLang(`＠にか
＃ト書き
セリフ
`);
  const p = medo.body.sections[0]!.pieces[0]!;
  assert.equal(firstCharacter(p)?.kind, "character");
  assert.equal(p.decorators.find((d) => d.kind === "comment")?.value, "ト書き");
});

test("examples/audio/station.mes parses", () => {
  const text = readFileSync(join(root, "examples/audio/station.mes"), "utf8");
  const medo = parseMesLang(text);
  assert.equal(medo.header.profile, "audio");
  const pieces = medo.body.sections.flatMap((s) => s.pieces);
  assert.ok(pieces.length >= 5);
  assert.ok(pieces.some((p) => p.dialogue.includes("キタキタ")));
});

test("examples/manga/station-name.mes parses frames", () => {
  const text = readFileSync(join(root, "examples/manga/station-name.mes"), "utf8");
  const medo = parseMesLang(text);
  const frames = medo.body.sections
    .flatMap((s) => s.pieces)
    .flatMap((p) => p.decorators)
    .filter((d) => d.kind === "frame");
  assert.ok(frames.length >= 4);
});
