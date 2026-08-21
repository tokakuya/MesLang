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

test("bracket sugar maps to 表情 / 姿勢 / 表情N without profile (ADR 0005)", () => {
  // No header → profile defaults to audio, which uses 声質 for 2nd (ADR 0007).
  // Force core-like keys via bracket-keys override for this legacy assertion.
  const medo = parseMesLang(`bracket-keys: 表情, 姿勢
----
@にか[泣][前傾]
セリフ
`);
  const ch = firstCharacter(medo.body.sections[0]!.pieces[0]!)!;
  assert.equal(ch.value, "にか");
  assert.equal(ch.attrs["表情"], "泣");
  assert.equal(ch.attrs["姿勢"], "前傾");

  const medo3 = parseMesLang(`bracket-keys: 表情, 姿勢
----
@にか[泣][前傾][汗]
セリフ
`);
  const ch3 = firstCharacter(medo3.body.sections[0]!.pieces[0]!)!;
  assert.equal(ch3.attrs["表情"], "泣");
  assert.equal(ch3.attrs["姿勢"], "前傾");
  assert.equal(ch3.attrs["表情2"], "汗");
  assert.equal(ch3.attrs["表情3"], undefined);
});

test("audio profile: 2nd bracket → 声質 (ADR 0007)", () => {
  const medo = parseMesLang(`profile: audio
----
@にか[焦り][ヒソヒソ]
セリフ
`);
  const ch = firstCharacter(medo.body.sections[0]!.pieces[0]!)!;
  assert.equal(ch.attrs["表情"], "焦り");
  assert.equal(ch.attrs["声質"], "ヒソヒソ");
  assert.equal(ch.attrs["姿勢"], undefined);
});

test("manga profile: 3rd bracket → 吹き出し (ADR 0007)", () => {
  const medo = parseMesLang(`profile: manga
----
@こいと[呆れ][腕組み][心の声]
セリフ
`);
  const ch = firstCharacter(medo.body.sections[0]!.pieces[0]!)!;
  assert.equal(ch.attrs["表情"], "呆れ");
  assert.equal(ch.attrs["姿勢"], "腕組み");
  assert.equal(ch.attrs["吹き出し"], "心の声");
});

test("header bracket-keys overrides profile table (ADR 0007)", () => {
  const medo = parseMesLang(`profile: audio
bracket-keys: 表情, 姿勢
----
@にか[微笑][前傾]
やあ。
`);
  const ch = firstCharacter(medo.body.sections[0]!.pieces[0]!)!;
  assert.equal(ch.attrs["表情"], "微笑");
  assert.equal(ch.attrs["姿勢"], "前傾");
  assert.equal(ch.attrs["声質"], undefined);
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

test("header $key value form (Mes-style) and body $ sound stay distinct", () => {
  const medo = parseMesLang(`$title 駅前の二人
$profile audio
----
@にか
$雑踏
!正面
セリフ
`);
  assert.equal(medo.header.title, "駅前の二人");
  assert.equal(medo.header.profile, "audio");
  // Header keys are meta only — body sounds must not leak into header.
  assert.equal(medo.header["雑踏"], undefined);
  const piece = medo.body.sections[0]!.pieces[0]!;
  assert.equal(piece.decorators.find((d) => d.kind === "sound")?.value, "雑踏");
  assert.equal(piece.decorators.find((d) => d.kind === "position")?.value, "正面");
  assert.equal(piece.dialogue, "セリフ");
});

test("glossary: header $ / body $ / :声質 / # stay on different shelves", () => {
  // docs/spec/05-glossary.md「音・声質・ヘッダー変数」
  const medo = parseMesLang(`$title 駅前
profile: audio
----
@にか :声質 ヒソヒソ
#少し呆れた感じ
$呼びかける声（やや遠く）
ヒソヒソ……。
`);
  assert.equal(medo.header.title, "駅前");
  assert.equal(medo.header["呼びかける声（やや遠く）"], undefined);
  const piece = medo.body.sections[0]!.pieces[0]!;
  assert.equal(firstCharacter(piece)?.attrs["声質"], "ヒソヒソ");
  assert.equal(piece.decorators.find((d) => d.kind === "comment")?.value, "少し呆れた感じ");
  assert.equal(piece.decorators.find((d) => d.kind === "sound")?.value, "呼びかける声（やや遠く）");
  assert.equal(piece.dialogue, "ヒソヒソ……。");
});

test("glossary: ! alone is speaker position (not a missing $)", () => {
  // docs/spec/05-glossary.md「音の位置と話者の位置（まぎらわしいことば）」
  const glossary = readFileSync(join(root, "docs/spec/05-glossary.md"), "utf8");
  const section = glossary.slice(
    glossary.indexOf("## 音の位置と話者の位置"),
    glossary.indexOf("## `#` まわり"),
  );
  assert.match(section, /音の位置/);
  assert.match(section, /話者の位置/);
  assert.match(section, /\$` なし/);
  assert.match(section, /正しいです/);

  const guide = readFileSync(join(root, "docs/spec/04-ai-reading.md"), "utf8");
  assert.match(guide, /音の位置と話者の位置/);
  assert.match(guide, /\$ のない ! は話者の位置/);

  const compat = readFileSync(join(root, "docs/spec/06-mes-compat.md"), "utf8");
  assert.match(compat, /名前「セリフ」/);
  assert.match(compat, /@` 化は任意/);
  assert.match(compat, /混ぜてよい/);

  const medo = parseMesLang(`profile: audio
----
@にか[思索][ヒソヒソ]
!正面やや右
こういう時は。
`);
  const piece = medo.body.sections[0]!.pieces[0]!;
  assert.equal(firstCharacter(piece)?.value, "にか");
  assert.equal(firstCharacter(piece)?.attrs["声質"], "ヒソヒソ");
  assert.equal(piece.decorators.find((d) => d.kind === "position")?.value, "正面やや右");
  assert.equal(piece.decorators.find((d) => d.kind === "sound"), undefined);
  assert.equal(piece.dialogue, "こういう時は。");

  const after = readFileSync(join(root, "examples/audio/mes-import-after.mes"), "utf8");
  assert.match(after, /こいと「それにしても久しぶりですね。」/);
  const afterMedo = parseMesLang(after);
  const koito = afterMedo.body.sections[0]!.pieces.find(
    (p) => firstCharacter(p)?.value === "こいと" && p.dialogue.includes("ついさっき"),
  );
  assert.ok(koito);
  assert.equal(koito!.decorators.find((d) => d.kind === "position")?.value, "正面");
  assert.equal(koito!.decorators.find((d) => d.kind === "sound"), undefined);

  const reunion = afterMedo.body.sections[0]!.pieces.find((p) => p.dialogue.includes("久しぶり"));
  assert.equal(firstCharacter(reunion!)?.value, "こいと");
  assert.match(after, /@にか/);
});

test("glossary: manga コマ and anime カット share kind frame", () => {
  // docs/spec/05-glossary.md「コマとカット（まぎらわしいことば）」
  const manga = parseMesLang(`profile: manga
----
== 1ページ

%1
^俯瞰
#改札前
`);
  const anime = parseMesLang(`profile: anime
----
%CUT-001
^寄り
&2s
#立ち止まる
`);
  const mangaFrame = manga.body.sections[0]!.pieces[0]!.decorators.find((d) => d.kind === "frame");
  const animeFrame = anime.body.sections[0]!.pieces[0]!.decorators.find((d) => d.kind === "frame");
  assert.equal(mangaFrame?.kind, "frame");
  assert.equal(animeFrame?.kind, "frame");
  assert.equal(mangaFrame?.value, "1");
  assert.equal(animeFrame?.value, "CUT-001");
  assert.equal(manga.body.sections[0]!.title, "1ページ");
  assert.equal(manga.header.profile, "manga");
  assert.equal(anime.header.profile, "anime");
});

test("glossary: & timing and * beat stay on different shelves", () => {
  // docs/spec/05-glossary.md「タイミングとビート（まぎらわしいことば）」
  const audio = parseMesLang(`profile: audio
----
$信号待ち
!正面
&約1.5秒
#赤信号のあいだ、ふたり無言
`);
  const manga = parseMesLang(`profile: manga
----
%4
^信号越しの引き
#赤信号。横断歩道の手前で立ち止まる
*間
$遠くの車の走行音
`);
  const audioPiece = audio.body.sections[0]!.pieces[0]!;
  const mangaPiece = manga.body.sections[0]!.pieces[0]!;
  assert.equal(audioPiece.decorators.find((d) => d.kind === "timing")?.value, "約1.5秒");
  assert.equal(audioPiece.decorators.find((d) => d.kind === "beat"), undefined);
  assert.equal(mangaPiece.decorators.find((d) => d.kind === "beat")?.value, "間");
  assert.equal(mangaPiece.decorators.find((d) => d.kind === "timing"), undefined);
  assert.equal(mangaPiece.decorators.find((d) => d.kind === "frame")?.value, "4");
});

test("glossary: 形チェック means 箱の名前と型 (not 欄 / not quality)", () => {
  // docs/spec/05-glossary.md「形チェックと目視（まぎらわしいことば）」
  const glossary = readFileSync(join(root, "docs/spec/05-glossary.md"), "utf8");
  const section = glossary.slice(
    glossary.indexOf("## 形チェックと目視"),
    glossary.indexOf("## カット表の形チェックの縁"),
  );
  assert.match(section, /箱の名前と型/);
  assert.match(section, /目視/);
  assert.match(section, /不足の洗い出し/);
  assert.match(section, /欄の名前と型/);
  assert.match(section, /品質チェック/);

  const medoSchema = readFileSync(join(root, "schema/medo.schema.json"), "utf8");
  const conteSchema = readFileSync(join(root, "schema/conte-table.schema.json"), "utf8");
  assert.match(medoSchema, /箱の名前と型/);
  assert.match(conteSchema, /箱の名前と型/);
  assert.doesNotMatch(medoSchema, /欄の名前と型/);
  assert.doesNotMatch(conteSchema, /欄の名前と型/);

  const conteDoc = readFileSync(join(root, "docs/spec/07-conte-table.md"), "utf8");
  assert.match(conteDoc, /箱の名前と型/);
  assert.doesNotMatch(conteDoc, /欄の名前と型/);
});

test("glossary: カット表の形チェックの縁 — empty cut id is valid", () => {
  // docs/spec/05-glossary.md「カット表の形チェックの縁（まぎらわしいことば）」
  const glossary = readFileSync(join(root, "docs/spec/05-glossary.md"), "utf8");
  const section = glossary.slice(
    glossary.indexOf("## カット表の形チェックの縁"),
    glossary.indexOf("## 記法"),
  );
  assert.match(section, /番号なしカット行/);
  assert.match(section, /cut: ""/);
  assert.match(section, /空の配列欄/);
  assert.match(section, /余分なキー/);
  assert.match(section, /attrs/);

  const conteDoc = readFileSync(join(root, "docs/spec/07-conte-table.md"), "utf8");
  assert.match(conteDoc, /形チェックが見る縁/);
  assert.match(conteDoc, /cut: ""/);
  assert.match(conteDoc, /dialogues\[\]\.speaker/);

  const conteSchema = readFileSync(join(root, "schema/conte-table.schema.json"), "utf8");
  assert.match(conteSchema, /番号なし/);
  assert.match(conteSchema, /空配列/);
  assert.match(conteSchema, /attrs/);

  const guide = readFileSync(join(root, "docs/spec/04-ai-reading.md"), "utf8");
  assert.match(guide, /カット表の形チェックの縁/);
});

test("glossary: かぎかっこ速記と属性 land on the same attrs", () => {
  // docs/spec/05-glossary.md「かぎかっこ速記と属性（まぎらわしいことば）」
  const glossary = readFileSync(join(root, "docs/spec/05-glossary.md"), "utf8");
  const section = glossary.slice(
    glossary.indexOf("## かぎかっこ速記と属性"),
    glossary.indexOf("## 属性のつき先"),
  );
  assert.match(section, /同じ行き先/);
  assert.match(section, /かぎかっこ速記/);
  assert.match(section, /ブラケット/);
  assert.match(section, /ポーズ/);
  assert.match(section, /吹き出し/);
  assert.match(section, /声質/);

  const adrReadme = readFileSync(join(root, "docs/decisions/README.md"), "utf8");
  assert.match(adrReadme, /2026-08-16/);
  assert.match(adrReadme, /かぎかっこ速記と属性/);

  const adr0008 = readFileSync(join(root, "docs/decisions/0008-conte-table-secondary.md"), "utf8");
  assert.match(adr0008, /wont/);
  assert.doesNotMatch(adr0008, /backlog ready/);

  const attrs = parseMesLang(`profile: manga
----
@にか :表情 困り :姿勢 前のめり :吹き出し 心の声
セリフ
`);
  const brackets = parseMesLang(`profile: manga
----
@にか[困り][前のめり][心の声]
セリフ
`);
  const a = firstCharacter(attrs.body.sections[0]!.pieces[0]!)!;
  const b = firstCharacter(brackets.body.sections[0]!.pieces[0]!)!;
  assert.equal(a.attrs["表情"], "困り");
  assert.equal(a.attrs["姿勢"], "前のめり");
  assert.equal(a.attrs["吹き出し"], "心の声");
  assert.deepEqual(a.attrs, b.attrs);
});

test("glossary: 属性のつき先 — orphan :attrs stay in dialogue (no silent drop)", () => {
  // docs/spec/05-glossary.md「属性のつき先（まぎらわしいことば）」
  const glossary = readFileSync(join(root, "docs/spec/05-glossary.md"), "utf8");
  const section = glossary.slice(
    glossary.indexOf("## 属性のつき先"),
    glossary.indexOf("## 原稿と二次出力"),
  );
  assert.match(section, /直前のデコレーター/);
  assert.match(section, /ピース直下/);
  assert.match(section, /セリフ行に残す/);
  assert.match(section, /unknown/);

  const core = readFileSync(join(root, "docs/spec/01-core.md"), "utf8");
  assert.match(core, /ピース直下の attrs 箱は v0 にはありません/);
  assert.doesNotMatch(core, /あまり使いません/);

  const decorators = readFileSync(join(root, "docs/spec/02-decorators.md"), "utf8");
  assert.match(decorators, /## 属性のつき先/);

  const guide = readFileSync(join(root, "docs/spec/04-ai-reading.md"), "utf8");
  assert.match(guide, /属性のつき先/);
  assert.match(guide, /ピース直下の attrs 箱は無い/);

  const schema = readFileSync(join(root, "schema/medo.schema.json"), "utf8");
  assert.match(schema, /手組み Medo/);
  assert.match(schema, /セリフ行/);

  // Attached to preceding decorator (unchanged)
  const attached = parseMesLang(`@にか
:表情 泣
こんにちは。
`);
  const ch = firstCharacter(attached.body.sections[0]!.pieces[0]!)!;
  assert.equal(ch.attrs["表情"], "泣");
  assert.equal(attached.body.sections[0]!.pieces[0]!.dialogue, "こんにちは。");

  // Orphan at piece start → dialogue (not silently dropped)
  const orphan = parseMesLang(`:表情 泣
こんにちは。
`);
  const orphanPiece = orphan.body.sections[0]!.pieces[0]!;
  assert.equal(orphanPiece.decorators.length, 0);
  assert.match(orphanPiece.dialogue, /^:表情 泣/);
  assert.match(orphanPiece.dialogue, /こんにちは。/);

  // After dialogue, lastDecorator cleared → stay in dialogue
  const afterSpeech = parseMesLang(`@にか
こんにちは。
:表情 泣
`);
  const afterPiece = afterSpeech.body.sections[0]!.pieces[0]!;
  assert.equal(firstCharacter(afterPiece)!.attrs["表情"], undefined);
  assert.match(afterPiece.dialogue, /:表情 泣/);

  // Unknown leading marks are dialogue, not kind unknown
  const tilde = parseMesLang(`~メモ
こんにちは。
`);
  const tildePiece = tilde.body.sections[0]!.pieces[0]!;
  assert.equal(tildePiece.decorators.length, 0);
  assert.match(tildePiece.dialogue, /^~メモ/);
  assert.ok(!tildePiece.decorators.some((d) => d.kind === "unknown"));
});

test("glossary: デコレーターと行頭記号 are the same family (attrs are not marks)", () => {
  // docs/spec/05-glossary.md「デコレーターと行頭記号（まぎらわしいことば）」
  const glossary = readFileSync(join(root, "docs/spec/05-glossary.md"), "utf8");
  const section = glossary.slice(
    glossary.indexOf("## デコレーターと行頭記号"),
    glossary.indexOf("## かぎかっこ速記と属性"),
  );
  assert.match(section, /同じ仲間/);
  assert.match(section, /行頭記号/);
  assert.match(section, /デコレーター/);
  assert.match(section, /属性/);
  assert.match(section, /rawMark/);

  const adrReadme = readFileSync(join(root, "docs/decisions/README.md"), "utf8");
  assert.match(adrReadme, /デコレーターと行頭記号/);

  const guide = readFileSync(join(root, "docs/spec/04-ai-reading.md"), "utf8");
  assert.match(guide, /デコレーターと行頭記号/);

  const medo = parseMesLang(`@にか :表情 微笑
#駅前
こんにちは。
`);
  const piece = medo.body.sections[0]!.pieces[0]!;
  assert.equal(piece.decorators[0]!.kind, "character");
  assert.equal(piece.decorators[0]!.rawMark, "@");
  assert.equal(firstCharacter(piece)!.attrs["表情"], "微笑");
  assert.equal(piece.decorators.find((d) => d.kind === "comment")?.rawMark, "#");
});

test("glossary: 全角／半角の行頭記号 are the same kinds (rawMark kept)", () => {
  // docs/spec/05-glossary.md「全角／半角の行頭記号（まぎらわしいことば）」
  const glossary = readFileSync(join(root, "docs/spec/05-glossary.md"), "utf8");
  const section = glossary.slice(
    glossary.indexOf("## 全角／半角の行頭記号"),
    glossary.indexOf("## おすすめの属性キー"),
  );
  assert.match(section, /同じ意味/);
  assert.match(section, /％/);
  assert.match(section, /＾/);
  assert.match(section, /＊/);
  assert.match(section, /rawMark/);
  assert.match(section, /未知の記号/);

  const half = parseMesLang(`profile: manga
----
%3
^寄り
*ため
@にか
セリフ
`);
  const full = parseMesLang(`profile: manga
----
％3
＾寄り
＊ため
＠にか
セリフ
`);
  const halfPiece = half.body.sections[0]!.pieces[0]!;
  const fullPiece = full.body.sections[0]!.pieces[0]!;
  assert.equal(
    halfPiece.decorators.find((d) => d.kind === "frame")?.kind,
    fullPiece.decorators.find((d) => d.kind === "frame")?.kind,
  );
  assert.equal(fullPiece.decorators.find((d) => d.kind === "frame")?.rawMark, "％");
  assert.equal(fullPiece.decorators.find((d) => d.kind === "camera")?.rawMark, "＾");
  assert.equal(fullPiece.decorators.find((d) => d.kind === "beat")?.rawMark, "＊");
  assert.equal(firstCharacter(fullPiece)?.rawMark, "＠");
  assert.equal(halfPiece.decorators.find((d) => d.kind === "frame")?.rawMark, "%");
});

test("audio: multiple $ / ! keep document order (pairing is authoring hint)", () => {
  const medo = parseMesLang(`profile: audio
----
@にか
$発車ベル
!遠方
$靴音
!近づく
&0:08
あ。
`);
  const piece = medo.body.sections[0]!.pieces[0]!;
  assert.deepEqual(
    piece.decorators.filter((d) => d.kind === "sound" || d.kind === "position" || d.kind === "timing").map((d) => [d.kind, d.value]),
    [
      ["sound", "発車ベル"],
      ["position", "遠方"],
      ["sound", "靴音"],
      ["position", "近づく"],
      ["timing", "0:08"],
    ],
  );
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

test("rejected ::img= is not attribute syntax (ADR 0002 / glossary wont)", () => {
  const medo = parseMesLang(`@にか
::img=face.png
セリフ
`);
  const piece = medo.body.sections[0]!.pieces[0]!;
  const ch = firstCharacter(piece)!;
  assert.equal(ch.value, "にか");
  assert.equal(ch.attrs["img"], undefined);
  // 行頭が : でもキーが空／不正なら属性にせずセリフ側へ残す
  assert.match(piece.dialogue, /::img=face\.png/);
  assert.match(piece.dialogue, /セリフ/);
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

test("fullwidth profile marks % ^ * map to frame/camera/beat and keep rawMark", () => {
  const medo = parseMesLang(`profile: manga
----
％3
＾寄り
＊ため
＠にか
セリフ
`);
  const p = medo.body.sections[0]!.pieces[0]!;
  const frame = p.decorators.find((d) => d.kind === "frame");
  const camera = p.decorators.find((d) => d.kind === "camera");
  const beat = p.decorators.find((d) => d.kind === "beat");
  assert.equal(frame?.value, "3");
  assert.equal(frame?.rawMark, "％");
  assert.equal(camera?.value, "寄り");
  assert.equal(camera?.rawMark, "＾");
  assert.equal(beat?.value, "ため");
  assert.equal(beat?.rawMark, "＊");
  assert.equal(firstCharacter(p)?.rawMark, "＠");
});

test("examples/audio/station.mes parses", () => {
  const text = readFileSync(join(root, "examples/audio/station.mes"), "utf8");
  const medo = parseMesLang(text);
  assert.equal(medo.header.profile, "audio");
  const pieces = medo.body.sections.flatMap((s) => s.pieces);
  assert.ok(pieces.length >= 5);
  assert.ok(pieces.some((p) => p.dialogue.includes("キタキタ")));
});

test("examples/audio/station.mes: $ / ! / & / :声質 coexist in 改札を出て", () => {
  const text = readFileSync(join(root, "examples/audio/station.mes"), "utf8");
  const medo = parseMesLang(text);
  assert.ok(medo.body.sections.length >= 2);
  assert.equal(medo.body.sections[1]!.title, "改札を出て");
  const pieces = medo.body.sections[1]!.pieces;
  assert.ok(pieces.length >= 3);

  const walk = pieces.find((p) => p.dialogue.includes("やっと会えた"));
  assert.ok(walk);
  const nika = firstCharacter(walk!)!;
  assert.equal(nika.attrs["表情"], "ほっとした");
  assert.equal(nika.attrs["声質"], "少し声を落として");
  assert.ok(walk!.decorators.some((d) => d.kind === "sound" && d.value.includes("靴音")));
  assert.ok(walk!.decorators.some((d) => d.kind === "position" && d.value === "近づく"));
  assert.ok(walk!.decorators.some((d) => d.kind === "timing" && d.value === "約2秒"));

  const koitoPiece = pieces.find((p) => p.dialogue.includes("逃げないで"));
  assert.ok(koitoPiece);
  const koito = firstCharacter(koitoPiece!)!;
  assert.equal(koito.attrs["表情"], "微笑");
  assert.equal(koito.attrs["声質"], "普通");
  assert.ok(koitoPiece!.decorators.some((d) => d.kind === "sound" && d.value.includes("呼びかける声")));
  assert.ok(koitoPiece!.decorators.some((d) => d.kind === "timing" && d.value === "少し間を置いて"));

  const last = pieces.find((p) => p.dialogue.includes("逃げるわけない"));
  assert.ok(last);
  assert.equal(firstCharacter(last!)?.attrs["声質"], "地声");
  assert.ok(last!.decorators.some((d) => d.kind === "sound" && d.value === "発車ベル"));
  assert.ok(last!.decorators.some((d) => d.kind === "position" && d.value === "遠方"));
});

test("examples/audio/station.mes: ランチへ has dialogue-less sound beat", () => {
  const text = readFileSync(join(root, "examples/audio/station.mes"), "utf8");
  const medo = parseMesLang(text);
  assert.ok(medo.body.sections.length >= 3);
  assert.equal(medo.body.sections[2]!.title, "ランチへ");
  const pieces = medo.body.sections[2]!.pieces;
  assert.ok(pieces.length >= 4);

  const silence = pieces.find((p) => p.dialogue.trim() === "");
  assert.ok(silence);
  assert.ok(silence!.decorators.some((d) => d.kind === "sound" && d.value.includes("雑踏")));
  assert.ok(silence!.decorators.some((d) => d.kind === "sound" && d.value.includes("信号")));
  assert.ok(silence!.decorators.some((d) => d.kind === "position" && d.value === "右寄り"));
  assert.ok(silence!.decorators.some((d) => d.kind === "timing" && d.value === "約1.5秒"));
  assert.ok(silence!.decorators.some((d) => d.kind === "comment" && d.value.includes("信号待ち")));

  const ask = pieces.find((p) => p.dialogue.includes("海鮮丼"));
  assert.ok(ask);
  assert.equal(firstCharacter(ask!)?.attrs["表情"], "微笑");
  assert.equal(firstCharacter(ask!)?.attrs["声質"], "普通");

  const reply = pieces.find((p) => p.dialogue.includes("例の店"));
  assert.ok(reply);
  assert.equal(firstCharacter(reply!)?.attrs["声質"], "少し高め");
  assert.ok(reply!.decorators.some((d) => d.kind === "timing" && d.value === "0:10"));
});

test("examples/audio/station.mes: 店の前 arrives with door chime", () => {
  const text = readFileSync(join(root, "examples/audio/station.mes"), "utf8");
  const medo = parseMesLang(text);
  assert.equal(medo.body.sections.length, 4);
  assert.equal(medo.body.sections[3]!.title, "店の前");
  const pieces = medo.body.sections[3]!.pieces;
  assert.ok(pieces.length >= 3);

  const arrive = pieces.find((p) => p.dialogue.trim() === "");
  assert.ok(arrive);
  assert.ok(arrive!.decorators.some((d) => d.kind === "sound" && d.value.includes("看板")));
  assert.ok(arrive!.decorators.some((d) => d.kind === "timing" && d.value === "約1秒"));
  assert.ok(arrive!.decorators.some((d) => d.kind === "comment" && d.value.includes("入り口")));

  const door = pieces.find((p) => p.dialogue.includes("着きました"));
  assert.ok(door);
  assert.equal(firstCharacter(door!)?.attrs["表情"], "微笑");
  assert.equal(firstCharacter(door!)?.attrs["声質"], "普通");
  assert.ok(door!.decorators.some((d) => d.kind === "sound" && d.value === "ドアチャイム"));
  assert.ok(door!.decorators.some((d) => d.kind === "timing" && d.value === "0:02"));

  const trapped = pieces.find((p) => p.dialogue.includes("逃げ場がない"));
  assert.ok(trapped);
  assert.equal(firstCharacter(trapped!)?.attrs["表情"], "苦笑い");
  assert.equal(firstCharacter(trapped!)?.attrs["声質"], "少し低め");
  assert.ok(trapped!.decorators.some((d) => d.kind === "sound" && d.value.includes("店内")));
  assert.ok(trapped!.decorators.some((d) => d.kind === "position" && d.value === "近づく"));
});
test("examples/manga/station-name.mes parses frames", () => {
  const text = readFileSync(join(root, "examples/manga/station-name.mes"), "utf8");
  const medo = parseMesLang(text);
  const pieces = medo.body.sections[0]!.pieces;
  const frames = pieces.flatMap((p) => p.decorators).filter((d) => d.kind === "frame");
  assert.ok(frames.length >= 9);
  assert.equal(frames.filter((d) => d.value === "6").length, 1);
  assert.equal(frames.filter((d) => d.value === "7").length, 1);
  assert.equal(frames.filter((d) => d.value === "8").length, 1);
  assert.equal(frames.filter((d) => d.value === "9").length, 1);
  // %6: same panel, two pieces (second has no %)
  const multiStart = pieces.findIndex((p) => p.decorators.some((d) => d.kind === "frame" && d.value === "6"));
  assert.ok(multiStart >= 0);
  const first = pieces[multiStart]!;
  const second = pieces[multiStart + 1]!;
  assert.equal(firstCharacter(first)?.value, "にか");
  assert.match(first.dialogue, /どこ行く/);
  assert.equal(firstCharacter(second)?.value, "こいと");
  assert.match(second.dialogue, /例の店/);
  assert.equal(
    second.decorators.some((d) => d.kind === "frame"),
    false,
  );
  // %7 ナレ / %8 外注ぎ / %9 入店（音声「店の前」の続き）
  const nare = pieces.find((p) => p.decorators.some((d) => d.kind === "frame" && d.value === "7"))!;
  const nareCh = firstCharacter(nare)!;
  assert.equal(nareCh.value, "ナレ");
  assert.equal(nareCh.attrs["吹き出し"], "ナレ");
  assert.match(nare.dialogue, /夕方の駅前/);
  const soto = pieces.find((p) => p.decorators.some((d) => d.kind === "frame" && d.value === "8"))!;
  const sotoCh = firstCharacter(soto)!;
  assert.equal(sotoCh.value, "店員");
  assert.equal(sotoCh.attrs["吹き出し"], "外注ぎ");
  assert.equal(sotoCh.attrs["表情"], "微笑");
  assert.equal(sotoCh.attrs["姿勢"], "店内から");
  assert.match(soto.dialogue, /いらっしゃいませ/);
  const enter = pieces.find((p) => p.decorators.some((d) => d.kind === "frame" && d.value === "9"))!;
  const enterCh = firstCharacter(enter)!;
  assert.equal(enterCh.value, "にか");
  assert.equal(enterCh.attrs["表情"], "苦笑い");
  assert.equal(enterCh.attrs["姿勢"], "戸に手");
  assert.equal(enterCh.attrs["吹き出し"], undefined);
  assert.match(enter.dialogue, /逃げ場がないな/);
  assert.ok(enter.decorators.some((d) => d.kind === "sound" && d.value.includes("ドアチャイム")));
  assert.ok(enter.decorators.some((d) => d.kind === "comment" && d.value.includes("店の前")));
});

test("glossary: コマとピース — same % keeps following pieces in one panel", () => {
  // docs/spec/05-glossary.md「コマとピース（まぎらわしいことば）」
  const glossary = readFileSync(join(root, "docs/spec/05-glossary.md"), "utf8");
  const section = glossary.slice(
    glossary.indexOf("## コマとピース"),
    glossary.indexOf("## タイミングとビート"),
  );
  assert.match(section, /1コマ＝1ピース/);
  assert.match(section, /先頭/);
  assert.match(section, /station-name\.mes/);

  const medo = parseMesLang(`profile: manga
----
== 1ページ

%6
^二人引き 横長
@にか
あ

@こいと
い
`);
  const pieces = medo.body.sections[0]!.pieces;
  assert.equal(pieces.length, 2);
  assert.ok(pieces[0]!.decorators.some((d) => d.kind === "frame" && d.value === "6"));
  assert.equal(pieces[1]!.decorators.some((d) => d.kind === "frame"), false);
  assert.equal(firstCharacter(pieces[0]!)?.value, "にか");
  assert.equal(firstCharacter(pieces[1]!)?.value, "こいと");

  const profile = readFileSync(join(root, "docs/spec/03-media-profiles.md"), "utf8");
  assert.match(profile, /同じコマに複数のセリフ/);
  const guide = readFileSync(join(root, "docs/spec/04-ai-reading.md"), "utf8");
  assert.match(guide, /コマとピース/);
  assert.match(guide, /1コマ＝1ピースは目安/);
});

test("examples/manga/silent-panels.mes: dialogue-less frames under == page", () => {
  const text = readFileSync(join(root, "examples/manga/silent-panels.mes"), "utf8");
  const medo = parseMesLang(text);
  assert.equal(medo.header.profile, "manga");
  assert.equal(medo.body.sections.length, 1);
  assert.equal(medo.body.sections[0]!.title, "1ページ");
  const pieces = medo.body.sections[0]!.pieces;
  assert.ok(pieces.length >= 8);
  for (const p of pieces) {
    assert.equal(p.dialogue.trim(), "");
    assert.ok(p.decorators.some((d) => d.kind === "frame"));
    assert.ok(p.decorators.some((d) => d.kind === "camera"));
  }
  const findBeat = pieces[5]!;
  assert.ok(findBeat.decorators.some((d) => d.kind === "frame" && d.value === "6"));
  assert.ok(
    findBeat.decorators.some(
      (d) => d.kind === "camera" && d.value.includes("にか横顔と柱の隙間"),
    ),
  );
  assert.ok(findBeat.decorators.some((d) => d.kind === "beat" && d.value.includes("見つける直前")));
  assert.ok(findBeat.decorators.some((d) => d.kind === "sound" && d.value.includes("雑踏")));
  const eyeContact = pieces[6]!;
  assert.ok(eyeContact.decorators.some((d) => d.kind === "frame" && d.value === "7"));
  assert.ok(
    eyeContact.decorators.some(
      (d) => d.kind === "camera" && d.value.includes("目線の高さ") && d.value.includes("1/2コマ"),
    ),
  );
  assert.ok(eyeContact.decorators.some((d) => d.kind === "beat" && d.value.includes("見つけた直後")));
  assert.ok(eyeContact.decorators.some((d) => d.kind === "comment" && d.value.includes("目が合う")));
  const last = pieces[pieces.length - 1]!;
  assert.ok(last.decorators.some((d) => d.kind === "frame" && d.value === "8"));
  assert.ok(
    last.decorators.some(
      (d) => d.kind === "camera" && d.value.includes("二人寄り") && d.value.includes("横長フル"),
    ),
  );
  assert.ok(last.decorators.some((d) => d.kind === "beat" && d.value.includes("声を出す直前")));
  assert.ok(last.decorators.some((d) => d.kind === "comment" && d.value.includes("口を開きかけ")));
  assert.ok(last.decorators.some((d) => d.kind === "sound" && d.value.includes("雑踏")));
});

test("examples/manga/station-two-pages.mes: == pages and % renumber", () => {
  const text = readFileSync(join(root, "examples/manga/station-two-pages.mes"), "utf8");
  const medo = parseMesLang(text);
  assert.equal(medo.header.profile, "manga");
  assert.equal(medo.header.title, "駅前の二人（2ページ）");
  assert.equal(medo.body.sections.length, 2);
  assert.equal(medo.body.sections[0]!.title, "1ページ");
  assert.equal(medo.body.sections[1]!.title, "2ページ");
  const page1 = medo.body.sections[0]!.pieces;
  const page2 = medo.body.sections[1]!.pieces;
  assert.ok(page1.length >= 4);
  assert.ok(page2.length >= 5);
  assert.ok(page1[0]!.decorators.some((d) => d.kind === "frame" && d.value === "1"));
  assert.ok(page2[0]!.decorators.some((d) => d.kind === "frame" && d.value === "1"));
  assert.ok(page2[0]!.decorators.some((d) => d.kind === "camera" && d.value.includes("改札を出て")));
  const nika = firstCharacter(page1[1]!)!;
  assert.equal(nika.attrs["表情"], "焦り");
  assert.equal(nika.attrs["姿勢"], "前のめり");
  const koitoThought = firstCharacter(page1[3]!)!;
  assert.equal(koitoThought.attrs["吹き出し"], "心の声");
  const silentBeat = page2[3]!;
  assert.equal(silentBeat.dialogue.trim(), "");
  assert.ok(silentBeat.decorators.some((d) => d.kind === "frame" && d.value === "4"));
  assert.ok(
    silentBeat.decorators.some((d) => d.kind === "camera" && d.value.includes("信号待ち")),
  );
  assert.ok(silentBeat.decorators.some((d) => d.kind === "beat"));
  assert.ok(
    silentBeat.decorators.some((d) => d.kind === "sound" && d.value.includes("歩行者信号")),
  );
  const last = page2[page2.length - 1]!;
  assert.equal(last.dialogue.trim(), "");
  assert.ok(last.decorators.some((d) => d.kind === "frame" && d.value === "5"));
  assert.ok(last.decorators.some((d) => d.kind === "beat"));
});

test("examples/manga/cafe-pose.mes: 表情 and 姿勢 on speakers", () => {
  const text = readFileSync(join(root, "examples/manga/cafe-pose.mes"), "utf8");
  const medo = parseMesLang(text);
  assert.equal(medo.header.profile, "manga");
  assert.equal(medo.header.title, "カフェ・表情と姿勢の練習");
  assert.equal(medo.body.sections[0]!.title, "1ページ");
  const pieces = medo.body.sections[0]!.pieces;
  assert.ok(pieces.length >= 9);
  const withAttrs = pieces
    .map((p) => firstCharacter(p))
    .filter((ch): ch is NonNullable<typeof ch> => ch != null && Object.keys(ch.attrs).length > 0);
  assert.ok(withAttrs.length >= 7);
  assert.ok(withAttrs.some((ch) => ch.attrs["表情"] === "ほっとした" && ch.attrs["姿勢"] === "椅子に沈む"));
  assert.ok(withAttrs.some((ch) => ch.attrs["表情"] === "微笑" && ch.attrs["姿勢"] === "肘をついて顎を支える"));
  assert.ok(withAttrs.some((ch) => ch.attrs["表情"] === "困り" && ch.attrs["姿勢"] === "前のめり"));
  assert.ok(withAttrs.some((ch) => ch.attrs["表情"] === "楽しそう" && ch.attrs["姿勢"] === "少し身を乗り出す"));
  assert.ok(withAttrs.some((ch) => ch.attrs["表情"] === "苦笑い" && ch.attrs["姿勢"] === "後ずさり気味"));
  assert.ok(withAttrs.some((ch) => ch.attrs["表情"] === "にやり" && ch.attrs["姿勢"] === "指を一本立てる"));
  assert.ok(withAttrs.some((ch) => ch.attrs["表情"] === "照れ" && ch.attrs["姿勢"] === "メニューに視線を落とす"));
  const reaction = pieces[6]!;
  assert.ok(reaction.decorators.some((d) => d.kind === "frame" && d.value === "7"));
  assert.ok(reaction.decorators.some((d) => d.kind === "comment" && d.value.includes("くすっと笑う")));
  const thought = pieces[7]!;
  assert.ok(thought.decorators.some((d) => d.kind === "frame" && d.value === "8"));
  const thoughtCh = firstCharacter(thought)!;
  assert.equal(thoughtCh.value, "にか");
  assert.equal(thoughtCh.attrs["表情"], "苦笑い");
  assert.equal(thoughtCh.attrs["姿勢"], "肩をすくめる");
  assert.equal(thoughtCh.attrs["吹き出し"], "心の声");
  assert.match(thought.dialogue, /甘いものなら負けてもいいか/);
  const spoken = pieces[8]!;
  assert.ok(spoken.decorators.some((d) => d.kind === "frame" && d.value === "9"));
  const spokenCh = firstCharacter(spoken)!;
  assert.equal(spokenCh.value, "にか");
  assert.equal(spokenCh.attrs["表情"], "照れ");
  assert.equal(spokenCh.attrs["姿勢"], "メニューに視線を落とす");
  assert.equal(spokenCh.attrs["吹き出し"], undefined);
  assert.match(spoken.dialogue, /じゃあ、任せた/);
});

test("manga: :吹き出し and 3rd bracket land on the same key", () => {
  const viaAttr = parseMesLang(`profile: manga
----
@こいと :表情 からかうように :姿勢 少し前傾 :吹き出し 心の声
セリフ
`);
  const viaBracket = parseMesLang(`profile: manga
----
@こいと[からかうように][少し前傾][心の声]
セリフ
`);
  const a = firstCharacter(viaAttr.body.sections[0]!.pieces[0]!)!;
  const b = firstCharacter(viaBracket.body.sections[0]!.pieces[0]!)!;
  assert.equal(a.attrs["表情"], "からかうように");
  assert.equal(a.attrs["姿勢"], "少し前傾");
  assert.equal(a.attrs["吹き出し"], "心の声");
  assert.deepEqual(a.attrs, b.attrs);
});

test("AI ネーム起こしガイド: cafe-pose %8–%9 / silent-panels %7–%8 fixtures stay linked", () => {
  const guide = readFileSync(join(root, "docs/spec/04-ai-reading.md"), "utf8");
  const nameRaising = guide.slice(
    guide.indexOf("### 漫画ネーム起こし"),
    guide.indexOf("### 漫画参考画像"),
  );
  assert.match(nameRaising, /吹き出し種別/);
  assert.match(nameRaising, /cafe-pose\.mes/);
  assert.match(nameRaising, /%8/);
  assert.match(nameRaising, /%9/);
  assert.match(nameRaising, /ふつうのセリフに戻る/);
  assert.match(nameRaising, /silent-panels\.mes/);
  assert.match(nameRaising, /%7/);
  assert.match(nameRaising, /声を出す直前/);
  assert.match(nameRaising, /station-name\.mes/);
  assert.match(nameRaising, /同じコマの二人セリフ/);
  assert.match(nameRaising, /ナレ/);
  assert.match(nameRaising, /外注ぎ/);
  assert.match(nameRaising, /入店の続き/);
  assert.match(nameRaising, /コマとピース/);
  assert.match(nameRaising, /勝手にセリフを足さない/);

  const cafe = parseMesLang(readFileSync(join(root, "examples/manga/cafe-pose.mes"), "utf8"));
  const cafePieces = cafe.body.sections[0]!.pieces;
  const cafeThought = cafePieces[7]!;
  assert.ok(cafeThought.decorators.some((d) => d.kind === "frame" && d.value === "8"));
  assert.equal(firstCharacter(cafeThought)!.attrs["吹き出し"], "心の声");
  const cafeSpoken = cafePieces.at(-1)!;
  assert.ok(cafeSpoken.decorators.some((d) => d.kind === "frame" && d.value === "9"));
  assert.equal(firstCharacter(cafeSpoken)!.attrs["吹き出し"], undefined);
  assert.match(cafeSpoken.dialogue, /じゃあ、任せた/);

  const silent = parseMesLang(readFileSync(join(root, "examples/manga/silent-panels.mes"), "utf8"));
  const silentPieces = silent.body.sections[0]!.pieces;
  const silentEye = silentPieces[6]!;
  assert.ok(silentEye.decorators.some((d) => d.kind === "frame" && d.value === "7"));
  assert.ok(
    silentEye.decorators.some(
      (d) => d.kind === "camera" && d.value.includes("目線の高さ") && d.value.includes("1/2コマ"),
    ),
  );
  assert.equal(silentEye.dialogue.trim(), "");
  const silentLast = silentPieces.at(-1)!;
  assert.ok(silentLast.decorators.some((d) => d.kind === "frame" && d.value === "8"));
  assert.ok(silentLast.decorators.some((d) => d.kind === "beat" && d.value.includes("声を出す直前")));
  assert.equal(silentLast.dialogue.trim(), "");

  const station = parseMesLang(readFileSync(join(root, "examples/manga/station-name.mes"), "utf8"));
  const stationPieces = station.body.sections[0]!.pieces;
  assert.equal(firstCharacter(stationPieces.find((p) => p.decorators.some((d) => d.kind === "frame" && d.value === "7"))!)!.attrs["吹き出し"], "ナレ");
  assert.equal(firstCharacter(stationPieces.find((p) => p.decorators.some((d) => d.kind === "frame" && d.value === "8"))!)!.attrs["吹き出し"], "外注ぎ");
  const stationEnter = stationPieces.find((p) => p.decorators.some((d) => d.kind === "frame" && d.value === "9"))!;
  assert.equal(firstCharacter(stationEnter)!.attrs["吹き出し"], undefined);
  assert.match(stationEnter.dialogue, /逃げ場がないな/);
});

test("AI ガイド: 全角行頭記号（％＾＊含む）を半角と同じと明記", () => {
  const guide = readFileSync(join(root, "docs/spec/04-ai-reading.md"), "utf8");
  const basic = guide.slice(
    guide.indexOf("## 読み手（AI）への基本指示"),
    guide.indexOf("## 著者側の書き方"),
  );
  assert.match(basic, /全角の行頭記号/);
  assert.match(basic, /％＾＊/);
  assert.match(basic, /半角と同じ意味/);

  const writing = guide.slice(
    guide.indexOf("## AI に MesLang を書かせるとき"),
    guide.indexOf("## おすすめの実務の順番"),
  );
  assert.match(writing, /半角/);
  assert.match(writing, /誤り/);

  const gap = guide.slice(
    guide.indexOf("### 不足情報の洗い出し"),
    guide.indexOf("### 旧 Mes 取り込みの手伝い"),
  );
  assert.match(gap, /全角の行頭記号/);
  assert.match(gap, /未知の記号/);
  assert.match(gap, /cut: ""/);
  assert.match(gap, /形チェック結果の読み方/);

  const importHelp = guide.slice(
    guide.indexOf("### 旧 Mes 取り込みの手伝い"),
    guide.indexOf("### アニメ字コンテ起こし"),
  );
  assert.match(importHelp, /全角の行頭記号/);
});

test("AI ガイド: カット表ひな形に番号なし行と形チェック結果の読み方", () => {
  const guide = readFileSync(join(root, "docs/spec/04-ai-reading.md"), "utf8");
  const tidy = guide.slice(
    guide.indexOf("### カット表への整理"),
    guide.indexOf("### カット表の形チェック結果の読み方"),
  );
  assert.match(tidy, /cut: ""/);
  assert.match(tidy, /attrs/);
  assert.match(tidy, /番号なし/);
  assert.match(tidy, /Markdown／CSV/);

  const shapeRead = guide.slice(
    guide.indexOf("### カット表の形チェック結果の読み方"),
    guide.indexOf("### アニメ原稿を書かせるとき"),
  );
  assert.match(shapeRead, /--conte --validate/);
  assert.match(shapeRead, /箱の名前と型/);
  assert.match(shapeRead, /cut: ""/);
  assert.match(shapeRead, /空配列/);
  assert.match(shapeRead, /dialogues への attrs/);
  assert.match(shapeRead, /提案:/);
  assert.match(shapeRead, /不足:/);
});

test("AI ガイド: Medo 形チェック結果の読み方と属性のつき先", () => {
  const guide = readFileSync(join(root, "docs/spec/04-ai-reading.md"), "utf8");

  const writing = guide.slice(
    guide.indexOf("## AI に MesLang を書かせるとき"),
    guide.indexOf("## おすすめの実務の順番"),
  );
  assert.match(writing, /直前のデコレーターの直後/);
  assert.match(writing, /属性のつき先/);

  const gap = guide.slice(
    guide.indexOf("### 不足情報の洗い出し"),
    guide.indexOf("### Medo の形チェック結果の読み方"),
  );
  assert.match(gap, /ピース先頭やセリフのあと/);
  assert.match(gap, /属性に付いていない/);
  assert.match(gap, /Medo の形チェック結果の読み方/);

  const medoRead = guide.slice(
    guide.indexOf("### Medo の形チェック結果の読み方"),
    guide.indexOf("### 旧 Mes 取り込みの手伝い"),
  );
  assert.match(medoRead, /--validate/);
  assert.match(medoRead, /箱の名前と型/);
  assert.match(medoRead, /dialogue が空文字/);
  assert.match(medoRead, /孤立した :key/);
  assert.match(medoRead, /ピース直下への attrs/);
  assert.match(medoRead, /kind unknown/);
  assert.match(medoRead, /提案:/);
  assert.match(medoRead, /不足:/);

  const mangaWrite = guide.slice(
    guide.indexOf("### 漫画ネーム原稿を書かせるとき"),
    guide.indexOf("### 不足情報の洗い出し"),
  );
  assert.match(mangaWrite, /@話者 の直後/);
  assert.match(mangaWrite, /属性のつき先/);

  const compat = readFileSync(join(root, "docs/spec/06-mes-compat.md"), "utf8");
  assert.match(compat, /Medo の形チェック結果の読み方/);

  const glossary = readFileSync(join(root, "docs/spec/05-glossary.md"), "utf8");
  const shapeSection = glossary.slice(
    glossary.indexOf("## 形チェックと目視"),
    glossary.indexOf("## カット表の形チェックの縁"),
  );
  assert.match(shapeSection, /medo-の形チェック結果の読み方/);
  assert.match(shapeSection, /カット表の形チェック結果の読み方/);
});
