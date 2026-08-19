import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { rewriteMesCompat } from "../src/mesCompat.ts";
import { parseMesLang } from "../src/parse.ts";
import { assertValidMedo, validateMedo } from "../src/validateMedo.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const EXAMPLE_FILES = [
  "examples/audio/station.mes",
  "examples/audio/mes-import-compat-only.mes",
  "examples/audio/mes-import-after.mes",
  "examples/manga/station-name.mes",
  "examples/manga/silent-panels.mes",
  "examples/manga/cafe-pose.mes",
  "examples/manga/station-two-pages.mes",
  "examples/animation/station-conte.mes",
];

test("validateMedo accepts reference parser output for all examples", () => {
  for (const rel of EXAMPLE_FILES) {
    const text = readFileSync(join(root, rel), "utf8");
    const medo = parseMesLang(text);
    const issues = validateMedo(medo);
    assert.deepEqual(issues, [], `${rel} failed schema shape:\n${issues.map((i) => `${i.path}: ${i.message}`).join("\n")}`);
  }
});

test("validateMedo accepts mes-import-before after rewriteMesCompat", () => {
  const before = readFileSync(join(root, "examples/audio/mes-import-before.mes"), "utf8");
  const medo = parseMesLang(rewriteMesCompat(before));
  assertValidMedo(medo);
  assert.equal(medo.header.title, "駅前（取り込み前）");
  // Mechanical path: one untitled section; #オープニング stays comment
  assert.equal(medo.body.sections.length, 1);
  assert.equal(medo.body.sections[0]!.title, "");
  const comments = medo.body.sections[0]!.pieces
    .flatMap((p) => p.decorators.filter((d) => d.kind === "comment"))
    .map((d) => d.value);
  assert.ok(comments.includes("オープニング"));
  assert.ok(comments.includes("駅前"));
  assert.ok(comments.includes("改札の外"));
});

test("validateMedo rejects missing rawMark (schema required)", () => {
  const issues = validateMedo({
    version: "medo/0.0",
    header: { profile: "audio", raw: "" },
    body: {
      sections: [
        {
          title: "",
          pieces: [
            {
              dialogue: "hi",
              decorators: [{ kind: "character", value: "にか", attrs: {} }],
            },
          ],
        },
      ],
    },
  });
  assert.ok(issues.some((i) => i.path.includes("rawMark")));
});

test("validateMedo rejects unknown header.profile", () => {
  const issues = validateMedo({
    version: "medo/0.0",
    header: { profile: "novel", raw: "" },
    body: { sections: [] },
  });
  assert.ok(issues.some((i) => i.path === "header.profile"));
});

test("validateMedo rejects unexpected top-level property", () => {
  const issues = validateMedo({
    version: "medo/0.0",
    header: { profile: "audio", raw: "" },
    body: { sections: [] },
    extra: true,
  });
  assert.ok(issues.some((i) => i.message.includes("unexpected property")));
});

test("validateMedo accepts Japanese attr keys such as 吹き出し", () => {
  const issues = validateMedo({
    version: "medo/0.0",
    header: { profile: "manga", raw: "" },
    body: {
      sections: [
        {
          title: "",
          pieces: [
            {
              dialogue: "…",
              decorators: [
                {
                  kind: "character",
                  rawMark: "@",
                  value: "こいと",
                  attrs: { 吹き出し: "心の声", 表情: "ほっとした" },
                },
              ],
            },
          ],
        },
      ],
    },
  });
  assert.deepEqual(issues, []);
});

test("validateMedo rejects unknown decorator kind", () => {
  const issues = validateMedo({
    version: "medo/0.0",
    header: { profile: "audio", raw: "" },
    body: {
      sections: [
        {
          title: "",
          pieces: [
            {
              dialogue: "",
              decorators: [{ kind: "not-a-kind", rawMark: "?", value: "x", attrs: {} }],
            },
          ],
        },
      ],
    },
  });
  assert.ok(issues.some((i) => i.path.includes("kind")));
});

test("validateMedo accepts schema kind unknown (hand-built Medo escape hatch)", () => {
  const issues = validateMedo({
    version: "medo/0.0",
    header: { profile: "audio", raw: "" },
    body: {
      sections: [
        {
          title: "",
          pieces: [
            {
              dialogue: "",
              decorators: [{ kind: "unknown", rawMark: "~", value: "memo", attrs: {} }],
            },
          ],
        },
      ],
    },
  });
  assert.deepEqual(issues, []);
});

test("? ext decorators parse as kind ext with rawMark", () => {
  const medo = parseMesLang(`profile: anime
----
%CUT-1
^寄り
?layout A案
?bg station_evening
@にか
セリフ
`);
  assertValidMedo(medo);
  const piece = medo.body.sections[0]!.pieces[0]!;
  const exts = piece.decorators.filter((d) => d.kind === "ext");
  assert.equal(exts.length, 2);
  assert.deepEqual(
    exts.map((d) => [d.rawMark, d.value]),
    [
      ["?", "layout A案"],
      ["?", "bg station_evening"],
    ],
  );
});

test("examples/animation/station-conte.mes: cuts, timing, and ? ext notes", () => {
  const text = readFileSync(join(root, "examples/animation/station-conte.mes"), "utf8");
  const medo = parseMesLang(text);
  assertValidMedo(medo);
  assert.equal(medo.header.profile, "anime");
  const pieces = medo.body.sections.flatMap((s) => s.pieces);
  assert.ok(pieces.length >= 5);
  const frames = pieces.flatMap((p) => p.decorators.filter((d) => d.kind === "frame"));
  assert.ok(frames.length >= 5);
  const exts = pieces.flatMap((p) => p.decorators.filter((d) => d.kind === "ext"));
  assert.ok(exts.some((d) => d.value.includes("layout")));
  assert.ok(exts.some((d) => d.value.includes("bg")));
  assert.ok(pieces.some((p) => p.decorators.some((d) => d.kind === "timing")));
});
