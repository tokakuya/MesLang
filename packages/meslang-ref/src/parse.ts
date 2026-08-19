import { bracketKeyAt, DECORATOR_MARKS, MARK_TO_KIND, resolveBracketKeys } from "./marks.ts";
import type { Attrs, Decorator, Medo, Piece, Section } from "./types.ts";

export { bracketKeyAt, resolveBracketKeys } from "./bracketKeys.ts";

const HEADER_DELIM = /^----\s*$/;
const SECTION_RE = /^==\s*(.*)$/;
const BRACKET_RE = /\[([^\]]+)\]/g;
const SUGAR_DIALOGUE_RE = /^(.*?)[「]([\s\S]*?)[」]\s*$/;
const SUGAR_TAB_RE = /^(.*?)\t(.*)$/;
const SUGAR_SP4_RE = /^(.*?) {4}(.*)$/;

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function stripLineComments(line: string): string | null {
  if (line.startsWith("//")) return null;
  return line;
}

/** Expand well-known sugar into decorator form before structural parse. */
export function doFlat(text: string): string {
  return normalizeNewlines(text)
    .split("\n")
    .map((line) => {
      const trimmed = line.trimEnd();
      if (!trimmed || DECORATOR_MARKS.has(trimmed[0]!) || trimmed.startsWith("==") || HEADER_DELIM.test(trimmed)) {
        return line;
      }
      let m = SUGAR_DIALOGUE_RE.exec(trimmed);
      if (m) {
        const name = m[1]!.trim();
        const dialogue = m[2]!;
        if (name) return `@${name}\n${dialogue}`;
      }
      m = SUGAR_TAB_RE.exec(trimmed);
      if (m) {
        const name = m[1]!.trim();
        if (name && !DECORATOR_MARKS.has(name[0]!)) return `@${name}\n${m[2]}`;
      }
      m = SUGAR_SP4_RE.exec(trimmed);
      if (m) {
        const name = m[1]!.trim();
        if (name && !DECORATOR_MARKS.has(name[0]!)) return `@${name}\n${m[2]}`;
      }
      return line;
    })
    .join("\n");
}

function splitHeaderBody(text: string): { headerRaw: string; body: string } {
  const lines = normalizeNewlines(text).split("\n");
  const idx = lines.findIndex((l) => HEADER_DELIM.test(l));
  if (idx === -1) return { headerRaw: "", body: lines.join("\n") };
  return {
    headerRaw: lines.slice(0, idx).join("\n"),
    body: lines.slice(idx + 1).join("\n"),
  };
}

function parseHeader(headerRaw: string): Record<string, string> {
  const header: Record<string, string> = { raw: headerRaw };
  for (const line of headerRaw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("//")) continue;
    const m = /^([A-Za-z_][\w-]*|[\u3040-\u30ff\u4e00-\u9fff]+)\s*[:：]\s*(.+)$/.exec(t);
    if (m) header[m[1]!] = m[2]!.trim();
    else if (t.startsWith("$")) {
      const rest = t.slice(1).trim();
      const sp = rest.indexOf(" ");
      if (sp > 0) header[rest.slice(0, sp)] = rest.slice(sp + 1).trim();
    }
  }
  if (!header.profile) header.profile = "audio";
  return header;
}

function extractInlineAttrs(rest: string, bracketKeys: readonly string[]): { value: string; attrs: Attrs } {
  const attrs: Attrs = {};
  // Bracket sugar (ADR 0005 / 0007): keys from resolveBracketKeys
  let working = rest;
  const brackets: string[] = [];
  working = working.replace(BRACKET_RE, (_, inner: string) => {
    brackets.push(inner.trim());
    return "";
  });
  for (let i = 0; i < brackets.length; i++) {
    attrs[bracketKeyAt(bracketKeys, i)] = brackets[i]!;
  }

  // :key value tokens — keys must start with a letter / CJK / underscore
  // so timecodes like &0:08 are not split into attrs.
  const attrStarts: { index: number; key: string; markLen: number }[] = [];
  const re = /([:：])([A-Za-z_\u3040-\u30ff\u4e00-\u9fff][\w\u3040-\u30ff\u4e00-\u9fff-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(working)) !== null) {
    attrStarts.push({ index: m.index, key: m[2]!, markLen: m[0].length });
  }

  if (attrStarts.length === 0) {
    return { value: working.trim(), attrs };
  }

  const value = working.slice(0, attrStarts[0]!.index).trim();
  for (let i = 0; i < attrStarts.length; i++) {
    const cur = attrStarts[i]!;
    const from = cur.index + cur.markLen;
    const to = i + 1 < attrStarts.length ? attrStarts[i + 1]!.index : working.length;
    attrs[cur.key] = working.slice(from, to).trim();
  }
  return { value, attrs };
}

function parseDecoratorLine(line: string, bracketKeys: readonly string[]): Decorator | null {
  const mark = line[0]!;
  if (!DECORATOR_MARKS.has(mark)) return null;
  const kind = MARK_TO_KIND[mark] ?? "unknown";
  const { value, attrs } = extractInlineAttrs(line.slice(1).trim(), bracketKeys);
  return { kind, rawMark: mark, value, attrs };
}

function isAttrOnlyLine(line: string): boolean {
  // ADR 0002: `::img=` などの二重コロンは属性構文ではない
  if (line.startsWith("::") || line.startsWith("：：")) return false;
  return line.startsWith(":") || line.startsWith("：");
}

function parseAttrOnlyLine(line: string, bracketKeys: readonly string[]): Attrs {
  const { attrs } = extractInlineAttrs(line, bracketKeys);
  // extractInlineAttrs expects optional leading value; for `:表情 泣` value empty and attrs filled
  // But our regex needs space after key — `:表情 泣` works via tokenizing from start.
  // If line is only attrs, prepend fake to reuse? Actually extractInlineAttrs on `:表情 泣`:
  // attrStarts at 0, value="", attrs={表情:泣} — good if we pass the line as-is.
  if (Object.keys(attrs).length > 0) return attrs;
  // fallback single :key value
  const m = /^[:：](\S+)\s+(.+)$/.exec(line);
  if (m) return { [m[1]!]: m[2]!.trim() };
  return {};
}

function parsePiece(block: string, bracketKeys: readonly string[]): Piece | null {
  const rawLines = block
    .split("\n")
    .map((l) => l.trimEnd())
    .map(stripLineComments)
    .filter((l): l is string => l !== null)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (rawLines.length === 0) return null;

  const decorators: Decorator[] = [];
  const dialogueLines: string[] = [];
  let lastDecorator: Decorator | null = null;

  for (const line of rawLines) {
    if (isAttrOnlyLine(line)) {
      const attrs = parseAttrOnlyLine(line, bracketKeys);
      if (Object.keys(attrs).length > 0) {
        // 属性は直前のデコレーターに付く。直前が無い（ピース先頭やセリフのあと）ときは
        // 黙って捨てず、セリフ行として残す（ピース直下 attrs は v0 Medo に無い）。
        if (lastDecorator) {
          Object.assign(lastDecorator.attrs, attrs);
          continue;
        }
      }
      // 属性として読めない `:…` 行、または直前デコレーターなしの属性行はセリフ側へ
    } else {
      const dec = parseDecoratorLine(line, bracketKeys);
      if (dec) {
        decorators.push(dec);
        lastDecorator = dec;
        continue;
      }
    }
    dialogueLines.push(line);
    lastDecorator = null;
  }

  return {
    dialogue: dialogueLines.join("\n"),
    decorators,
  };
}

function splitPieces(text: string): string[] {
  return normalizeNewlines(text)
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);
}

export function parseMesLang(input: string): Medo {
  const flat = doFlat(input);
  const { headerRaw, body } = splitHeaderBody(flat);
  const header = parseHeader(headerRaw);
  const bracketKeys = resolveBracketKeys(header);

  const sections: Section[] = [];
  let current: Section = { title: "", pieces: [] };

  // Process body while honoring section lines; pieces are blank-line separated
  // Strategy: split by pieces first is wrong when == is inside. Scan lines into buffers.
  const lines = normalizeNewlines(body).split("\n");
  let buf: string[] = [];

  const flushPieceBuf = () => {
    const block = buf.join("\n").trim();
    buf = [];
    if (!block) return;
    // block may contain section line at start
    const blockLines = block.split("\n");
    let i = 0;
    while (i < blockLines.length) {
      const sec = SECTION_RE.exec(blockLines[i]!.trim());
      if (sec && i === 0) {
        if (current.pieces.length > 0 || current.title) sections.push(current);
        current = { title: sec[1]!.trim(), pieces: [] };
        i++;
        const rest = blockLines.slice(i).join("\n").trim();
        if (rest) {
          const piece = parsePiece(rest, bracketKeys);
          if (piece) current.pieces.push(piece);
        }
        return;
      }
      break;
    }
    const piece = parsePiece(block, bracketKeys);
    if (piece) current.pieces.push(piece);
  };

  for (const line of lines) {
    if (line.trim() === "") {
      flushPieceBuf();
      continue;
    }
    const sec = SECTION_RE.exec(line.trim());
    if (sec && buf.length === 0) {
      if (current.pieces.length > 0 || current.title) sections.push(current);
      current = { title: sec[1]!.trim(), pieces: [] };
      continue;
    }
    buf.push(line);
  }
  flushPieceBuf();
  if (current.pieces.length > 0 || current.title || sections.length === 0) {
    sections.push(current);
  }

  return {
    version: "medo/0.0",
    header,
    body: { sections },
  };
}

/** Convenience getters used by tests / CLI. */
export function firstCharacter(piece: Piece): Decorator | undefined {
  return piece.decorators.find((d) => d.kind === "character");
}
