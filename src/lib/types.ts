export interface RgbColor {
  r: number; // 0..1
  g: number; // 0..1
  b: number; // 0..1
  a?: number; // 0..1
}

export interface ColorItem {
  hex: string;
  original: string;
}

export interface ImageItem {
  id: string; // nodeId
  name: string;
  imageHash: string;
  width: number;
  height: number;
  scaleMode: string;
  data: string;
}

export interface TextItem {
  id: string;
  tag: "p";
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number | string;
  letterSpacing: number | string;
  textAlign: string;
  color: string | null;
  backgroundColor: string | null;
  boxShadow?: string | null;
  className: string;
  section: string;
}

export interface StructureNode {
  id: string;
  name: string;
  tag: "div" | "p";
  className?: string;
  backgroundColor?: string | null;
  boxShadow?: string | null;
  text?: string;
  children: StructureNode[];
}

export type ExtractorResult = [
  { colors: ColorItem[] },
  { images: ImageItem[] },
  { texts: TextItem[] },
  { structure: StructureNode[] }
];
