// Module-level clipboard so contents survive canvas switches (component remounts)

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

let clipboard: ClipboardEntry[] = [];

export function setClipboard(items: ClipboardEntry[]): void {
  clipboard = [...items];
}

export function getClipboard(): ClipboardEntry[] {
  return clipboard;
}
