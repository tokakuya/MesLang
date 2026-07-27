#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { countDialogueChars } from "./countDialogue.ts";
import { rewriteMesCompat } from "./mesCompat.ts";
import { parseMesLang } from "./parse.ts";

const args = process.argv.slice(2);
const countMode = args.includes("--count") || args.includes("-c");
const compatMode = args.includes("--compat");
const file = args.find((a) => !a.startsWith("-"));

if (!file) {
  console.error("Usage: npm run parse -- [--count|-c] [--compat] <file.mes>");
  process.exit(1);
}

let text = readFileSync(file, "utf8");
if (compatMode) text = rewriteMesCompat(text);

const medo = parseMesLang(text);

if (countMode) {
  const counts = countDialogueChars(medo);
  console.log(JSON.stringify(counts, null, 2));
} else {
  console.log(JSON.stringify(medo, null, 2));
}
