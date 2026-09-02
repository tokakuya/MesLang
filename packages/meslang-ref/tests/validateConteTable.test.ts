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

test("validateConteTable accepts empty cut id (番号なし) and empty arrays", () => {
  const issues = validateConteTable({
    version: "conte-table/0.0",
    title: "",
    profile: "anime",
    cuts: [
      {
        cut: "",
        camera: [],
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
  assert.deepEqual(issues, []);
});

test("validateConteTable accepts empty cuts array", () => {
  const issues = validateConteTable({
    version: "conte-table/0.0",
    title: "",
    profile: "audio",
    cuts: [],
  });
  assert.deepEqual(issues, []);
});

test("validateConteTable rejects unexpected top-level property", () => {
  const issues = validateConteTable({
    version: "conte-table/0.0",
    title: "",
    profile: "anime",
    cuts: [],
    extra: true,
  });
  assert.ok(issues.some((i) => i.message.includes("unexpected property")));
});

test("validateConteTable rejects unexpected cut property", () => {
  const issues = validateConteTable({
    version: "conte-table/0.0",
    title: "t",
    profile: "anime",
    cuts: [
      {
        cut: "1",
        camera: [],
        timing: [],
        action: [],
        sound: [],
        position: [],
        beat: [],
        ext: [],
        dialogues: [],
        note: "nope",
      },
    ],
  });
  assert.ok(issues.some((i) => i.path === "cuts[0]" && i.message.includes("unexpected property")));
});

test("validateConteTable rejects dialogue with attrs (attrs stay on Medo)", () => {
  const issues = validateConteTable({
    version: "conte-table/0.0",
    title: "t",
    profile: "anime",
    cuts: [
      {
        cut: "1",
        camera: [],
        timing: [],
        action: [],
        sound: [],
        position: [],
        beat: [],
        ext: [],
        dialogues: [{ speaker: "にか", text: "ねえ", attrs: { 表情: "微笑" } }],
      },
    ],
  });
  assert.ok(issues.some((i) => i.path.includes("dialogues") && i.message.includes("unexpected property")));
});

test("validateConteTable rejects camera when not an array", () => {
  const issues = validateConteTable({
    version: "conte-table/0.0",
    title: "t",
    profile: "anime",
    cuts: [
      {
        cut: "1",
        camera: "寄り",
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
  assert.ok(issues.some((i) => i.path === "cuts[0].camera"));
});

test("validateConteTable rejects non-object root", () => {
  const issues = validateConteTable([]);
  assert.ok(issues.some((i) => i.message.includes("must be an object")));
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

test("validateConteTable distinguishes empty cut id from missing cut key", () => {
  const emptyCut = validateConteTable({
    version: "conte-table/0.0",
    title: "",
    profile: "anime",
    cuts: [
      {
        cut: "",
        camera: [],
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
  assert.deepEqual(emptyCut, []);

  const missingCut = validateConteTable({
    version: "conte-table/0.0",
    title: "",
    profile: "anime",
    cuts: [
      {
        camera: [],
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
  assert.ok(missingCut.some((i) => i.path === "cuts[0].cut" && i.message.includes("required")));

  const missingSpeaker = validateConteTable({
    version: "conte-table/0.0",
    title: "",
    profile: "anime",
    cuts: [
      {
        cut: "1",
        camera: [],
        timing: [],
        action: [],
        sound: [],
        position: [],
        beat: [],
        ext: [],
        dialogues: [{ text: "ねえ" }],
      },
    ],
  });
  assert.ok(
    missingSpeaker.some((i) => i.path.includes("speaker") && i.message.includes("required")),
  );

  const missingTitle = validateConteTable({
    version: "conte-table/0.0",
    profile: "anime",
    cuts: [],
  });
  assert.ok(missingTitle.some((i) => i.path === "title" && i.message.includes("required")));
});

test("validateConteTable treats null as type mismatch, not missing", () => {
  const nullCut = validateConteTable({
    version: "conte-table/0.0",
    title: "",
    profile: "anime",
    cuts: [
      {
        cut: null,
        camera: [],
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
  assert.ok(
    nullCut.some((i) => i.path === "cuts[0].cut" && i.message.includes("must be a string")),
  );
  assert.equal(
    nullCut.some((i) => i.path === "cuts[0].cut" && i.message.includes("required")),
    false,
  );

  const nullCamera = validateConteTable({
    version: "conte-table/0.0",
    title: "",
    profile: "anime",
    cuts: [
      {
        cut: "",
        camera: null,
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
  assert.ok(nullCamera.some((i) => i.path === "cuts[0].camera"));
  assert.equal(
    nullCamera.some((i) => i.path === "cuts[0].camera" && i.message.includes("required")),
    false,
  );

  const nullInCamera = validateConteTable({
    version: "conte-table/0.0",
    title: "",
    profile: "anime",
    cuts: [
      {
        cut: "1",
        camera: [null],
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
  assert.ok(
    nullInCamera.some((i) => i.path === "cuts[0].camera[0]" && i.message.includes("must be a string")),
  );

  const nullCuts = validateConteTable({
    version: "conte-table/0.0",
    title: "",
    profile: "anime",
    cuts: null,
  });
  assert.ok(nullCuts.some((i) => i.path === "cuts" && i.message.includes("must be an array")));
  assert.equal(nullCuts.some((i) => i.path === "cuts" && i.message.includes("required")), false);

  const nullCutObject = validateConteTable({
    version: "conte-table/0.0",
    title: "",
    profile: "anime",
    cuts: [null],
  });
  assert.ok(nullCutObject.some((i) => i.message.includes("cut must be an object")));

  const nullVersion = validateConteTable({
    version: null,
    title: "",
    profile: "anime",
    cuts: [],
  });
  assert.ok(
    nullVersion.some((i) => i.path === "version" && i.message.includes("must be a string")),
  );
  assert.equal(
    nullVersion.some((i) => i.path === "version" && i.message.includes("required")),
    false,
  );

  const nullDialogue = validateConteTable({
    version: "conte-table/0.0",
    title: "",
    profile: "anime",
    cuts: [
      {
        cut: "1",
        camera: [],
        timing: [],
        action: [],
        sound: [],
        position: [],
        beat: [],
        ext: [],
        dialogues: [null],
      },
    ],
  });
  assert.ok(nullDialogue.some((i) => i.message.includes("dialogue must be an object")));
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
