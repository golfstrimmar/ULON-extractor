import type { ColorInfo, RgbColor } from "./types";

/**
 * Нормализует компонент 0..1 в 0..255 целое
 */
export function to255(val: number): number {
  return Math.min(255, Math.max(0, Math.round(val * 255)));
}

/**
 * Преобразует RGB (0..1) в HEX строку (#RRGGBB или #RRGGBBAA если есть прозрачность)
 */
export function rgbToHex(color: RgbColor, opacity = 1): string {
  const rHex = to255(color.r).toString(16).padStart(2, "0").toUpperCase();
  const gHex = to255(color.g).toString(16).padStart(2, "0").toUpperCase();
  const bHex = to255(color.b).toString(16).padStart(2, "0").toUpperCase();

  const finalAlpha = color.a !== undefined ? color.a * opacity : opacity;

  if (finalAlpha < 0.999) {
    const aHex = to255(finalAlpha).toString(16).padStart(2, "0").toUpperCase();
    return `#${rHex}${gHex}${bHex}${aHex}`;
  }

  return `#${rHex}${gHex}${bHex}`;
}

/**
 * Преобразует RGB (0..1) в CSS rgb/rgba строку
 */
export function rgbToCss(color: RgbColor, opacity = 1): string {
  const r = to255(color.r);
  const g = to255(color.g);
  const b = to255(color.b);
  const a = color.a !== undefined ? color.a * opacity : opacity;

  if (a < 0.999) {
    return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;
  }

  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Создает полный объект ColorInfo
 */
export function createColorInfo(color: RgbColor, opacity = 1): ColorInfo {
  const finalAlpha = color.a !== undefined ? color.a * opacity : opacity;

  return {
    hex: rgbToHex(color, opacity),
    rgb: rgbToCss(color, opacity),
    r: to255(color.r),
    g: to255(color.g),
    b: to255(color.b),
    a: Number(finalAlpha.toFixed(3)),
  };
}
