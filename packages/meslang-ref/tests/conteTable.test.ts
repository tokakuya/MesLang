import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { toConteTable } from "../src/conteTable.ts";
import { parseMesLang } from "../src/parse.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("toConteTable groups pieces by % frame", () => {
  const medo = parseMesLang(`profile: anime
----
%CUT-1
^寄り
&2s
#立ち止まる
@にか
ねえ

$靴音
!近づく
`);
  const table = toConteTable(medo);
  assert.equal(table.version, "conte-table/0.0");
  assert.equal(table.profile, "anime");
  assert.equal(table.cuts.length, 1);
  const cut = table.cuts[0]!;
  assert.equal(cut.cut, "CUT-1");
  assert.deepEqual(cut.camera, ["寄り"]);
  assert.deepEqual(cut.timing, ["2s"]);
  assert.deepEqual(cut.action, ["立ち止まる"]);
  assert.deepEqual(cut.sound, ["靴音"]);
  assert.deepEqual(cut.position, ["近づく"]);
  assert.deepEqual(cut.dialogues, [{ speaker: "にか", text: "ねえ" }]);
});

test("toConteTable starts a new cut on each %", () => {
  const medo = parseMesLang(`%A
^広角

%B
^寄り
@こいと
はい
`);
  const table = toConteTable(medo);
  assert.equal(table.cuts.length, 2);
  assert.equal(table.cuts[0]!.cut, "A");
  assert.deepEqual(table.cuts[0]!.camera, ["広角"]);
  assert.equal(table.cuts[0]!.dialogues.length, 0);
  assert.equal(table.cuts[1]!.cut, "B");
  assert.deepEqual(table.cuts[1]!.dialogues, [{ speaker: "こいと", text: "はい" }]);
});

test("examples/animation/station-conte.mes yields 5 stable cuts", () => {
  const text = readFileSync(join(root, "examples/animation/station-conte.mes"), "utf8");
  const table = toConteTable(parseMesLang(text));
  assert.equal(table.title, "駅前の二人（字コンテ下地）");
  assert.equal(table.profile, "anime");
  assert.equal(table.cuts.length, 5);
  assert.deepEqual(
    table.cuts.map((c) => c.cut),
    ["CUT-001", "CUT-002", "CUT-003", "CUT-004", "CUT-005"],
  );
  assert.deepEqual(table.cuts[0]!.timing, ["4s"]);
  assert.deepEqual(table.cuts[0]!.camera, ["広角 / ゆっくりパン"]);
  assert.ok(table.cuts[0]!.ext.some((e) => e.startsWith("bg ")));
  assert.equal(table.cuts[1]!.dialogues[0]!.speaker, "にか");
  assert.equal(table.cuts[1]!.dialogues[0]!.text, "おくれた……！");
  assert.equal(table.cuts[2]!.dialogues[0]!.speaker, "こいと");
  assert.deepEqual(table.cuts[3]!.timing, ["2.5s"]);
  assert.ok(table.cuts[4]!.action.some((a) => a.includes("ホーム")));
});
