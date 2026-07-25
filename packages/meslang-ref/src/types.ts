export type DecoratorKind =
  | "character"
  | "comment"
  | "sound"
  | "position"
  | "timing"
  | "ext"
  | "frame"
  | "camera"
  | "beat"
  | "unknown";

export type Attrs = Record<string, string>;

export interface Decorator {
  kind: DecoratorKind;
  rawMark: string;
  value: string;
  attrs: Attrs;
}

export interface Piece {
  dialogue: string;
  decorators: Decorator[];
}

export interface Section {
  title: string;
  pieces: Piece[];
}

export interface Medo {
  version: "medo/0.0";
  header: Record<string, string>;
  body: {
    sections: Section[];
  };
}
