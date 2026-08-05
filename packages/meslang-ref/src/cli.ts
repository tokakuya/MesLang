#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { toConteTable } from "./conteTable.ts";
import { countDialogueChars } from "./countDialogue.ts";
import { rewriteMesCompat } from "./mesCompat.ts";
import { parseMesLang } from "./parse.ts";
import { validateConteTable } from "./validateConteTable.ts";
import { validateMedo } from "./validateMedo.ts";

const args = process.argv.slice(2);
const countMode = args.includes("--count") || args.includes("-c");
const conteMode = args.includes("--conte") || args.includes("-t");
const compatMode = args.includes("--compat");
const validateMode = args.includes("--validate");
const file = args.find((a) => !a.startsWith("-"));

if (!file) {
  console.error(
    "Usage: npm run parse -- [--count|-c] [--conte|-t] [--compat] [--validate] <file.mes>",
  );
  process.exit(1);
}

let text = readFileSync(file, "utf8");
if (compatMode) text = rewriteMesCompat(text);

const medo = parseMesLang(text);

if (validateMode) {
  const issues = validateMedo(medo);
  if (issues.length > 0) {
    console.error(
      issues.map((i) => `${i.path || "(root)"}: ${i.message}`).join("\n"),
    );
    process.exit(1);
  }
}

if (countMode) {
  const counts = countDialogueChars(medo);
  console.log(JSON.stringify(counts, null, 2));
} else if (conteMode) {
  const table = toConteTable(medo);
  if (validateMode) {
    const issues = validateConteTable(table);
    if (issues.length > 0) {
      console.error(
        issues.map((i) => `${i.path || "(root)"}: ${i.message}`).join("\n"),
      );
      process.exit(1);
    }
  }
  console.log(JSON.stringify(table, null, 2));
} else {
  console.log(JSON.stringify(medo, null, 2));
}
