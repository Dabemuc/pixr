export type ClipboardImage = {
  kind: "image";
  storageKey: string;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  x: number;
  y: number;
  w: number;
  h: number;
  description?: string;
  descriptionAlign?: "left" | "center";
};

export type ClipboardShape = {
  kind: "shape";
  type: "text" | "arrow";
  x: number;
  y: number;
  w?: number;
  h?: number;
  x2?: number;
  y2?: number;
  content?: string;
  zIndex: number;
  textAlign?: "left" | "center" | "right";
  isHeadline?: boolean;
  showBorder?: boolean;
  bgColor?: string;
  textColor?: string;
};

export type ClipboardEntry = ClipboardImage | ClipboardShape;

export const CLIPBOARD_PREFIX = "pixr-clipboard:";

export function serializeClipboard(entries: ClipboardEntry[]): string {
  return CLIPBOARD_PREFIX + JSON.stringify(entries);
}

export function deserializeClipboard(text: string): ClipboardEntry[] | null {
  if (!text.startsWith(CLIPBOARD_PREFIX)) return null;
  try {
    return JSON.parse(text.slice(CLIPBOARD_PREFIX.length)) as ClipboardEntry[];
  } catch {
    return null;
  }
}
