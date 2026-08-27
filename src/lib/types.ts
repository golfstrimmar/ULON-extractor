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
  id: string;       // nodeId
  name: string;
  imageHash: string;
  width: number;
  height: number;
  scaleMode: string;
  data: string;     // заполняется сервером через Figma REST API
}

// [ { colors }, { images, fileKey } ]
export type ExtractorResult = [
  { colors: ColorItem[] },
  { images: ImageItem[]; fileKey: string | undefined }
];
