import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseMesLang } from "../src/parse.ts";
import { assertValidMedo, validateMedo } from "../src/validateMedo.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const EXAMPLE_FILES = [
  "examples/audio/station.mes",
  "examples/audio/mes-import-after.mes",
  "examples/manga/station-name.mes",
  "examples/manga/station-two-pages.mes",
  "examples/manga/silent-panels.mes",
  "examples/manga/cafe-pose.mes",
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
