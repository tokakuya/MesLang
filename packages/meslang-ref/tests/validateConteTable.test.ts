import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { toConteTable } from "../src/conteTable.ts";
import { parseMesLang } from "../src/parse.ts";
import { assertValidConteTable, validateConteTable } from "../src/validateConteTable.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const EXAMPLE_FILES = [
  "examples/audio/station.mes",
  "examples/manga/station-name.mes",
  "examples/manga/silent-panels.mes",
  "examples/manga/cafe-pose.mes",
  "examples/manga/station-two-pages.mes",
  "examples/animation/station-conte.mes",
];

test("validateConteTable accepts toConteTable output for examples", () => {
  for (const rel of EXAMPLE_FILES) {
    const text = readFileSync(join(root, rel), "utf8");
    const table = toConteTable(parseMesLang(text));
    const issues = validateConteTable(table);
    assert.deepEqual(
      issues,
      [],
      `${rel} failed conte-table shape:\n${issues.map((i) => `${i.path}: ${i.message}`).join("\n")}`,
    );
  }
});

test("station-conte.mes: five cuts pass assertValidConteTable", () => {
  const text = readFileSync(join(root, "examples/animation/station-conte.mes"), "utf8");
  const table = toConteTable(parseMesLang(text));
  assertValidConteTable(table);
  assert.equal(table.version, "conte-table/0.0");
  assert.equal(table.cuts.length, 5);
  assert.ok(table.cuts.every((c) => typeof c.cut === "string"));
});

test("validateConteTable rejects wrong version", () => {
  const issues = validateConteTable({
    version: "conte-table/9.9",
    title: "",
    profile: "anime",
    cuts: [],
  });
  assert.ok(issues.some((i) => i.path === "version"));
});

test("validateConteTable rejects cut missing dialogues", () => {
  const issues = validateConteTable({
    version: "conte-table/0.0",
    title: "t",
    profile: "anime",
    cuts: [
      {
        cut: "CUT-1",
        camera: [],
        timing: [],
        action: [],
        sound: [],
        position: [],
        beat: [],
        ext: [],
      },
    ],
  });
  assert.ok(issues.some((i) => i.path.includes("dialogues")));
});

test("validateConteTable rejects non-string camera entry", () => {
  const issues = validateConteTable({
    version: "conte-table/0.0",
    title: "t",
    profile: "anime",
    cuts: [
      {
        cut: "CUT-1",
        camera: [1],
        timing: [],
        action: [],
        sound: [],
        position: [],
        beat: [],
        ext: [],
        dialogues: [],
      },
    ],
  });
  assert.ok(issues.some((i) => i.path.includes("camera")));
});
