import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { doFlat, firstCharacter, parseMesLang } from "../src/parse.ts";
import { rewriteMesCompat } from "../src/mesCompat.ts";

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

test("doFlat: row-start // is not dialogue sugar", () => {
  // docs/spec/01-core.md + glossary コメントアウト（行頭だけ）
  const commented = doFlat(`//にか「消えてはいけない」
@こいと
残る。
`);
  assert.match(commented, /^\/\/にか「消えてはいけない」$/m);
  assert.doesNotMatch(commented, /@\/\/にか/);
  assert.doesNotMatch(commented, /@にか/);

  const medo = parseMesLang(`//にか「消えてはいけない」

@こいと
残る。
`);
  const pieces = medo.body.sections[0]!.pieces;
  assert.equal(pieces.length, 1);
  assert.equal(firstCharacter(pieces[0]!)?.value, "こいと");
  assert.equal(pieces[0]!.dialogue, "残る。");
  assert.equal(
    pieces.some((p) => p.dialogue.includes("消えてはいけない")),
    false,
  );
});

test("row-start // is skipped; mid-line // stays in dialogue and $", () => {
  const medo = parseMesLang(`profile: audio
----
// この行は読み飛ばす
@にか
あ、キタキタ。 // メモはセリフに残る
$雑踏 // 音の値にも残る
!正面
`);
  const piece = medo.body.sections[0]!.pieces[0]!;
  assert.equal(firstCharacter(piece)?.value, "にか");
  assert.equal(piece.dialogue, "あ、キタキタ。 // メモはセリフに残る");
  assert.equal(piece.decorators.find((d) => d.kind === "sound")?.value, "雑踏 // 音の値にも残る");
  assert.equal(piece.decorators.find((d) => d.kind === "position")?.value, "正面");
});

test("glossary: コメントアウトは行頭だけ — mid-line // stays", () => {
  // docs/spec/05-glossary.md「コメントアウト（行頭だけ）（まぎらわしいことば）」
  const glossary = readFileSync(join(root, "docs/spec/05-glossary.md"), "utf8");
  const section = glossary.slice(
    glossary.indexOf("## コメントアウト（行頭だけ）"),
    glossary.indexOf("## 取り込みの三段階"),
  );
  assert.match(section, /コメントアウト（行頭だけ）/);
  assert.match(section, /行頭/);
  assert.match(section, /途中/);
  assert.match(section, /DeleteCommentout|旧 Mes/);
  assert.match(section, /--compat/);
  assert.match(section, /セリフに残る/);

  const core = readFileSync(join(root, "docs/spec/01-core.md"), "utf8");
  assert.match(core, /行の途中/);
  assert.match(core, /コメントアウト行頭だけまぎらわしいことば/);

  const compat = readFileSync(join(root, "docs/spec/06-mes-compat.md"), "utf8");
  assert.match(compat, /コメントアウトは行頭だけ/);
  assert.match(compat, /DeleteCommentout/);
  assert.match(compat, /途中の `\/\/` を互換レイヤで削ること/);

  const guide = readFileSync(join(root, "docs/spec/04-ai-reading.md"), "utf8");
  const basic = guide.slice(
    guide.indexOf("## 読み手（AI）への基本指示"),
    guide.indexOf("## 著者側の書き方"),
  );
  assert.match(basic, /途中の \/\//);

  const importHelp = guide.slice(
    guide.indexOf("### 旧 Mes 取り込みの手伝い"),
    guide.indexOf("### アニメ字コンテ起こし"),
  );
  assert.match(importHelp, /途中の \/\/|行頭の \/\//);
  assert.match(importHelp, /コメントアウト行頭だけまぎらわしいことば/);

  const gap = guide.slice(
    guide.indexOf("### 不足情報の洗い出し"),
    guide.indexOf("### Medo の形チェック結果の読み方"),
  );
  assert.match(gap, /途中の \/\//);

  const overview = readFileSync(join(root, "docs/spec/00-overview.md"), "utf8");
  assert.match(overview, /コメントアウト（行頭だけ/);

  const profiles = readFileSync(join(root, "docs/spec/03-media-profiles.md"), "utf8");
  assert.match(profiles, /コメントアウト行頭だけまぎらわしいことば/);

  const audioReadme = readFileSync(join(root, "examples/audio/README.md"), "utf8");
  assert.match(audioReadme, /コメントアウト行頭だけまぎらわしいことば/);

  const decorators = readFileSync(join(root, "docs/spec/02-decorators.md"), "utf8");
  assert.match(decorators, /コメントアウト行頭だけまぎらわしいことば/);

  const adrReadme = readFileSync(join(root, "docs/decisions/README.md"), "utf8");
  assert.match(adrReadme, /コメントアウトは行頭/);

  const adr0006 = readFileSync(join(root, "docs/decisions/0006-mes-compat-import.md"), "utf8");
  assert.match(adr0006, /途中の `\/\/`/);
  assert.match(adr0006, /DeleteCommentout/);

  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  assert.match(changelog, /0\.0\.78/);
  assert.match(changelog, /行頭 `\/\/` だけ/);

  const roadmap = readFileSync(join(root, "docs/roadmap.md"), "utf8");
  assert.match(roadmap, /コメントアウトは行頭/);

  const backlog = readFileSync(join(root, "automation/backlog.md"), "utf8");
  assert.match(backlog, /コメントアウトは行頭/);
  const glossaryWont = glossary.slice(glossary.indexOf("## 採用しない"));
  assert.match(glossaryWont, /途中の `\/\/`/);
  assert.match(backlog, /途中の `\/\/` を互換レイヤで削ること/);

  for (const rel of [
    "examples/audio/mes-import-before.mes",
    "examples/audio/mes-import-compat-only.mes",
    "examples/audio/mes-import-after.mes",
  ]) {
    const text = readFileSync(join(root, rel), "utf8");
    assert.match(text, /^\/\/ 取り込みメモ：柱は○で書いてある$/m);
    assert.match(text, /\/\/ 旧メモ/);
    assert.match(text, /\$雑踏 \/\/ 大きめ/);
    // Closing-quote-then-// would skip 名前「」 sugar; samples keep // inside quotes / $ lines.
    assert.doesNotMatch(text, /」\s*\/\//);
  }

  const before = readFileSync(join(root, "examples/audio/mes-import-before.mes"), "utf8");
  const mid = readFileSync(join(root, "examples/audio/mes-import-compat-only.mes"), "utf8");
  assert.equal(rewriteMesCompat(before), mid);

  const afterMedo = parseMesLang(
    readFileSync(join(root, "examples/audio/mes-import-after.mes"), "utf8"),
  );
  const afterPieces = afterMedo.body.sections.flatMap((s) => s.pieces);
  assert.equal(
    afterPieces.some((p) => p.dialogue.includes("取り込みメモ")),
    false,
  );
  const afterNika = afterPieces.find((p) => p.dialogue.includes("キタキタ"));
  assert.ok(afterNika);
  assert.match(afterNika!.dialogue, /\/\/ 旧メモ/);
  assert.ok(
    afterNika!.decorators.some((d) => d.kind === "sound" && d.value === "雑踏 // 大きめ"),
  );
});

test("doFlat: // after closing quote is not 名前「」 sugar", () => {
  // docs/spec/01-core.md + glossary コメントアウト（行頭だけ）
  // Sugar requires the line to end at 」. Trailing // after the quote is leftover dialogue.
  const trailing = doFlat(`にか「あ、キタキタ。」 // 旧メモ
`);
  assert.doesNotMatch(trailing, /^@にか/m);
  assert.match(trailing, /にか「あ、キタキタ。」 \/\/ 旧メモ/);

  const inside = doFlat(`にか「あ、キタキタ。 // 旧メモ」
`);
  assert.match(inside, /^@にか$/m);
  assert.match(inside, /^あ、キタキタ。 \/\/ 旧メモ$/m);

  const medo = parseMesLang(`にか「あ、キタキタ。」 // 旧メモ
`);
  const piece = medo.body.sections[0]!.pieces[0]!;
  assert.equal(firstCharacter(piece), undefined);
  assert.match(piece.dialogue, /にか「あ、キタキタ。」 \/\/ 旧メモ/);
});

test("glossary: 閉じかぎのあとの // は糖衣しない — 0.0.79 samples", () => {
  const glossary = readFileSync(join(root, "docs/spec/05-glossary.md"), "utf8");
  const section = glossary.slice(
    glossary.indexOf("## コメントアウト（行頭だけ）"),
    glossary.indexOf("## 取り込みの三段階"),
  );
  assert.match(section, /閉じかぎ/);
  assert.match(section, /糖衣/);
  assert.match(section, /かぎかっこ内/);

  const core = readFileSync(join(root, "docs/spec/01-core.md"), "utf8");
  assert.match(core, /閉じかぎ/);
  assert.match(core, /糖衣/);

  const compat = readFileSync(join(root, "docs/spec/06-mes-compat.md"), "utf8");
  assert.match(compat, /閉じかぎ/);
  assert.match(compat, /こう書くと @ になりません/);

  const guide = readFileSync(join(root, "docs/spec/04-ai-reading.md"), "utf8");
  const basic = guide.slice(
    guide.indexOf("## 読み手（AI）への基本指示"),
    guide.indexOf("## 著者側の書き方"),
  );
  assert.match(basic, /閉じかぎ/);

  const importHelp = guide.slice(
    guide.indexOf("### 旧 Mes 取り込みの手伝い"),
    guide.indexOf("### アニメ字コンテ起こし"),
  );
  assert.match(importHelp, /閉じかぎ/);

  const gap = guide.slice(
    guide.indexOf("### 不足情報の洗い出し"),
    guide.indexOf("### Medo の形チェック結果の読み方"),
  );
  assert.match(gap, /閉じかぎ/);

  const overview = readFileSync(join(root, "docs/spec/00-overview.md"), "utf8");
  assert.match(overview, /閉じかぎのあとだと糖衣しない/);

  const profiles = readFileSync(join(root, "docs/spec/03-media-profiles.md"), "utf8");
  assert.match(profiles, /閉じかぎ/);

  const audioReadme = readFileSync(join(root, "examples/audio/README.md"), "utf8");
  assert.match(audioReadme, /閉じかぎ/);
  assert.match(audioReadme, /途中の `\/\/`（かぎかっこ内と `\$` 行）/);

  const decorators = readFileSync(join(root, "docs/spec/02-decorators.md"), "utf8");
  assert.match(decorators, /閉じかぎ/);

  const adrReadme = readFileSync(join(root, "docs/decisions/README.md"), "utf8");
  assert.match(adrReadme, /閉じかぎ/);

  const adr0006 = readFileSync(join(root, "docs/decisions/0006-mes-compat-import.md"), "utf8");
  assert.match(adr0006, /途中の `\/\/` を実例化/);
  assert.match(adr0006, /閉じかぎ/);

  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  assert.match(changelog, /0\.0\.79/);
  assert.match(changelog, /閉じかぎ/);

  const roadmap = readFileSync(join(root, "docs/roadmap.md"), "utf8");
  assert.match(roadmap, /月曜夜.*途中の `\/\/` を実例化/);

  const backlog = readFileSync(join(root, "automation/backlog.md"), "utf8");
  assert.match(backlog, /月曜夜.*途中の `\/\/` を実例化/);
  assert.match(backlog, /水曜向け/);
  const glossaryWont = glossary.slice(glossary.indexOf("## 採用しない"));
  assert.match(glossaryWont, /途中の `\/\/` を互換レイヤで削ること/);
  assert.match(backlog, /途中の `\/\/` を互換レイヤで削ること/);
  assert.match(backlog, /カット表の Markdown／CSV/);
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
    glossary.indexOf("## Medo の形チェックの縁"),
  );
  assert.match(section, /箱の名前と型/);
  assert.match(section, /目視/);
  assert.match(section, /不足の洗い出し/);
  assert.match(section, /欄の名前と型/);
  assert.match(section, /品質チェック/);
  assert.match(section, /Medo でよく迷う縁/);

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

test("glossary: Medo の形チェックの縁 — empty arrays and dialogue are valid", () => {
  // docs/spec/05-glossary.md「Medo の形チェックの縁（まぎらわしいことば）」
  const glossary = readFileSync(join(root, "docs/spec/05-glossary.md"), "utf8");
  const section = glossary.slice(
    glossary.indexOf("## Medo の形チェックの縁"),
    glossary.indexOf("## カット表の形チェックの縁"),
  );
  assert.match(section, /空のセクション列/);
  assert.match(section, /sections: \[\]/);
  assert.match(section, /空のピース列/);
  assert.match(section, /pieces: \[\]/);
  assert.match(section, /空のデコレーター列/);
  assert.match(section, /decorators: \[\]/);
  assert.match(section, /空セリフ/);
  assert.match(section, /dialogue: ""/);
  assert.match(section, /attrs: \{\}/);
  assert.match(section, /余分なキー/);
  assert.match(section, /ピース直下/);
  assert.match(section, /rawMark/);
  assert.match(section, /kind `unknown`/);
  assert.match(section, /%10/);
  assert.match(section, /コマとピース/);
  assert.match(section, /空と欠け/);
  assert.match(section, /ヘッダーの縁/);
  assert.match(section, /`profile` なし/);
  assert.match(section, /`dialogue` キーなし/);

  const medoSchema = readFileSync(join(root, "schema/medo.schema.json"), "utf8");
  assert.match(medoSchema, /空の sections/);
  assert.match(medoSchema, /正しい縁/);
  assert.match(medoSchema, /必須箱の欠け/);
  assert.match(medoSchema, /rawMark なし/);
  assert.match(medoSchema, /profile なし/);
  assert.match(medoSchema, /unknown/);

  const guide = readFileSync(join(root, "docs/spec/04-ai-reading.md"), "utf8");
  assert.match(guide, /Medo の形チェックの縁/);
  assert.match(guide, /pieces \/ sections が \[\]/);

  const overview = readFileSync(join(root, "docs/spec/00-overview.md"), "utf8");
  assert.match(overview, /Medo の形チェックの縁/);

  const compat = readFileSync(join(root, "docs/spec/06-mes-compat.md"), "utf8");
  assert.match(compat, /Medo の形チェックの縁/);

  const adrReadme = readFileSync(join(root, "docs/decisions/README.md"), "utf8");
  assert.match(adrReadme, /Medo の形チェックの縁/);

  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  assert.match(changelog, /0\.0\.70/);
  assert.match(changelog, /0\.0\.69/);
  assert.match(changelog, /空と欠け|必須箱の欠け/);
  assert.match(changelog, /0\.0\.68/);
  assert.match(changelog, /Medo の形チェックの縁/);
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
  assert.match(section, /空と欠け/);
  assert.match(section, /`cut` キーなし/);

  const conteDoc = readFileSync(join(root, "docs/spec/07-conte-table.md"), "utf8");
  assert.match(conteDoc, /形チェックが見る縁/);
  assert.match(conteDoc, /cut: ""/);
  assert.match(conteDoc, /dialogues\[\]\.speaker/);
  assert.match(conteDoc, /`cut` キーなし/);
  assert.match(conteDoc, /`dialogues` キーなし/);

  const conteSchema = readFileSync(join(root, "schema/conte-table.schema.json"), "utf8");
  assert.match(conteSchema, /番号なし/);
  assert.match(conteSchema, /空配列/);
  assert.match(conteSchema, /必須箱の欠け/);
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
  assert.ok(medo.body.sections.length >= 4);
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

test("examples/audio/station.mes: 席について is interior after arrival beat", () => {
  const text = readFileSync(join(root, "examples/audio/station.mes"), "utf8");
  const medo = parseMesLang(text);
  assert.ok(medo.body.sections.length >= 5);
  assert.equal(medo.body.sections[4]!.title, "席について");
  const pieces = medo.body.sections[4]!.pieces;
  assert.ok(pieces.length >= 3);

  const enter = pieces.find((p) => p.dialogue.trim() === "");
  assert.ok(enter);
  assert.ok(enter!.decorators.some((d) => d.kind === "sound" && d.value.includes("ドアが閉まる")));
  assert.ok(enter!.decorators.some((d) => d.kind === "sound" && d.value.includes("店内BGM")));
  assert.ok(enter!.decorators.some((d) => d.kind === "timing" && d.value === "約1秒"));
  assert.ok(enter!.decorators.some((d) => d.kind === "comment" && d.value.includes("到着の拍のあと")));

  const seat = pieces.find((p) => p.dialogue.includes("窓際"));
  assert.ok(seat);
  assert.equal(firstCharacter(seat!)?.attrs["表情"], "微笑");
  assert.equal(firstCharacter(seat!)?.attrs["声質"], "普通");
  assert.ok(seat!.decorators.some((d) => d.kind === "sound" && d.value.includes("椅子")));
  assert.ok(seat!.decorators.some((d) => d.kind === "position" && d.value === "左寄り"));
  assert.ok(seat!.decorators.some((d) => d.kind === "timing" && d.value === "0:03"));

  const heavy = pieces.find((p) => p.dialogue.includes("足が重い"));
  assert.ok(heavy);
  assert.equal(firstCharacter(heavy!)?.attrs["表情"], "苦笑い");
  assert.equal(firstCharacter(heavy!)?.attrs["声質"], "少し声を落として");
  assert.ok(heavy!.decorators.some((d) => d.kind === "sound" && d.value.includes("食器")));
  assert.ok(heavy!.decorators.some((d) => d.kind === "position" && d.value === "右寄り"));
});

test("examples/audio/station.mes: 注文 is interior after seating", () => {
  const text = readFileSync(join(root, "examples/audio/station.mes"), "utf8");
  const medo = parseMesLang(text);
  assert.ok(medo.body.sections.length >= 6);
  assert.equal(medo.body.sections[5]!.title, "注文");
  const pieces = medo.body.sections[5]!.pieces;
  assert.ok(pieces.length >= 4);

  const wait = pieces.find((p) => p.dialogue.trim() === "");
  assert.ok(wait);
  assert.ok(wait!.decorators.some((d) => d.kind === "sound" && d.value.includes("厨房")));
  assert.ok(wait!.decorators.some((d) => d.kind === "position" && d.value === "奥"));
  assert.ok(wait!.decorators.some((d) => d.kind === "timing" && d.value === "約1秒"));
  assert.ok(wait!.decorators.some((d) => d.kind === "comment" && d.value.includes("席に着いたあと")));

  const staff = pieces.find((p) => p.dialogue.includes("ご注文"));
  assert.ok(staff);
  assert.equal(firstCharacter(staff!)?.value, "店員");
  assert.equal(firstCharacter(staff!)?.attrs["表情"], "微笑");
  assert.equal(firstCharacter(staff!)?.attrs["声質"], "普通");
  assert.equal(firstCharacter(staff!)?.attrs["吹き出し"], undefined);
  assert.ok(staff!.decorators.some((d) => d.kind === "sound" && d.value.includes("伝票")));
  assert.ok(staff!.decorators.some((d) => d.kind === "position" && d.value === "右寄り"));
  assert.ok(staff!.decorators.some((d) => d.kind === "timing" && d.value === "0:02"));

  const order = pieces.find((p) => p.dialogue.includes("いつもので"));
  assert.ok(order);
  assert.equal(firstCharacter(order!)?.value, "こいと");
  assert.equal(firstCharacter(order!)?.attrs["表情"], "にやり");
  assert.equal(firstCharacter(order!)?.attrs["声質"], "普通");
  assert.ok(order!.decorators.some((d) => d.kind === "sound" && d.value.includes("ざわめき")));
  assert.ok(order!.decorators.some((d) => d.kind === "position" && d.value === "左寄り"));

  const nika = pieces.find((p) => p.dialogue.includes("注文まで来たか"));
  assert.ok(nika);
  assert.equal(firstCharacter(nika!)?.value, "にか");
  assert.equal(firstCharacter(nika!)?.attrs["表情"], "苦笑い");
  assert.equal(firstCharacter(nika!)?.attrs["声質"], "少し声を落として");
  assert.ok(nika!.decorators.some((d) => d.kind === "sound" && d.value.includes("鉛筆")));
  assert.ok(nika!.decorators.some((d) => d.kind === "position" && d.value === "近づく"));
});

test("glossary: 到着の拍 — audio 店の前 vs manga %8–%9", () => {
  // docs/spec/05-glossary.md「到着の拍（まぎらわしいことば）」
  const glossary = readFileSync(join(root, "docs/spec/05-glossary.md"), "utf8");
  const section = glossary.slice(
    glossary.indexOf("## 到着の拍"),
    glossary.indexOf("## 到着の拍と店内"),
  );
  assert.match(section, /到着の拍/);
  assert.match(section, /店の前/);
  assert.match(section, /外注ぎ/);
  assert.match(section, /入店/);
  assert.match(section, /%8/);
  assert.match(section, /%9/);
  assert.match(section, /吹き出し種別/);
  assert.match(section, /音だけの間/);
  assert.match(section, /入店とふつうのセリフに戻る/);
  assert.match(section, /席について/);
  assert.match(section, /到着の拍と店内/);

  const audio = parseMesLang(readFileSync(join(root, "examples/audio/station.mes"), "utf8"));
  assert.equal(audio.body.sections[3]!.title, "店の前");
  assert.ok(audio.body.sections[3]!.pieces.some((p) => p.dialogue.includes("逃げ場がない")));

  const manga = parseMesLang(readFileSync(join(root, "examples/manga/station-name.mes"), "utf8"));
  const pieces = manga.body.sections[0]!.pieces;
  const outside = pieces.find((p) => p.decorators.some((d) => d.kind === "frame" && d.value === "8"))!;
  const enter = pieces.find((p) => p.decorators.some((d) => d.kind === "frame" && d.value === "9"))!;
  assert.equal(firstCharacter(outside)!.attrs["吹き出し"], "外注ぎ");
  assert.equal(firstCharacter(enter)!.attrs["吹き出し"], undefined);
  assert.match(enter.dialogue, /逃げ場がない/);
  assert.ok(enter.decorators.some((d) => d.kind === "sound" && d.value.includes("ドアチャイム")));
  assert.ok(enter.decorators.some((d) => d.kind === "comment" && d.value.includes("店の前")));

  const audioReadme = readFileSync(join(root, "examples/audio/README.md"), "utf8");
  assert.match(audioReadme, /到着の拍/);
  assert.match(audioReadme, /用語集（到着の拍）/);
  assert.match(audioReadme, /席について/);
  assert.match(audioReadme, /用語集（到着の拍と店内）/);

  const mangaReadme = readFileSync(join(root, "examples/manga/README.md"), "utf8");
  assert.match(mangaReadme, /到着の拍/);
  assert.match(mangaReadme, /%8`–`%9/);

  const profiles = readFileSync(join(root, "docs/spec/03-media-profiles.md"), "utf8");
  assert.match(profiles, /到着の拍/);
  assert.match(profiles, /席について/);
  assert.match(profiles, /用語集（到着の拍と店内）/);

  const guide = readFileSync(join(root, "docs/spec/04-ai-reading.md"), "utf8");
  assert.match(guide, /到着の拍/);
  assert.match(guide, /用語集（到着の拍）/);
  assert.match(guide, /席について/);
  assert.match(guide, /用語集（到着の拍と店内）/);

  const overview = readFileSync(join(root, "docs/spec/00-overview.md"), "utf8");
  assert.match(overview, /到着の拍/);
  assert.match(overview, /到着の拍と店内/);
});

test("glossary: 到着の拍と店内 — 席について is after arrival", () => {
  // docs/spec/05-glossary.md「到着の拍と店内（まぎらわしいことば）」
  const glossary = readFileSync(join(root, "docs/spec/05-glossary.md"), "utf8");
  const section = glossary.slice(
    glossary.indexOf("## 到着の拍と店内"),
    glossary.indexOf("## 店内の続きと注文"),
  );
  assert.match(section, /到着の拍と店内/);
  assert.match(section, /席について/);
  assert.match(section, /注文/);
  assert.match(section, /店内の続き/);
  assert.match(section, /店内BGM/);
  assert.match(section, /入店/);
  assert.match(section, /%10/);
  assert.match(section, /%11/);
  assert.match(section, /到着の拍/);
  assert.match(section, /席の店員/);
  assert.match(section, /外注ぎ/);
  assert.match(section, /任せたあと/);
  assert.doesNotMatch(section, /欠落/);

  const audio = parseMesLang(readFileSync(join(root, "examples/audio/station.mes"), "utf8"));
  assert.equal(audio.body.sections[4]!.title, "席について");
  assert.equal(audio.body.sections[5]!.title, "注文");
  assert.ok(audio.body.sections[4]!.pieces.some((p) => p.dialogue.includes("窓際")));
  assert.ok(
    audio.body.sections[4]!.pieces.some((p) =>
      p.decorators.some((d) => d.kind === "sound" && d.value.includes("店内BGM")),
    ),
  );
  const orderSec = audio.body.sections[5]!;
  const staff = orderSec.pieces.find((p) => p.dialogue.includes("ご注文"))!;
  assert.equal(firstCharacter(staff)?.value, "店員");
  assert.equal(firstCharacter(staff)?.attrs["吹き出し"], undefined);
  assert.ok(orderSec.pieces.some((p) => p.dialogue.includes("いつもので")));
  assert.ok(orderSec.pieces.some((p) => p.dialogue.includes("注文まで来たか")));

  const manga = parseMesLang(readFileSync(join(root, "examples/manga/station-name.mes"), "utf8"));
  const pieces = manga.body.sections[0]!.pieces;
  const interiorStart = pieces.findIndex((p) =>
    p.decorators.some((d) => d.kind === "frame" && d.value === "10"),
  );
  assert.ok(interiorStart >= 0);
  const seat = pieces[interiorStart]!;
  const heavy = pieces[interiorStart + 1]!;
  assert.equal(firstCharacter(seat)?.value, "こいと");
  assert.equal(firstCharacter(seat)?.attrs["表情"], "微笑");
  assert.equal(firstCharacter(seat)?.attrs["姿勢"], "椅子を引く");
  assert.equal(firstCharacter(seat)?.attrs["吹き出し"], undefined);
  assert.match(seat.dialogue, /窓際/);
  assert.ok(seat.decorators.some((d) => d.kind === "sound" && d.value.includes("店内BGM")));
  assert.ok(seat.decorators.some((d) => d.kind === "comment" && d.value.includes("席について")));
  assert.equal(firstCharacter(heavy)?.value, "にか");
  assert.match(heavy.dialogue, /足が重い/);
  assert.equal(
    heavy.decorators.some((d) => d.kind === "frame"),
    false,
  );

  const orderStart = pieces.findIndex((p) =>
    p.decorators.some((d) => d.kind === "frame" && d.value === "11"),
  );
  assert.ok(orderStart >= 0);
  const staffSeat = pieces[orderStart]!;
  const usual = pieces[orderStart + 1]!;
  const nikaOrder = pieces[orderStart + 2]!;
  assert.equal(firstCharacter(staffSeat)?.value, "店員");
  assert.equal(firstCharacter(staffSeat)?.attrs["吹き出し"], undefined);
  assert.match(staffSeat.dialogue, /ご注文/);
  assert.ok(staffSeat.decorators.some((d) => d.kind === "comment" && d.value.includes("注文")));
  assert.equal(firstCharacter(usual)?.value, "こいと");
  assert.match(usual.dialogue, /いつもので/);
  assert.equal(
    usual.decorators.some((d) => d.kind === "frame"),
    false,
  );
  assert.equal(firstCharacter(nikaOrder)?.value, "にか");
  assert.match(nikaOrder.dialogue, /注文まで来たか/);
  assert.equal(
    nikaOrder.decorators.some((d) => d.kind === "frame"),
    false,
  );

  const overview = readFileSync(join(root, "docs/spec/00-overview.md"), "utf8");
  assert.match(overview, /到着の拍と店内/);
  assert.match(overview, /%10/);
  assert.match(overview, /%11/);
  assert.match(overview, /注文/);

  const profiles = readFileSync(join(root, "docs/spec/03-media-profiles.md"), "utf8");
  assert.match(profiles, /用語集（到着の拍と店内）/);
  assert.match(profiles, /%10/);
  assert.match(profiles, /%11/);
  assert.match(profiles, /注文/);

  const guide = readFileSync(join(root, "docs/spec/04-ai-reading.md"), "utf8");
  assert.match(guide, /用語集（到着の拍と店内）/);
  assert.match(guide, /%10/);
  assert.match(guide, /%11/);
  assert.match(guide, /「注文」/);

  const audioReadme = readFileSync(join(root, "examples/audio/README.md"), "utf8");
  assert.match(audioReadme, /用語集（到着の拍と店内）/);
  assert.match(audioReadme, /%10/);
  assert.match(audioReadme, /%11/);
  assert.match(audioReadme, /六場面目「注文」/);
  assert.match(audioReadme, /席の店員/);

  const mangaReadme = readFileSync(join(root, "examples/manga/README.md"), "utf8");
  assert.match(mangaReadme, /%10/);
  assert.match(mangaReadme, /%11/);
  assert.match(mangaReadme, /席について/);
  assert.match(mangaReadme, /用語集（到着の拍と店内）/);

  const adrReadme = readFileSync(join(root, "docs/decisions/README.md"), "utf8");
  assert.match(adrReadme, /席について/);
  assert.match(adrReadme, /到着の拍と店内/);
  assert.match(adrReadme, /%10/);
  assert.match(adrReadme, /%11/);
  assert.match(adrReadme, /注文/);

  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  assert.match(changelog, /0\.0\.66/);
  assert.match(changelog, /0\.0\.72/);
  assert.match(changelog, /0\.0\.73/);
  assert.match(changelog, /%10/);
  assert.match(changelog, /%11/);
  assert.match(changelog, /席について/);
  assert.match(changelog, /注文/);

  const roadmap = readFileSync(join(root, "docs/roadmap.md"), "utf8");
  assert.match(roadmap, /席について/);
  assert.match(roadmap, /到着の拍と店内/);
  assert.match(roadmap, /%10/);
  assert.match(roadmap, /%11/);
  assert.match(roadmap, /注文/);

  const backlog = readFileSync(join(root, "automation/backlog.md"), "utf8");
  assert.match(backlog, /席について/);
  assert.match(backlog, /%10/);
  assert.match(backlog, /%11/);
  assert.match(backlog, /注文/);
});

test("glossary: 店内の続きと注文 — umbrella vs seating vs order vs 席の店員", () => {
  // docs/spec/05-glossary.md「店内の続きと注文（まぎらわしいことば）」
  const glossary = readFileSync(join(root, "docs/spec/05-glossary.md"), "utf8");
  const section = glossary.slice(
    glossary.indexOf("## 店内の続きと注文"),
    glossary.indexOf("## 任せたあとと注文を取る"),
  );
  assert.match(section, /店内の続きと注文/);
  assert.match(section, /総称/);
  assert.match(section, /席について/);
  assert.match(section, /注文/);
  assert.match(section, /席の店員/);
  assert.match(section, /外注ぎ/);
  assert.match(section, /%10/);
  assert.match(section, /%11/);
  assert.match(section, /複数/);
  assert.match(section, /任せたあと/);
  assert.match(section, /予約語/);
  assert.doesNotMatch(section, /欠落/);

  const audio = parseMesLang(readFileSync(join(root, "examples/audio/station.mes"), "utf8"));
  assert.equal(audio.body.sections[4]!.title, "席について");
  assert.equal(audio.body.sections[5]!.title, "注文");
  assert.ok(
    audio.body.sections[4]!.pieces.some((p) =>
      p.decorators.some((d) => d.kind === "comment" && d.value.includes("店内の続き")),
    ),
  );

  const manga = parseMesLang(readFileSync(join(root, "examples/manga/station-name.mes"), "utf8"));
  const pieces = manga.body.sections[0]!.pieces;
  const seat = pieces.find((p) => p.decorators.some((d) => d.kind === "frame" && d.value === "10"))!;
  const order = pieces.find((p) => p.decorators.some((d) => d.kind === "frame" && d.value === "11"))!;
  assert.ok(seat.decorators.some((d) => d.kind === "comment" && d.value.includes("店内の続きのひとつ")));
  assert.equal(firstCharacter(order)?.value, "店員");
  assert.equal(firstCharacter(order)?.attrs["吹き出し"], undefined);
  assert.match(order.dialogue, /ご注文/);

  const overview = readFileSync(join(root, "docs/spec/00-overview.md"), "utf8");
  assert.match(overview, /店内の続きと注文/);
  assert.match(overview, /席の店員/);

  const profiles = readFileSync(join(root, "docs/spec/03-media-profiles.md"), "utf8");
  assert.match(profiles, /用語集（店内の続きと注文）/);
  assert.match(profiles, /店内の続きのひとつ/);

  const guide = readFileSync(join(root, "docs/spec/04-ai-reading.md"), "utf8");
  assert.match(guide, /用語集（店内の続きと注文）/);
  assert.match(guide, /店内の続きは `%10`–`%11`/);
  assert.match(guide, /%10`＝席について/);

  const audioReadme = readFileSync(join(root, "examples/audio/README.md"), "utf8");
  assert.match(audioReadme, /用語集（店内の続きと注文）/);
  assert.match(audioReadme, /店内の続きの \*\*ひとつ\*\*/);
  assert.match(audioReadme, /席の店員/);

  const mangaReadme = readFileSync(join(root, "examples/manga/README.md"), "utf8");
  assert.match(mangaReadme, /用語集（店内の続きと注文）/);
  assert.match(mangaReadme, /店内の続きは `%10`–`%11`/);
  assert.match(mangaReadme, /席についてです/);

  const adrReadme = readFileSync(join(root, "docs/decisions/README.md"), "utf8");
  assert.match(adrReadme, /店内の続きと注文/);
  assert.match(adrReadme, /%10` だけを「店内の続き」と呼ばない/);

  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  assert.match(changelog, /0\.0\.74/);
  assert.match(changelog, /店内の続きと注文/);

  const roadmap = readFileSync(join(root, "docs/roadmap.md"), "utf8");
  assert.match(roadmap, /店内の続きと注文/);
  assert.match(roadmap, /水曜向け/);

  const backlog = readFileSync(join(root, "automation/backlog.md"), "utf8");
  assert.match(backlog, /店内の続きと注文/);
  assert.match(backlog, /水曜向け/);
});

test("glossary: 任せたあとと注文を取る — cafe decide vs staff take-order", () => {
  // docs/spec/05-glossary.md「任せたあとと注文を取る（まぎらわしいことば）」
  const glossary = readFileSync(join(root, "docs/spec/05-glossary.md"), "utf8");
  const section = glossary.slice(
    glossary.indexOf("## 任せたあとと注文を取る"),
    glossary.indexOf("## 入店とふつうのセリフに戻る"),
  );
  assert.match(section, /任せたあとと注文を取る/);
  assert.match(section, /注文を決める/);
  assert.match(section, /注文を取る/);
  assert.match(section, /客どうし/);
  assert.match(section, /店員は出ない/);
  assert.match(section, /cafe-pose/);
  assert.match(section, /station-name/);
  assert.match(section, /予約語/);
  assert.match(section, /店内の続きと注文/);
  assert.match(section, /入店とふつうのセリフに戻る/);

  const cafe = parseMesLang(readFileSync(join(root, "examples/manga/cafe-pose.mes"), "utf8"));
  const station = parseMesLang(readFileSync(join(root, "examples/manga/station-name.mes"), "utf8"));
  const audio = parseMesLang(readFileSync(join(root, "examples/audio/station.mes"), "utf8"));
  const decide = cafe.body.sections[0]!.pieces.find((p) =>
    p.decorators.some((d) => d.kind === "frame" && d.value === "10"),
  )!;
  const takeOrder = station.body.sections[0]!.pieces.find((p) =>
    p.decorators.some((d) => d.kind === "frame" && d.value === "11"),
  )!;
  assert.equal(firstCharacter(decide)?.value, "こいと");
  assert.equal(firstCharacter(decide)?.attrs["吹き出し"], undefined);
  assert.match(decide.dialogue, /ショートケーキ/);
  assert.ok(decide.decorators.some((d) => d.kind === "comment" && d.value.includes("注文を決める")));
  assert.ok(
    !cafe.body.sections[0]!.pieces.some((p) => firstCharacter(p)?.value === "店員"),
  );
  assert.equal(firstCharacter(takeOrder)?.value, "店員");
  assert.equal(firstCharacter(takeOrder)?.attrs["吹き出し"], undefined);
  assert.match(takeOrder.dialogue, /ご注文/);
  assert.equal(audio.body.sections[5]!.title, "注文");
  assert.ok(
    audio.body.sections[5]!.pieces.some((p) => firstCharacter(p)?.value === "店員"),
  );

  const overview = readFileSync(join(root, "docs/spec/00-overview.md"), "utf8");
  assert.match(overview, /任せたあとと注文を取る/);
  assert.match(overview, /客どうし/);

  const profiles = readFileSync(join(root, "docs/spec/03-media-profiles.md"), "utf8");
  assert.match(profiles, /用語集（任せたあとと注文を取る）/);
  assert.match(profiles, /客どうしで決める/);

  const guide = readFileSync(join(root, "docs/spec/04-ai-reading.md"), "utf8");
  assert.match(guide, /用語集（任せたあとと注文を取る）/);
  assert.match(guide, /注文を取る/);

  const audioReadme = readFileSync(join(root, "examples/audio/README.md"), "utf8");
  assert.match(audioReadme, /用語集（任せたあとと注文を取る）/);
  assert.match(audioReadme, /客どうしで注文を決める/);

  const mangaReadme = readFileSync(join(root, "examples/manga/README.md"), "utf8");
  assert.match(mangaReadme, /用語集（任せたあとと注文を取る）/);
  assert.match(mangaReadme, /客どうしで決める/);

  const adrReadme = readFileSync(join(root, "docs/decisions/README.md"), "utf8");
  assert.match(adrReadme, /任せたあとと注文を取る/);
  assert.match(adrReadme, /客どうしで決める/);

  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  assert.match(changelog, /0\.0\.75/);
  assert.match(changelog, /任せたあとと注文を取る/);

  const roadmap = readFileSync(join(root, "docs/roadmap.md"), "utf8");
  assert.match(roadmap, /任せたあとと注文を取る/);
  assert.match(roadmap, /水曜向け/);

  const backlog = readFileSync(join(root, "automation/backlog.md"), "utf8");
  assert.match(backlog, /任せたあとと注文を取る/);
  assert.match(backlog, /水曜向け/);
});

test("glossary: 見本の場面対応 — station vs cafe are different samples", () => {
  // docs/spec/05-glossary.md「見本の場面対応（まぎらわしいことば）」
  const glossary = readFileSync(join(root, "docs/spec/05-glossary.md"), "utf8");
  const section = glossary.slice(
    glossary.indexOf("## 見本の場面対応"),
    glossary.indexOf("## 到着の拍"),
  );
  assert.match(section, /見本の場面対応/);
  assert.match(section, /別の話/);
  assert.match(section, /予約語/);
  assert.match(section, /駅前とカフェは別見本/);
  assert.match(section, /任せたあと/);
  assert.match(section, /注文を取る/);
  assert.match(section, /席について/);
  assert.match(section, /到着の拍/);
  assert.match(section, /cafe-pose/);
  assert.match(section, /station-name/);
  assert.match(section, /station-two-pages/);
  assert.match(section, /silent-panels/);
  assert.match(section, /店内の続き/);

  const cafe = parseMesLang(readFileSync(join(root, "examples/manga/cafe-pose.mes"), "utf8"));
  const station = parseMesLang(readFileSync(join(root, "examples/manga/station-name.mes"), "utf8"));
  const audio = parseMesLang(readFileSync(join(root, "examples/audio/station.mes"), "utf8"));
  const cafeTen = cafe.body.sections[0]!.pieces.find((p) =>
    p.decorators.some((d) => d.kind === "frame" && d.value === "10"),
  )!;
  const stationTen = station.body.sections[0]!.pieces.find((p) =>
    p.decorators.some((d) => d.kind === "frame" && d.value === "10"),
  )!;
  const takeOrder = station.body.sections[0]!.pieces.find((p) =>
    p.decorators.some((d) => d.kind === "frame" && d.value === "11"),
  )!;
  assert.equal(firstCharacter(cafeTen)?.value, "こいと");
  assert.ok(cafeTen.decorators.some((d) => d.kind === "comment" && d.value.includes("注文を決める")));
  assert.ok(stationTen.decorators.some((d) => d.kind === "comment" && d.value.includes("席へ案内")));
  assert.equal(firstCharacter(takeOrder)?.value, "店員");
  assert.equal(audio.body.sections[3]!.title, "店の前");
  assert.equal(audio.body.sections[4]!.title, "席について");
  assert.equal(audio.body.sections[5]!.title, "注文");

  const overview = readFileSync(join(root, "docs/spec/00-overview.md"), "utf8");
  assert.match(overview, /見本の場面対応/);
  assert.match(overview, /番号は予約語ではない/);

  const profiles = readFileSync(join(root, "docs/spec/03-media-profiles.md"), "utf8");
  assert.match(profiles, /用語集（見本の場面対応）/);

  const guide = readFileSync(join(root, "docs/spec/04-ai-reading.md"), "utf8");
  assert.match(guide, /用語集（見本の場面対応）/);

  const audioReadme = readFileSync(join(root, "examples/audio/README.md"), "utf8");
  assert.match(audioReadme, /用語集（見本の場面対応）/);

  const mangaReadme = readFileSync(join(root, "examples/manga/README.md"), "utf8");
  assert.match(mangaReadme, /用語集（見本の場面対応）/);

  const adrReadme = readFileSync(join(root, "docs/decisions/README.md"), "utf8");
  assert.match(adrReadme, /見本の場面対応/);
  assert.match(adrReadme, /番号は予約語ではない/);

  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  assert.match(changelog, /0\.0\.76/);
  assert.match(changelog, /見本の場面対応/);

  const roadmap = readFileSync(join(root, "docs/roadmap.md"), "utf8");
  assert.match(roadmap, /見本の場面対応/);
  assert.match(roadmap, /水曜向け/);

  const backlog = readFileSync(join(root, "automation/backlog.md"), "utf8");
  assert.match(backlog, /見本の場面対応/);
  assert.match(backlog, /水曜向け/);
});

test("glossary: 入店 vs ふつうのセリフに戻る — both omit 吹き出し, roles differ", () => {
  // docs/spec/05-glossary.md「入店とふつうのセリフに戻る（まぎらわしいことば）」
  const glossary = readFileSync(join(root, "docs/spec/05-glossary.md"), "utf8");
  const section = glossary.slice(
    glossary.indexOf("## 入店とふつうのセリフに戻る"),
    glossary.indexOf("## 吹き出し種別"),
  );
  assert.match(section, /入店/);
  assert.match(section, /ふつうのセリフに戻る/);
  assert.match(section, /任せたあと/);
  assert.match(section, /station-name/);
  assert.match(section, /cafe-pose/);
  assert.match(section, /外注ぎ/);
  assert.match(section, /心の声/);
  assert.match(section, /予約語/);
  assert.match(section, /到着の拍/);
  assert.match(section, /店内の続き/);
  assert.match(section, /吹き出し種別/);

  const station = parseMesLang(readFileSync(join(root, "examples/manga/station-name.mes"), "utf8"));
  const cafe = parseMesLang(readFileSync(join(root, "examples/manga/cafe-pose.mes"), "utf8"));
  const enter = station.body.sections[0]!.pieces.find((p) =>
    p.decorators.some((d) => d.kind === "frame" && d.value === "9"),
  )!;
  const returnSpeech = cafe.body.sections[0]!.pieces.find((p) =>
    p.decorators.some((d) => d.kind === "frame" && d.value === "9"),
  )!;
  const afterReset = cafe.body.sections[0]!.pieces.find((p) =>
    p.decorators.some((d) => d.kind === "frame" && d.value === "10"),
  )!;
  const heart = cafe.body.sections[0]!.pieces.find((p) =>
    p.decorators.some((d) => d.kind === "frame" && d.value === "8"),
  )!;
  assert.equal(firstCharacter(enter)!.attrs["吹き出し"], undefined);
  assert.equal(firstCharacter(returnSpeech)!.attrs["吹き出し"], undefined);
  assert.equal(firstCharacter(afterReset)!.attrs["吹き出し"], undefined);
  assert.equal(firstCharacter(heart)!.attrs["吹き出し"], "心の声");
  assert.match(enter.dialogue, /逃げ場がない/);
  assert.match(returnSpeech.dialogue, /任せた/);
  assert.match(afterReset.dialogue, /ショートケーキ/);
  assert.ok(enter.decorators.some((d) => d.kind === "comment" && d.value.includes("店の前")));
  assert.ok(
    returnSpeech.decorators.some((d) => d.kind === "comment" && d.value.includes("ふつうのセリフ")),
  );
  assert.ok(
    afterReset.decorators.some((d) => d.kind === "comment" && d.value.includes("注文を決める")),
  );
  // %10 のあとに空行で続く二人目（同じコマ・% なし）
  const afterResetIdx = cafe.body.sections[0]!.pieces.indexOf(afterReset);
  const secondInFrame = cafe.body.sections[0]!.pieces[afterResetIdx + 1]!;
  assert.ok(!secondInFrame.decorators.some((d) => d.kind === "frame"));
  assert.equal(firstCharacter(secondInFrame)!.attrs["吹き出し"], undefined);
  assert.match(secondInFrame.dialogue, /それでいい/);

  const mangaReadme = readFileSync(join(root, "examples/manga/README.md"), "utf8");
  assert.match(mangaReadme, /入店とふつうのセリフに戻る/);
  assert.match(mangaReadme, /任せたあと/);

  const profiles = readFileSync(join(root, "docs/spec/03-media-profiles.md"), "utf8");
  assert.match(profiles, /入店とふつうのセリフに戻る/);
  assert.match(profiles, /任せたあと/);

  const guide = readFileSync(join(root, "docs/spec/04-ai-reading.md"), "utf8");
  assert.match(guide, /入店とふつうのセリフに戻る/);
  assert.match(guide, /用語集（入店とふつうのセリフに戻る）/);
  assert.match(guide, /任せたあと/);

  const overview = readFileSync(join(root, "docs/spec/00-overview.md"), "utf8");
  assert.match(overview, /入店とふつうのセリフに戻る/);
  assert.match(overview, /任せたあと/);

  const adrReadme = readFileSync(join(root, "docs/decisions/README.md"), "utf8");
  assert.match(adrReadme, /任せたあと/);

  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  assert.match(changelog, /0\.0\.67/);
  assert.match(changelog, /任せたあと/);

  const roadmap = readFileSync(join(root, "docs/roadmap.md"), "utf8");
  assert.match(roadmap, /cafe-pose\.mes.*%10/);

  const backlog = readFileSync(join(root, "automation/backlog.md"), "utf8");
  assert.match(backlog, /cafe-pose `%10`/);
});

test("glossary: 吹き出し種別 — 心の声 / ナレ / 外注ぎ; speaker ≠ kind", () => {
  // docs/spec/05-glossary.md「吹き出し種別（心の声・ナレ・外注ぎ）」
  const glossary = readFileSync(join(root, "docs/spec/05-glossary.md"), "utf8");
  const section = glossary.slice(
    glossary.indexOf("## 吹き出し種別"),
    glossary.indexOf("## コマとカット"),
  );
  assert.match(section, /心の声/);
  assert.match(section, /ナレ/);
  assert.match(section, /外注ぎ/);
  assert.match(section, /ふつうのセリフ/);
  assert.match(section, /話者名/);
  assert.match(section, /@ナレ/);
  assert.match(section, /種別/);

  const station = parseMesLang(readFileSync(join(root, "examples/manga/station-name.mes"), "utf8"));
  const cafe = parseMesLang(readFileSync(join(root, "examples/manga/cafe-pose.mes"), "utf8"));
  const pieces = station.body.sections[0]!.pieces;
  const heartBracket = pieces.find((p) =>
    p.decorators.some((d) => d.kind === "frame" && d.value === "4"),
  )!;
  const nare = pieces.find((p) => p.decorators.some((d) => d.kind === "frame" && d.value === "7"))!;
  const soto = pieces.find((p) => p.decorators.some((d) => d.kind === "frame" && d.value === "8"))!;
  const enter = pieces.find((p) => p.decorators.some((d) => d.kind === "frame" && d.value === "9"))!;
  const heartAttr = cafe.body.sections[0]!.pieces.find((p) =>
    p.decorators.some((d) => d.kind === "frame" && d.value === "8"),
  )!;

  assert.equal(firstCharacter(heartBracket)!.attrs["吹き出し"], "心の声");
  assert.equal(firstCharacter(nare)!.value, "ナレ");
  assert.equal(firstCharacter(nare)!.attrs["吹き出し"], "ナレ");
  assert.equal(firstCharacter(soto)!.attrs["吹き出し"], "外注ぎ");
  assert.equal(firstCharacter(enter)!.attrs["吹き出し"], undefined);
  assert.equal(firstCharacter(heartAttr)!.attrs["吹き出し"], "心の声");

  const staffSeat = pieces.find((p) =>
    p.decorators.some((d) => d.kind === "frame" && d.value === "11"),
  )!;
  assert.equal(firstCharacter(staffSeat)!.value, "店員");
  assert.equal(firstCharacter(staffSeat)!.attrs["吹き出し"], undefined);
  assert.match(staffSeat.dialogue, /ご注文/);

  // Speaker name alone is not the kind: @店員 + [外注ぎ] vs 席の @店員
  assert.equal(firstCharacter(soto)!.value, "店員");
  assert.match(nare.dialogue, /夕方の駅前/);
  assert.match(soto.dialogue, /いらっしゃいませ/);
  assert.match(section, /席での `@店員`/);
  assert.match(section, /注文/);

  const mangaReadme = readFileSync(join(root, "examples/manga/README.md"), "utf8");
  assert.match(mangaReadme, /吹き出し種別/);
  assert.match(mangaReadme, /話者名/);

  const profiles = readFileSync(join(root, "docs/spec/03-media-profiles.md"), "utf8");
  assert.match(profiles, /用語集（吹き出し種別）/);

  const guide = readFileSync(join(root, "docs/spec/04-ai-reading.md"), "utf8");
  assert.match(guide, /用語集（吹き出し種別）/);

  const overview = readFileSync(join(root, "docs/spec/00-overview.md"), "utf8");
  assert.match(overview, /吹き出し種別/);

  const adrReadme = readFileSync(join(root, "docs/decisions/README.md"), "utf8");
  assert.match(adrReadme, /吹き出し種別/);
  assert.match(adrReadme, /クローズ/);

  const backlog = readFileSync(join(root, "automation/backlog.md"), "utf8");
  const glossaryWont = glossary.slice(glossary.indexOf("## 採用しない"));
  assert.match(glossaryWont, /カット表の Markdown／CSV/);
  assert.match(backlog, /カット表の Markdown／CSV/);
  assert.match(backlog, /吹き出し種別/);
});

test("glossary: 取り込みの三段階 — machine vs human boundary", () => {
  // docs/spec/05-glossary.md「取り込みの三段階（機械変換と人手）」
  const glossary = readFileSync(join(root, "docs/spec/05-glossary.md"), "utf8");
  const section = glossary.slice(
    glossary.indexOf("## 取り込みの三段階"),
    glossary.indexOf("## 記号の呼び名"),
  );
  assert.match(section, /機械変換/);
  assert.match(section, /人手/);
  assert.match(section, /mes-import-before/);
  assert.match(section, /mes-import-compat-only/);
  assert.match(section, /mes-import-after/);
  assert.match(section, /rewriteMesCompat|--compat/);
  assert.match(section, /○/);
  assert.match(section, /◯/);
  assert.match(section, /〇/);
  assert.match(section, /オープニング|==/);
  assert.match(section, /声質/);

  const before = readFileSync(join(root, "examples/audio/mes-import-before.mes"), "utf8");
  const compatOnly = readFileSync(join(root, "examples/audio/mes-import-compat-only.mes"), "utf8");
  const after = readFileSync(join(root, "examples/audio/mes-import-after.mes"), "utf8");
  assert.equal(rewriteMesCompat(before), compatOnly);
  assert.match(compatOnly, /^#オープニング$/m);
  assert.match(compatOnly, /^#駅前$/m);
  assert.match(compatOnly, /\$ヒソヒソ声/);
  assert.doesNotMatch(compatOnly, /^==/m);
  assert.match(after, /^== オープニング$/m);
  assert.match(after, /:声質/);
  assert.doesNotMatch(after, /\$ヒソヒソ声/);

  const overview = readFileSync(join(root, "docs/spec/00-overview.md"), "utf8");
  assert.match(overview, /取り込みの三段階/);

  const compatGuide = readFileSync(join(root, "docs/spec/06-mes-compat.md"), "utf8");
  assert.match(compatGuide, /用語集（取り込みの三段階）/);

  const profiles = readFileSync(join(root, "docs/spec/03-media-profiles.md"), "utf8");
  assert.match(profiles, /用語集（取り込みの三段階）/);

  const guide = readFileSync(join(root, "docs/spec/04-ai-reading.md"), "utf8");
  assert.match(guide, /用語集（取り込みの三段階）/);

  const audioReadme = readFileSync(join(root, "examples/audio/README.md"), "utf8");
  assert.match(audioReadme, /用語集（取り込みの三段階）/);

  const adrReadme = readFileSync(join(root, "docs/decisions/README.md"), "utf8");
  assert.match(adrReadme, /取り込みの三段階/);
  assert.match(adrReadme, /クローズ対象なし/);

  const backlog = readFileSync(join(root, "automation/backlog.md"), "utf8");
  assert.match(backlog, /取り込みの三段階/);
  const glossaryWont = glossary.slice(glossary.indexOf("## 採用しない"));
  assert.match(glossaryWont, /カット表の Markdown／CSV/);
  assert.match(backlog, /カット表の Markdown／CSV/);
});

test("examples/manga/station-name.mes parses frames", () => {
  const text = readFileSync(join(root, "examples/manga/station-name.mes"), "utf8");
  const medo = parseMesLang(text);
  const pieces = medo.body.sections[0]!.pieces;
  const frames = pieces.flatMap((p) => p.decorators).filter((d) => d.kind === "frame");
  assert.ok(frames.length >= 11);
  assert.equal(frames.filter((d) => d.value === "6").length, 1);
  assert.equal(frames.filter((d) => d.value === "7").length, 1);
  assert.equal(frames.filter((d) => d.value === "8").length, 1);
  assert.equal(frames.filter((d) => d.value === "9").length, 1);
  assert.equal(frames.filter((d) => d.value === "10").length, 1);
  assert.equal(frames.filter((d) => d.value === "11").length, 1);
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
  // %7 ナレ / %8 外注ぎ / %9 入店（音声「店の前」の続き）/ %10 席について（音声「席について」。店内の続きのひとつ）/ %11 注文（音声「注文」。席の店員 ≠ 外注ぎ）
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
  const interiorStart = pieces.findIndex((p) =>
    p.decorators.some((d) => d.kind === "frame" && d.value === "10"),
  );
  assert.ok(interiorStart >= 0);
  const seat = pieces[interiorStart]!;
  const heavy = pieces[interiorStart + 1]!;
  assert.equal(firstCharacter(seat)?.value, "こいと");
  assert.equal(firstCharacter(seat)?.attrs["表情"], "微笑");
  assert.equal(firstCharacter(seat)?.attrs["姿勢"], "椅子を引く");
  assert.match(seat.dialogue, /窓際/);
  assert.ok(seat.decorators.some((d) => d.kind === "sound" && d.value.includes("店内BGM")));
  assert.ok(seat.decorators.some((d) => d.kind === "comment" && d.value.includes("席について")));
  assert.equal(firstCharacter(heavy)?.value, "にか");
  assert.match(heavy.dialogue, /足が重い/);
  assert.equal(
    heavy.decorators.some((d) => d.kind === "frame"),
    false,
  );
  const orderStart = pieces.findIndex((p) =>
    p.decorators.some((d) => d.kind === "frame" && d.value === "11"),
  );
  assert.ok(orderStart >= 0);
  const staffSeat = pieces[orderStart]!;
  const usual = pieces[orderStart + 1]!;
  const nikaOrder = pieces[orderStart + 2]!;
  assert.equal(firstCharacter(staffSeat)?.value, "店員");
  assert.equal(firstCharacter(staffSeat)?.attrs["表情"], "微笑");
  assert.equal(firstCharacter(staffSeat)?.attrs["姿勢"], "伝票を持つ");
  assert.equal(firstCharacter(staffSeat)?.attrs["吹き出し"], undefined);
  assert.match(staffSeat.dialogue, /ご注文/);
  assert.ok(staffSeat.decorators.some((d) => d.kind === "sound" && d.value.includes("店内BGM")));
  assert.ok(staffSeat.decorators.some((d) => d.kind === "comment" && d.value.includes("注文")));
  assert.ok(staffSeat.decorators.some((d) => d.kind === "comment" && d.value.includes("外注ぎ")));
  assert.equal(firstCharacter(usual)?.value, "こいと");
  assert.equal(firstCharacter(usual)?.attrs["表情"], "にやり");
  assert.match(usual.dialogue, /いつもので/);
  assert.equal(
    usual.decorators.some((d) => d.kind === "frame"),
    false,
  );
  assert.equal(firstCharacter(nikaOrder)?.value, "にか");
  assert.match(nikaOrder.dialogue, /注文まで来たか/);
  assert.equal(
    nikaOrder.decorators.some((d) => d.kind === "frame"),
    false,
  );
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

test("glossary: コマ・構図と属性 — speaker keys stay on @, not % or ^", () => {
  // docs/spec/05-glossary.md「コマ・構図と属性（まぎらわしいことば）」
  const glossary = readFileSync(join(root, "docs/spec/05-glossary.md"), "utf8");
  const section = glossary.slice(
    glossary.indexOf("## コマ・構図と属性"),
    glossary.indexOf("## コマ番号とコマのメモ"),
  );
  assert.match(section, /コマ・構図と属性/);
  assert.match(section, /話者の属性/);
  assert.match(section, /大きさは `\^` の本文/);
  assert.match(section, /cafe-pose/);
  assert.match(section, /station-name/);
  assert.match(section, /属性のつき先/);

  const pitfall = parseMesLang(`profile: manga
----
%2 :表情 焦り
^にかバストアップ :姿勢 前のめり
@にか
待たせたな……！
`);
  const pitfallPiece = pitfall.body.sections[0]!.pieces[0]!;
  const frame = pitfallPiece.decorators.find((d) => d.kind === "frame")!;
  const camera = pitfallPiece.decorators.find((d) => d.kind === "camera")!;
  const ch = firstCharacter(pitfallPiece)!;
  assert.equal(frame.value, "2");
  assert.equal(frame.attrs["表情"], "焦り");
  assert.equal(camera.attrs["姿勢"], "前のめり");
  assert.equal(ch.attrs["表情"], undefined);
  assert.equal(ch.attrs["姿勢"], undefined);
  assert.match(ch.value ?? "", /にか/);

  const ok = parseMesLang(`profile: manga
----
%2
^にかバストアップ 1/2コマ
@にか :表情 焦り
待たせたな……！
`);
  const okPiece = ok.body.sections[0]!.pieces[0]!;
  const okFrame = okPiece.decorators.find((d) => d.kind === "frame")!;
  const okCam = okPiece.decorators.find((d) => d.kind === "camera")!;
  const okCh = firstCharacter(okPiece)!;
  assert.equal(okFrame.attrs["表情"], undefined);
  assert.equal(okCam.attrs["表情"], undefined);
  assert.match(okCam.value, /1\/2コマ/);
  assert.equal(okCh.attrs["表情"], "焦り");

  const cafe = parseMesLang(readFileSync(join(root, "examples/manga/cafe-pose.mes"), "utf8"));
  const station = parseMesLang(readFileSync(join(root, "examples/manga/station-name.mes"), "utf8"));
  for (const medo of [cafe, station]) {
    for (const piece of medo.body.sections[0]!.pieces) {
      for (const d of piece.decorators) {
        if (d.kind === "frame" || d.kind === "camera") {
          assert.equal(d.attrs["表情"], undefined);
          assert.equal(d.attrs["姿勢"], undefined);
          assert.equal(d.attrs["吹き出し"], undefined);
        }
      }
    }
  }

  const profiles = readFileSync(join(root, "docs/spec/03-media-profiles.md"), "utf8");
  assert.match(profiles, /コマ・構図に属性を付けない/);
  assert.match(profiles, /NG: 表情が % に付く/);

  const decorators = readFileSync(join(root, "docs/spec/02-decorators.md"), "utf8");
  assert.match(decorators, /話者の顔・体には届きません/);

  const core = readFileSync(join(root, "docs/spec/01-core.md"), "utf8");
  assert.match(core, /コマ・構図と属性/);

  const overview = readFileSync(join(root, "docs/spec/00-overview.md"), "utf8");
  assert.match(overview, /コマ・構図と属性/);

  const guide = readFileSync(join(root, "docs/spec/04-ai-reading.md"), "utf8");
  assert.match(guide, /コマ・構図と属性/);
  assert.match(guide, /% や \^ に付けるとコマ／構図側/);

  const basics = guide.slice(
    guide.indexOf("## 読み手（AI）への基本指示"),
    guide.indexOf("## 著者側の書き方"),
  );
  assert.match(basics, /コマ・構図と属性/);

  const nameRaising = guide.slice(
    guide.indexOf("### 漫画ネーム起こし"),
    guide.indexOf("### 漫画参考画像"),
  );
  assert.match(nameRaising, /コマ・構図と属性/);

  const mangaWrite = guide.slice(
    guide.indexOf("### 漫画ネーム原稿を書かせるとき"),
    guide.indexOf("### 不足情報の洗い出し"),
  );
  assert.match(mangaWrite, /コマ・構図と属性/);
  assert.match(mangaWrite, /% や \^ に :表情/);

  const gap = guide.slice(
    guide.indexOf("### 不足情報の洗い出し"),
    guide.indexOf("### Medo の形チェック結果の読み方"),
  );
  assert.match(gap, /% や \^ の直後/);

  const mangaReadme = readFileSync(join(root, "examples/manga/README.md"), "utf8");
  assert.match(mangaReadme, /コマ構図と属性まぎらわしいことば/);
  assert.match(mangaReadme, /`%` や `\^` に付けると話者に届きません/);

  const adrReadme = readFileSync(join(root, "docs/decisions/README.md"), "utf8");
  assert.match(adrReadme, /コマ・構図と属性/);

  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  assert.match(changelog, /0\.0\.80/);
  assert.match(changelog, /コマ・構図と属性/);

  const roadmap = readFileSync(join(root, "docs/roadmap.md"), "utf8");
  assert.match(roadmap, /コマ・構図と属性/);
  assert.match(roadmap, /水曜向け/);

  const backlog = readFileSync(join(root, "automation/backlog.md"), "utf8");
  assert.match(backlog, /コマ・構図と属性/);
  assert.match(backlog, /水曜向け/);
});

test("glossary: コマ番号とコマのメモ — % body can be a memo, composition stays on ^", () => {
  // docs/spec/05-glossary.md「コマ番号とコマのメモ（まぎらわしいことば）」
  const glossary = readFileSync(join(root, "docs/spec/05-glossary.md"), "utf8");
  const section = glossary.slice(
    glossary.indexOf("## コマ番号とコマのメモ"),
    glossary.indexOf("## タイミングとビート"),
  );
  assert.match(section, /コマ番号とコマのメモ/);
  assert.match(section, /番号は必須ではありません/);
  assert.match(section, /%改札/);
  assert.match(section, /silent-panels/);
  assert.match(section, /構図は `\^`/);
  assert.match(section, /状況は `#`/);
  assert.match(section, /コマ・構図と属性/);

  const memo = parseMesLang(`profile: manga
----
%改札
^俯瞰 横長フル
#夕方の改札。人波だけ。だれの顔もまだ見えない
`);
  const memoPiece = memo.body.sections[0]!.pieces[0]!;
  const memoFrame = memoPiece.decorators.find((d) => d.kind === "frame")!;
  const memoCam = memoPiece.decorators.find((d) => d.kind === "camera")!;
  assert.equal(memoFrame.value, "改札");
  assert.equal(Object.keys(memoFrame.attrs).length, 0);
  assert.match(memoCam.value, /俯瞰/);
  assert.equal(memoCam.attrs["メモ"], undefined);

  const attrPitfall = parseMesLang(`profile: manga
----
%1 :メモ 改札
^俯瞰
#改札前
`);
  const attrPiece = attrPitfall.body.sections[0]!.pieces[0]!;
  const attrFrame = attrPiece.decorators.find((d) => d.kind === "frame")!;
  assert.equal(attrFrame.value, "1");
  assert.equal(attrFrame.attrs["メモ"], "改札");

  const compositionPitfall = parseMesLang(`profile: manga
----
%俯瞰
#改札前
`);
  const compPiece = compositionPitfall.body.sections[0]!.pieces[0]!;
  const compFrame = compPiece.decorators.find((d) => d.kind === "frame")!;
  assert.equal(compFrame.value, "俯瞰");
  assert.equal(compPiece.decorators.some((d) => d.kind === "camera"), false);

  const silent = parseMesLang(readFileSync(join(root, "examples/manga/silent-panels.mes"), "utf8"));
  const first = silent.body.sections[0]!.pieces[0]!;
  assert.ok(first.decorators.some((d) => d.kind === "frame" && d.value === "改札"));
  assert.ok(first.decorators.some((d) => d.kind === "camera" && d.value.includes("俯瞰")));
  assert.equal(first.dialogue.trim(), "");
  const second = silent.body.sections[0]!.pieces[1]!;
  assert.ok(second.decorators.some((d) => d.kind === "frame" && d.value === "2"));

  const profiles = readFileSync(join(root, "docs/spec/03-media-profiles.md"), "utf8");
  assert.match(profiles, /コマ番号と短いメモ/);
  assert.match(profiles, /NG: 構図を % に書く/);
  assert.match(profiles, /NG: ラベルを属性にする/);
  assert.match(profiles, /%改札/);

  const decorators = readFileSync(join(root, "docs/spec/02-decorators.md"), "utf8");
  assert.match(decorators, /コマ番号とコマのメモ/);

  const core = readFileSync(join(root, "docs/spec/01-core.md"), "utf8");
  assert.match(core, /コマ番号とコマのメモ/);

  const overview = readFileSync(join(root, "docs/spec/00-overview.md"), "utf8");
  assert.match(overview, /コマ番号とコマのメモ/);

  const guide = readFileSync(join(root, "docs/spec/04-ai-reading.md"), "utf8");
  assert.match(guide, /コマ番号とコマのメモ/);

  const basics = guide.slice(
    guide.indexOf("## 読み手（AI）への基本指示"),
    guide.indexOf("## 著者側の書き方"),
  );
  assert.match(basics, /コマ番号とコマのメモ/);
  assert.match(basics, /%改札/);

  const nameRaising = guide.slice(
    guide.indexOf("### 漫画ネーム起こし"),
    guide.indexOf("### 漫画参考画像"),
  );
  assert.match(nameRaising, /コマ番号とコマのメモ/);
  assert.match(nameRaising, /%改札/);

  const mangaWrite = guide.slice(
    guide.indexOf("### 漫画ネーム原稿を書かせるとき"),
    guide.indexOf("### 不足情報の洗い出し"),
  );
  assert.match(mangaWrite, /コマ番号とコマのメモ/);
  assert.match(mangaWrite, /数字必須ではない/);

  const gap = guide.slice(
    guide.indexOf("### 不足情報の洗い出し"),
    guide.indexOf("### Medo の形チェック結果の読み方"),
  );
  assert.match(gap, /%改札/);
  assert.match(gap, /コマ番号とコマのメモ/);

  const mangaReadme = readFileSync(join(root, "examples/manga/README.md"), "utf8");
  assert.match(mangaReadme, /コマ番号とコマのメモまぎらわしいことば/);
  assert.match(mangaReadme, /%改札/);

  const adrReadme = readFileSync(join(root, "docs/decisions/README.md"), "utf8");
  assert.match(adrReadme, /コマ番号とコマのメモ/);

  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  assert.match(changelog, /0\.0\.92/);
  assert.match(changelog, /コマ番号とコマのメモ/);

  const roadmap = readFileSync(join(root, "docs/roadmap.md"), "utf8");
  assert.match(roadmap, /コマ番号とコマのメモ/);
  assert.match(roadmap, /水曜向け/);

  const backlog = readFileSync(join(root, "automation/backlog.md"), "utf8");
  assert.match(backlog, /コマ番号とコマのメモ/);
  assert.match(backlog, /水曜向け/);
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
  const first = pieces[0]!;
  assert.ok(first.decorators.some((d) => d.kind === "frame" && d.value === "改札"));
  assert.ok(
    first.decorators.some((d) => d.kind === "camera" && d.value.includes("俯瞰")),
  );
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
  assert.ok(pieces.length >= 11);
  const withAttrs = pieces
    .map((p) => firstCharacter(p))
    .filter((ch): ch is NonNullable<typeof ch> => ch != null && Object.keys(ch.attrs).length > 0);
  assert.ok(withAttrs.length >= 9);
  assert.ok(withAttrs.some((ch) => ch.attrs["表情"] === "ほっとした" && ch.attrs["姿勢"] === "椅子に沈む"));
  assert.ok(withAttrs.some((ch) => ch.attrs["表情"] === "微笑" && ch.attrs["姿勢"] === "肘をついて顎を支える"));
  assert.ok(withAttrs.some((ch) => ch.attrs["表情"] === "困り" && ch.attrs["姿勢"] === "前のめり"));
  assert.ok(withAttrs.some((ch) => ch.attrs["表情"] === "楽しそう" && ch.attrs["姿勢"] === "少し身を乗り出す"));
  assert.ok(withAttrs.some((ch) => ch.attrs["表情"] === "苦笑い" && ch.attrs["姿勢"] === "後ずさり気味"));
  assert.ok(withAttrs.some((ch) => ch.attrs["表情"] === "にやり" && ch.attrs["姿勢"] === "指を一本立てる"));
  assert.ok(withAttrs.some((ch) => ch.attrs["表情"] === "照れ" && ch.attrs["姿勢"] === "メニューに視線を落とす"));
  assert.ok(withAttrs.some((ch) => ch.attrs["表情"] === "にやり" && ch.attrs["姿勢"] === "メニューを閉じる"));
  assert.ok(withAttrs.some((ch) => ch.attrs["表情"] === "ほっとした" && ch.attrs["姿勢"] === "うなずく"));
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
  const order = pieces[9]!;
  assert.ok(order.decorators.some((d) => d.kind === "frame" && d.value === "10"));
  const orderCh = firstCharacter(order)!;
  assert.equal(orderCh.value, "こいと");
  assert.equal(orderCh.attrs["表情"], "にやり");
  assert.equal(orderCh.attrs["姿勢"], "メニューを閉じる");
  assert.equal(orderCh.attrs["吹き出し"], undefined);
  assert.match(order.dialogue, /ショートケーキ/);
  const orderReply = pieces[10]!;
  assert.ok(!orderReply.decorators.some((d) => d.kind === "frame"));
  assert.equal(firstCharacter(orderReply)!.value, "にか");
  assert.equal(firstCharacter(orderReply)!.attrs["吹き出し"], undefined);
  assert.match(orderReply.dialogue, /それでいい/);
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

test("AI ネーム起こしガイド: cafe-pose %8–%10 / silent-panels %7–%8 fixtures stay linked", () => {
  const guide = readFileSync(join(root, "docs/spec/04-ai-reading.md"), "utf8");
  const nameRaising = guide.slice(
    guide.indexOf("### 漫画ネーム起こし"),
    guide.indexOf("### 漫画参考画像"),
  );
  assert.match(nameRaising, /吹き出し種別/);
  assert.match(nameRaising, /cafe-pose\.mes/);
  assert.match(nameRaising, /%8/);
  assert.match(nameRaising, /%9/);
  assert.match(nameRaising, /%10/);
  assert.match(nameRaising, /ふつうのセリフに戻る/);
  assert.match(nameRaising, /任せたあと/);
  assert.match(nameRaising, /silent-panels\.mes/);
  assert.match(nameRaising, /%7/);
  assert.match(nameRaising, /声を出す直前/);
  assert.match(nameRaising, /station-name\.mes/);
  assert.match(nameRaising, /同じコマの二人セリフ/);
  assert.match(nameRaising, /ナレ/);
  assert.match(nameRaising, /外注ぎ/);
  assert.match(nameRaising, /店内の続き/);
  assert.match(nameRaising, /%11/);
  assert.match(nameRaising, /注文/);
  assert.match(nameRaising, /席について/);
  assert.match(nameRaising, /席の店員/);
  assert.match(nameRaising, /到着の拍と店内/);
  assert.match(nameRaising, /店内の続きと注文/);
  assert.match(nameRaising, /任せたあとと注文を取る/);
  assert.match(nameRaising, /見本の場面対応/);
  assert.match(nameRaising, /入店/);
  assert.match(nameRaising, /到着の拍/);
  assert.match(nameRaising, /入店とふつうのセリフに戻る/);
  assert.match(nameRaising, /コマとピース/);
  assert.match(nameRaising, /コマ・構図と属性/);
  assert.match(nameRaising, /勝手にセリフを足さない/);
  assert.match(nameRaising, /空と欠け/);
  assert.match(nameRaising, /ヘッダーの縁/);
  assert.match(nameRaising, /medo-の形チェックの縁まぎらわしいことば/);

  const mangaReadme = readFileSync(join(root, "examples/manga/README.md"), "utf8");
  assert.match(mangaReadme, /空と欠け/);
  assert.match(mangaReadme, /ヘッダーの縁/);

  const cafe = parseMesLang(readFileSync(join(root, "examples/manga/cafe-pose.mes"), "utf8"));
  const cafePieces = cafe.body.sections[0]!.pieces;
  const cafeThought = cafePieces[7]!;
  assert.ok(cafeThought.decorators.some((d) => d.kind === "frame" && d.value === "8"));
  assert.equal(firstCharacter(cafeThought)!.attrs["吹き出し"], "心の声");
  const cafeSpoken = cafePieces.find((p) =>
    p.decorators.some((d) => d.kind === "frame" && d.value === "9"),
  )!;
  assert.equal(firstCharacter(cafeSpoken)!.attrs["吹き出し"], undefined);
  assert.match(cafeSpoken.dialogue, /じゃあ、任せた/);
  const cafeOrder = cafePieces.find((p) =>
    p.decorators.some((d) => d.kind === "frame" && d.value === "10"),
  )!;
  assert.equal(firstCharacter(cafeOrder)!.attrs["吹き出し"], undefined);
  assert.match(cafeOrder.dialogue, /ショートケーキ/);
  const cafeOrderIdx = cafePieces.indexOf(cafeOrder);
  assert.match(cafePieces[cafeOrderIdx + 1]!.dialogue, /それでいい/);

  const silent = parseMesLang(readFileSync(join(root, "examples/manga/silent-panels.mes"), "utf8"));
  const silentPieces = silent.body.sections[0]!.pieces;
  assert.ok(silentPieces[0]!.decorators.some((d) => d.kind === "frame" && d.value === "改札"));
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
  assert.match(shapeRead, /必須箱の欠け/);
  assert.match(shapeRead, /空と欠け/);
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

  const practice = guide.slice(
    guide.indexOf("## おすすめの実務の順番"),
    guide.indexOf("## ツールと AI の役割分担"),
  );
  assert.match(practice, /空と欠け/);
  assert.match(practice, /ヘッダーの縁/);

  const gap = guide.slice(
    guide.indexOf("### 不足情報の洗い出し"),
    guide.indexOf("### Medo の形チェック結果の読み方"),
  );
  assert.match(gap, /ピース先頭やセリフのあと/);
  assert.match(gap, /属性に付いていない/);
  assert.match(gap, /Medo の形チェック結果の読み方/);
  assert.match(gap, /空と欠け/);
  assert.match(gap, /ヘッダーの縁/);

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
  assert.match(medoRead, /必須箱の欠け/);
  assert.match(medoRead, /profile なし/);
  assert.match(medoRead, /空と欠け/);
  assert.match(medoRead, /ヘッダーの縁/);
  assert.match(medoRead, /profile: ""/);
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
  assert.match(compat, /空と欠け/);
  assert.match(compat, /ヘッダーの縁/);

  const glossary = readFileSync(join(root, "docs/spec/05-glossary.md"), "utf8");
  const shapeSection = glossary.slice(
    glossary.indexOf("## 形チェックと目視"),
    glossary.indexOf("## Medo の形チェックの縁"),
  );
  assert.match(shapeSection, /medo-の形チェック結果の読み方/);
  assert.match(shapeSection, /カット表の形チェック結果の読み方/);
  assert.match(shapeSection, /Medo でよく迷う縁/);
  assert.match(shapeSection, /空と欠け/);
  assert.match(shapeSection, /ヘッダーの縁/);
});

test("AI ガイド: 音声台本化／原稿生成にヘッダーの縁（profile なしは誤りにしない）", () => {
  const guide = readFileSync(join(root, "docs/spec/04-ai-reading.md"), "utf8");

  const audioScript = guide.slice(
    guide.indexOf("### 音声台本化"),
    guide.indexOf("### セリフ文字数の照合"),
  );
  assert.match(audioScript, /ヘッダーの縁/);
  assert.match(audioScript, /profile が無くても誤りにしない/);
  assert.match(audioScript, /profile: ""/);
  assert.match(audioScript, /mes-import-before/);
  assert.match(audioScript, /mes-import-compat-only/);
  assert.match(audioScript, /medo-の形チェックの縁まぎらわしいことば/);

  const count = guide.slice(
    guide.indexOf("### セリフ文字数の照合"),
    guide.indexOf("### 音声原稿を書かせるとき"),
  );
  assert.match(count, /ヘッダーの縁/);
  assert.match(count, /profile が無くても集計できる/);

  const audioWrite = guide.slice(
    guide.indexOf("### 音声原稿を書かせるとき"),
    guide.indexOf("### 漫画ネーム原稿を書かせるとき"),
  );
  assert.match(audioWrite, /ヘッダーの縁/);
  assert.match(audioWrite, /profile: audio/);
  assert.match(audioWrite, /profile が無くても形の誤りではない/);
  assert.match(audioWrite, /mes-import-before/);
  assert.match(audioWrite, /mes-import-after/);

  const importHelp = guide.slice(
    guide.indexOf("### 旧 Mes 取り込みの手伝い"),
    guide.indexOf("### アニメ字コンテ起こし"),
  );
  assert.match(importHelp, /ヘッダーの縁/);
  assert.match(importHelp, /profile が無くても誤りにしない/);
  assert.match(importHelp, /medo-の形チェックの縁まぎらわしいことば/);

  const audioReadme = readFileSync(join(root, "examples/audio/README.md"), "utf8");
  assert.match(audioReadme, /ヘッダーの縁/);
  assert.match(audioReadme, /profile/);

  const before = readFileSync(join(root, "examples/audio/mes-import-before.mes"), "utf8");
  const mid = readFileSync(join(root, "examples/audio/mes-import-compat-only.mes"), "utf8");
  const after = readFileSync(join(root, "examples/audio/mes-import-after.mes"), "utf8");
  assert.doesNotMatch(before, /^profile:/m);
  assert.doesNotMatch(mid, /^profile:/m);
  assert.match(after, /^profile: audio/m);
  const parsedMid = parseMesLang(mid);
  assert.equal(parsedMid.header.profile, "audio");

  const glossary = readFileSync(join(root, "docs/spec/05-glossary.md"), "utf8");
  const importStages = glossary.slice(
    glossary.indexOf("## 取り込みの三段階"),
    glossary.indexOf("## 記号の呼び名"),
  );
  assert.match(importStages, /ヘッダーの縁/);
  assert.match(importStages, /profile/);

  const compat = readFileSync(join(root, "docs/spec/06-mes-compat.md"), "utf8");
  assert.match(compat, /ヘッダーの縁/);
  assert.match(compat, /profile` なし/);

  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  assert.match(changelog, /0\.0\.71/);
  assert.match(changelog, /ヘッダーの縁/);

  const roadmap = readFileSync(join(root, "docs/roadmap.md"), "utf8");
  assert.match(roadmap, /木曜夜.*ヘッダーの縁/);

  const backlog = readFileSync(join(root, "automation/backlog.md"), "utf8");
  assert.match(backlog, /木曜夜.*ヘッダーの縁/);
});

test("AI ガイド: ひな形に見本の場面対応（番号は予約語ではない）", () => {
  const firstFence = (src: string) => {
    const start = src.indexOf("```\n");
    const end = src.indexOf("\n```", start + 4);
    return src.slice(start + 4, end);
  };

  const guide = readFileSync(join(root, "docs/spec/04-ai-reading.md"), "utf8");

  const basics = guide.slice(
    guide.indexOf("## 読み手（AI）への基本指示"),
    guide.indexOf("## 著者側の書き方"),
  );
  const basicsPrompt = firstFence(basics);
  assert.match(basicsPrompt, /見本の場面対応/);
  assert.match(basicsPrompt, /予約語ではない/);
  assert.match(basicsPrompt, /駅前とカフェは別見本/);

  const nameRaising = guide.slice(
    guide.indexOf("### 漫画ネーム起こし"),
    guide.indexOf("### 漫画参考画像"),
  );
  const namePrompt = firstFence(nameRaising);
  assert.match(namePrompt, /見本の場面対応/);
  assert.match(namePrompt, /%10 をどの見本でも/);
  assert.match(namePrompt, /席について/);

  const audioScript = guide.slice(
    guide.indexOf("### 音声台本化"),
    guide.indexOf("### セリフ文字数の照合"),
  );
  const audioPrompt = firstFence(audioScript);
  assert.match(audioPrompt, /見本の場面対応/);
  assert.match(audioPrompt, /同一視しない/);

  const audioWrite = guide.slice(
    guide.indexOf("### 音声原稿を書かせるとき"),
    guide.indexOf("### 漫画ネーム原稿を書かせるとき"),
  );
  const audioWritePrompt = firstFence(audioWrite);
  assert.match(audioWritePrompt, /見本の場面対応/);
  assert.match(audioWritePrompt, /予約語にしない/);

  const mangaWrite = guide.slice(
    guide.indexOf("### 漫画ネーム原稿を書かせるとき"),
    guide.indexOf("### 不足情報の洗い出し"),
  );
  const mangaWritePrompt = firstFence(mangaWrite);
  assert.match(mangaWritePrompt, /見本の場面対応/);
  assert.match(mangaWritePrompt, /予約語ではない/);
  assert.match(mangaWritePrompt, /cafe-pose %10/);

  const gap = guide.slice(
    guide.indexOf("### 不足情報の洗い出し"),
    guide.indexOf("### Medo の形チェック結果の読み方"),
  );
  const gapPrompt = firstFence(gap);
  assert.match(gapPrompt, /見本の場面対応/);
  assert.match(gapPrompt, /同一視しない/);

  const glossary = readFileSync(join(root, "docs/spec/05-glossary.md"), "utf8");
  const section = glossary.slice(
    glossary.indexOf("## 見本の場面対応"),
    glossary.indexOf("## 到着の拍"),
  );
  assert.match(section, /AI ガイド/);
  assert.match(section, /読み手aiへの基本指示コピー用/);

  const mangaReadme = readFileSync(join(root, "examples/manga/README.md"), "utf8");
  assert.match(mangaReadme, /ひな形のなかには/);
  assert.match(mangaReadme, /見本の場面対応/);

  const audioReadme = readFileSync(join(root, "examples/audio/README.md"), "utf8");
  assert.match(audioReadme, /ひな形のなかには/);
  assert.match(audioReadme, /見本の場面対応/);

  const adrReadme = readFileSync(join(root, "docs/decisions/README.md"), "utf8");
  assert.match(adrReadme, /見本の場面対応/);
  assert.match(adrReadme, /コピー用ひな形/);

  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  assert.match(changelog, /0\.0\.77/);
  assert.match(changelog, /見本の場面対応/);
  assert.match(changelog, /番号は予約語ではない/);

  const roadmap = readFileSync(join(root, "docs/roadmap.md"), "utf8");
  assert.match(roadmap, /日曜夜: 見本の場面対応の定着/);
  assert.match(roadmap, /水曜向け/);

  const backlog = readFileSync(join(root, "automation/backlog.md"), "utf8");
  assert.match(backlog, /日曜夜（2026-08-30）: AI ひな形を見本の場面対応/);
  assert.match(backlog, /水曜向け/);
});
