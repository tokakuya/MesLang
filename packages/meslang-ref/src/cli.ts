#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseMesLang } from "./parse.ts";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run parse -- <file.mes>");
  process.exit(1);
}

const text = readFileSync(file, "utf8");
const medo = parseMesLang(text);
console.log(JSON.stringify(medo, null, 2));
