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

export interface ColorInfo {
  hex: string;
  rgb: string;
  r: number;
  g: number;
  b: number;
  a: number;
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
  border?: string;
  borderRadius?: string;
  className: string;
  section: string;
}

export interface TextBlockItem {
  id: string;
  name: string;
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
  border?: string;
  borderRadius?: string;
  className: string;
}

export interface StructureNode {
  id: string;
  name: string;
  tag: "div";
  className?: string;
  backgroundColor?: string | null;
  boxShadow?: string;
  border?: string;
  borderRadius?: string;
  children: TextBlockItem[];
}

export interface SvgItem {
  id: string;
  name: string;
  content: string; // XML-строка SVG
  width?: number;
  height?: number;
}

export interface FontItem {
  family: string;
  weights: number[];
}

export type ExtractorResult = [
  { colors: ColorItem[] },
  { images: ImageItem[] },
  { texts: TextItem[] },
  { structure: StructureNode[] },
  { svgs: SvgItem[] },
  { fonts: FontItem[] }, // 🌟 Новый 6-й элемент
];
