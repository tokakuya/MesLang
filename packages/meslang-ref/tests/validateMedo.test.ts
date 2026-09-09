import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { rewriteMesCompat } from "../src/mesCompat.ts";
import { firstCharacter, parseMesLang } from "../src/parse.ts";
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
  assert.ok(issues.some((i) => i.path.includes("rawMark") && i.message.includes("required")));
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

test("validateMedo accepts empty sections / pieces / decorators / dialogue (shape edges)", () => {
  assert.deepEqual(
    validateMedo({
      version: "medo/0.0",
      header: { profile: "audio", raw: "" },
      body: { sections: [] },
    }),
    [],
  );
  assert.deepEqual(
    validateMedo({
      version: "medo/0.0",
      header: { profile: "manga", raw: "" },
      body: {
        sections: [{ title: "無言ページ", pieces: [] }],
      },
    }),
    [],
  );
  assert.deepEqual(
    validateMedo({
      version: "medo/0.0",
      header: { profile: "manga", raw: "" },
      body: {
        sections: [
          {
            title: "",
            pieces: [{ dialogue: "", decorators: [] }],
          },
        ],
      },
    }),
    [],
  );
  assert.deepEqual(
    validateMedo({
      version: "medo/0.0",
      header: { profile: "manga", raw: "" },
      body: {
        sections: [
          {
            title: "",
            pieces: [
              {
                dialogue: "",
                decorators: [{ kind: "frame", rawMark: "%", value: "1", attrs: {} }],
              },
            ],
          },
        ],
      },
    }),
    [],
  );
});

test("validateMedo rejects piece-level attrs (attrs belong on decorators)", () => {
  const issues = validateMedo({
    version: "medo/0.0",
    header: { profile: "manga", raw: "" },
    body: {
      sections: [
        {
          title: "",
          pieces: [
            {
              dialogue: "hi",
              decorators: [],
              attrs: { 表情: "微笑" },
            },
          ],
        },
      ],
    },
  });
  assert.ok(issues.some((i) => i.path.includes("pieces") && i.message.includes("unexpected property")));
});

test("validateMedo distinguishes empty values from missing required keys", () => {
  const emptyOk = validateMedo({
    version: "medo/0.0",
    header: {},
    body: {
      sections: [
        {
          title: "",
          pieces: [
            {
              dialogue: "",
              decorators: [{ kind: "comment", rawMark: "", value: "", attrs: {} }],
            },
          ],
        },
      ],
    },
  });
  assert.deepEqual(emptyOk, []);

  const missingDialogue = validateMedo({
    version: "medo/0.0",
    header: {},
    body: {
      sections: [
        {
          title: "",
          pieces: [{ decorators: [] }],
        },
      ],
    },
  });
  assert.ok(
    missingDialogue.some((i) => i.path.includes("dialogue") && i.message.includes("required")),
  );

  const missingAttrs = validateMedo({
    version: "medo/0.0",
    header: {},
    body: {
      sections: [
        {
          title: "",
          pieces: [
            {
              dialogue: "",
              decorators: [{ kind: "comment", rawMark: "#", value: "ト書き" }],
            },
          ],
        },
      ],
    },
  });
  assert.ok(missingAttrs.some((i) => i.path.includes("attrs") && i.message.includes("required")));

  const missingHeader = validateMedo({
    version: "medo/0.0",
    body: { sections: [] },
  });
  assert.ok(missingHeader.some((i) => i.path === "header" && i.message.includes("required")));

  const missingBody = validateMedo({
    version: "medo/0.0",
    header: {},
  });
  assert.ok(missingBody.some((i) => i.path === "body" && i.message.includes("required")));
});

test("validateMedo header edges: missing profile ok, empty/unknown profile rejected, extra string keys ok", () => {
  assert.deepEqual(
    validateMedo({
      version: "medo/0.0",
      header: {},
      body: { sections: [] },
    }),
    [],
  );
  assert.deepEqual(
    validateMedo({
      version: "medo/0.0",
      header: { title: "駅前", "bracket-keys": "表情, 姿勢", raw: "" },
      body: { sections: [] },
    }),
    [],
  );

  const emptyProfile = validateMedo({
    version: "medo/0.0",
    header: { profile: "" },
    body: { sections: [] },
  });
  assert.ok(emptyProfile.some((i) => i.path === "header.profile"));

  const nestedHeader = validateMedo({
    version: "medo/0.0",
    header: { extra: { nope: true } },
    body: { sections: [] },
  });
  assert.ok(nestedHeader.some((i) => i.path === "header.extra"));

  const decoratorExtra = validateMedo({
    version: "medo/0.0",
    header: { profile: "audio" },
    body: {
      sections: [
        {
          title: "",
          pieces: [
            {
              dialogue: "",
              decorators: [
                { kind: "comment", rawMark: "#", value: "x", attrs: {}, note: "nope" },
              ],
            },
          ],
        },
      ],
    },
  });
  assert.ok(
    decoratorExtra.some((i) => i.path.includes("decorators") && i.message.includes("unexpected property")),
  );
});

test("validateMedo distinguishes empty arrays from objects in array slots (配列とオブジェクト)", () => {
  assert.deepEqual(
    validateMedo({
      version: "medo/0.0",
      header: {},
      body: { sections: [] },
    }),
    [],
  );

  const objectSections = validateMedo({
    version: "medo/0.0",
    header: {},
    body: { sections: {} },
  });
  assert.ok(
    objectSections.some((i) => i.path === "body.sections" && i.message.includes("must be an array")),
  );

  const arrayBody = validateMedo({
    version: "medo/0.0",
    header: {},
    body: [],
  });
  assert.ok(arrayBody.some((i) => i.path === "body" && i.message.includes("must be an object")));

  const arrayHeader = validateMedo({
    version: "medo/0.0",
    header: [],
    body: { sections: [] },
  });
  assert.ok(arrayHeader.some((i) => i.path === "header" && i.message.includes("must be an object")));

  const objectDecorators = validateMedo({
    version: "medo/0.0",
    header: {},
    body: {
      sections: [
        {
          title: "",
          pieces: [{ dialogue: "", decorators: {} }],
        },
      ],
    },
  });
  assert.ok(
    objectDecorators.some(
      (i) => i.path.includes("decorators") && i.message.includes("must be an array"),
    ),
  );

  const arrayAttrs = validateMedo({
    version: "medo/0.0",
    header: {},
    body: {
      sections: [
        {
          title: "",
          pieces: [
            {
              dialogue: "",
              decorators: [{ kind: "comment", rawMark: "#", value: "x", attrs: [] }],
            },
          ],
        },
      ],
    },
  });
  assert.ok(
    arrayAttrs.some((i) => i.path.includes("attrs") && i.message.includes("must be an object")),
  );
});

test("validateMedo: cafe-pose / station-name %10 multi-speech fixtures stay valid", () => {
  const station = parseMesLang(readFileSync(join(root, "examples/manga/station-name.mes"), "utf8"));
  const cafe = parseMesLang(readFileSync(join(root, "examples/manga/cafe-pose.mes"), "utf8"));
  assertValidMedo(station);
  assertValidMedo(cafe);

  const stationPieces = station.body.sections[0]!.pieces;
  const cafePieces = cafe.body.sections[0]!.pieces;
  const station10 = stationPieces.findIndex((p) =>
    p.decorators.some((d) => d.kind === "frame" && d.value === "10"),
  );
  const cafe10 = cafePieces.findIndex((p) =>
    p.decorators.some((d) => d.kind === "frame" && d.value === "10"),
  );
  assert.ok(station10 >= 0);
  assert.ok(cafe10 >= 0);

  // Same panel: first piece has %, following pieces continue without frame
  const stationSecond = stationPieces[station10 + 1]!;
  const cafeSecond = cafePieces[cafe10 + 1]!;
  assert.equal(
    stationSecond.decorators.some((d) => d.kind === "frame"),
    false,
  );
  assert.equal(
    cafeSecond.decorators.some((d) => d.kind === "frame"),
    false,
  );
  assert.ok(stationPieces[station10]!.decorators.some((d) => d.kind === "sound"));
  assert.match(stationPieces[station10]!.dialogue, /窓際/);
  assert.match(stationSecond.dialogue, /足が重い/);
  assert.match(cafePieces[cafe10]!.dialogue, /ショートケーキ/);
  assert.match(cafeSecond.dialogue, /それでいい/);

  const station11 = stationPieces.findIndex((p) =>
    p.decorators.some((d) => d.kind === "frame" && d.value === "11"),
  );
  assert.ok(station11 >= 0);
  const stationOrderSecond = stationPieces[station11 + 1]!;
  const stationOrderThird = stationPieces[station11 + 2]!;
  assert.equal(
    stationOrderSecond.decorators.some((d) => d.kind === "frame"),
    false,
  );
  assert.equal(
    stationOrderThird.decorators.some((d) => d.kind === "frame"),
    false,
  );
  assert.match(stationPieces[station11]!.dialogue, /ご注文/);
  assert.match(stationOrderSecond.dialogue, /いつもので/);
  assert.match(stationOrderThird.dialogue, /注文まで来たか/);
  assert.equal(firstCharacter(stationPieces[station11]!)?.attrs["吹き出し"], undefined);

  // Hand-shaped slice of the %10 pair still passes (empty attrs / multi-piece)
  const sliceIssues = validateMedo({
    version: "medo/0.0",
    header: { profile: "manga", title: "slice", raw: "" },
    body: {
      sections: [
        {
          title: "",
          pieces: [stationPieces[station10]!, stationSecond, cafePieces[cafe10]!, cafeSecond],
        },
      ],
    },
  });
  assert.deepEqual(sliceIssues, []);
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
