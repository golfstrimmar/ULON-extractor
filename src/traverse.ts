import { rgbToCss, rgbToHex } from "./lib/colors";
import type {
  ColorItem,
  ExtractorResult,
  ImageItem,
  RgbColor,
  StructureNode,
  TextItem,
} from "./lib/types";

// ─── Вспомогательные функции для изображений ────────────────────────────────

async function exportNodeAsDataUrl(node: SceneNode): Promise<string | null> {
  try {
    if (node.removed || !node.visible) return null;
    if (!("exportAsync" in node)) return null;

    const width = "width" in node && typeof node.width === "number" ? node.width : 0;
    const height = "height" in node && typeof node.height === "number" ? node.height : 0;
    if (width <= 0 || height <= 0) return null;

    const targetWidth = Math.min(Math.max(Math.round(width), 100), 600);

    const bytes = await node.exportAsync({
      format: "JPG",
      constraint: { type: "WIDTH", value: targetWidth },
      quality: 0.85,
    });

    if (!bytes || bytes.length === 0) return null;

    const base64 = figma.base64Encode(bytes);
    return `data:image/jpeg;base64,${base64}`;
  } catch (err) {
    console.warn("Failed to export image node:", node.name, err);
    return null;
  }
}

// ─── Вспомогательные функции для типографики и стилей ───────────────────────

function extractFontWeight(fontStyle?: string): number {
  if (!fontStyle) return 400;
  const s = fontStyle.toLowerCase();
  if (s.includes("thin") || s.includes("hairline")) return 100;
  if (s.includes("extralight") || s.includes("extra-light") || s.includes("ultra light")) return 200;
  if (s.includes("light")) return 300;
  if (s.includes("medium")) return 500;
  if (s.includes("semibold") || s.includes("semi-bold") || s.includes("demi")) return 600;
  if (s.includes("bold")) return 700;
  if (s.includes("extrabold") || s.includes("extra-bold") || s.includes("ultrabold")) return 800;
  if (s.includes("black") || s.includes("heavy")) return 900;
  return 400;
}

function extractSolidColor(paints: readonly Paint[] | PluginAPI["mixed"] | undefined): string | null {
  if (!paints || !Array.isArray(paints)) return null;
  for (const paint of paints) {
    if (paint.visible !== false && paint.type === "SOLID") {
      return rgbToHex(paint.color, paint.opacity ?? 1);
    }
  }
  return null;
}

function extractBackgroundColor(node: SceneNode): string | null {
  if ("fills" in node) {
    const bg = extractSolidColor(node.fills as readonly Paint[]);
    if (bg) return bg;
  }
  if ("backgrounds" in node) {
    const bg = extractSolidColor(node.backgrounds as readonly Paint[]);
    if (bg) return bg;
  }
  return null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "box";
}

// ─── Сбор цветов и изображений ──────────────────────────────────────────────

interface ImageCandidate {
  node: SceneNode;
  imageHash: string;
  scaleMode: string;
}

function collectPaints(
  paints: readonly Paint[] | PluginAPI["mixed"] | undefined,
  node: SceneNode,
  addColor: (color: RgbColor, opacity?: number) => void,
  imageCandidates: ImageCandidate[]
) {
  if (!paints || !Array.isArray(paints)) return;

  for (const paint of paints) {
    if (paint.visible === false) continue;

    if (paint.type === "SOLID") {
      addColor(paint.color, paint.opacity ?? 1);
    } else if (
      paint.type === "GRADIENT_LINEAR" ||
      paint.type === "GRADIENT_RADIAL" ||
      paint.type === "GRADIENT_ANGULAR" ||
      paint.type === "GRADIENT_DIAMOND"
    ) {
      const gradientOpacity = paint.opacity ?? 1;
      for (const stop of paint.gradientStops) {
        addColor(
          { r: stop.color.r, g: stop.color.g, b: stop.color.b, a: stop.color.a },
          gradientOpacity
        );
      }
    } else if (paint.type === "IMAGE" && paint.imageHash) {
      imageCandidates.push({
        node,
        imageHash: paint.imageHash,
        scaleMode: paint.scaleMode || "FILL",
      });
    }
  }
}

// ─── Рекурсивный обход нод ──────────────────────────────────────────────────

function scanNode(
  node: SceneNode,
  currentSection: string,
  parentBgColor: string | null,
  addColor: (color: RgbColor, opacity?: number) => void,
  imageCandidates: ImageCandidate[],
  textItems: TextItem[]
): StructureNode | null {
  if (node.visible === false) return null;

  const nodeBgColor = extractBackgroundColor(node) || parentBgColor;

  // 1. Сбор цветов из заливок, обводок, фонов, теней
  if ("fills" in node) {
    if (node.fills === figma.mixed && node.type === "TEXT") {
      try {
        const segments = node.getStyledTextSegments(["fills"]);
        for (const seg of segments) {
          collectPaints(seg.fills, node, addColor, imageCandidates);
        }
      } catch {
        // fallback
      }
    } else {
      collectPaints(node.fills as readonly Paint[], node, addColor, imageCandidates);
    }
  }

  if ("strokes" in node) {
    collectPaints(node.strokes as readonly Paint[], node, addColor, imageCandidates);
  }

  if ("backgrounds" in node) {
    collectPaints(node.backgrounds as readonly Paint[], node, addColor, imageCandidates);
  }

  if ("effects" in node && Array.isArray(node.effects)) {
    for (const effect of node.effects) {
      if (effect.visible === false) continue;
      if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
        addColor(effect.color, 1);
      }
    }
  }

  // 2. Обработка текстовой ноды
  if (node.type === "TEXT") {
    const rawText = node.characters.trim();
    if (!rawText) return null;

    let fontFamily = "Inter";
    let fontStyle = "Regular";
    if (node.fontName && node.fontName !== figma.mixed) {
      fontFamily = node.fontName.family;
      fontStyle = node.fontName.style;
    }

    const fontSize = typeof node.fontSize === "number" ? Math.round(node.fontSize) : 16;
    const fontWeight = extractFontWeight(fontStyle);

    let lineHeight: number | string = "normal";
    if (node.lineHeight && node.lineHeight !== figma.mixed) {
      if (node.lineHeight.unit === "PIXELS") {
        lineHeight = Math.round(node.lineHeight.value);
      } else if (node.lineHeight.unit === "PERCENT") {
        lineHeight = `${Math.round(node.lineHeight.value)}%`;
      }
    }

    let letterSpacing: number | string = 0;
    if (node.letterSpacing && node.letterSpacing !== figma.mixed) {
      if (node.letterSpacing.unit === "PIXELS") {
        letterSpacing = parseFloat(node.letterSpacing.value.toFixed(2));
      } else if (node.letterSpacing.unit === "PERCENT") {
        letterSpacing = `${parseFloat(node.letterSpacing.value.toFixed(2))}%`;
      }
    }

    const textAlignMap: Record<string, string> = {
      LEFT: "left",
      CENTER: "center",
      RIGHT: "right",
      JUSTIFIED: "justify",
    };
    const textAlign = node.textAlignHorizontal ? textAlignMap[node.textAlignHorizontal] || "left" : "left";

    const textColor = extractSolidColor(
      node.fills !== figma.mixed ? (node.fills as readonly Paint[]) : undefined
    );

    const fontSlug = fontFamily.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const className = `font-${fontSlug}-${fontWeight}-${fontSize}`;

    const textItem: TextItem = {
      id: node.id,
      tag: "p",
      text: rawText,
      fontFamily,
      fontSize,
      fontWeight,
      lineHeight,
      letterSpacing,
      textAlign,
      color: textColor,
      backgroundColor: nodeBgColor,
      className,
      section: currentSection || node.name,
    };

    textItems.push(textItem);

    return {
      id: node.id,
      name: node.name,
      tag: "p",
      className,
      backgroundColor: nodeBgColor,
      text: rawText,
      children: [],
    };
  }

  // 3. Обработка контейнеров (Frame, Group, Section, Component)
  const isSectionContainer =
    node.type === "FRAME" ||
    node.type === "SECTION" ||
    node.type === "GROUP" ||
    node.type === "COMPONENT" ||
    node.type === "INSTANCE";

  const nextSection = isSectionContainer && !currentSection ? node.name : currentSection;

  const childStructureNodes: StructureNode[] = [];

  if ("children" in node) {
    for (const child of node.children) {
      const childNode = scanNode(
        child,
        nextSection,
        nodeBgColor,
        addColor,
        imageCandidates,
        textItems
      );
      if (childNode) {
        childStructureNodes.push(childNode);
      }
    }
  }

  // Возвращаем структуру div только если внутри есть дети или это важный контейнер
  if (childStructureNodes.length > 0 || isSectionContainer) {
    return {
      id: node.id,
      name: node.name,
      tag: "div",
      className: `section-${slugify(node.name)}`,
      backgroundColor: nodeBgColor,
      children: childStructureNodes,
    };
  }

  return null;
}

// ─── Главная функция извлечения ─────────────────────────────────────────────

export async function extractFromNodes(
  roots: readonly SceneNode[]
): Promise<ExtractorResult> {
  const seenColors = new Set<string>();
  const colors: ColorItem[] = [];
  const rawImageCandidates: ImageCandidate[] = [];
  const texts: TextItem[] = [];
  const structure: StructureNode[] = [];

  const addColor = (color: RgbColor, opacity = 1) => {
    const hex = rgbToHex(color, opacity);
    if (!seenColors.has(hex)) {
      seenColors.add(hex);
      colors.push({ hex, original: rgbToCss(color, opacity) });
    }
  };

  // 1. Обход дерева, сбор цветов, текстов и иерархической структуры
  for (const root of roots) {
    const structNode = scanNode(
      root,
      "",
      null,
      addColor,
      rawImageCandidates,
      texts
    );
    if (structNode) {
      structure.push(structNode);
    }
  }

  // 2. Дедупликация картинок по imageHash
  const seenHashes = new Set<string>();
  const uniqueCandidates: ImageCandidate[] = [];
  for (const c of rawImageCandidates) {
    if (!seenHashes.has(c.imageHash)) {
      seenHashes.add(c.imageHash);
      uniqueCandidates.push(c);
    }
  }

  // 3. Экспорт картинок
  const images: ImageItem[] = [];
  for (const c of uniqueCandidates) {
    const dataUrl = await exportNodeAsDataUrl(c.node);
    images.push({
      id: c.node.id,
      name: c.node.name,
      imageHash: c.imageHash,
      width: Math.round("width" in c.node ? (c.node as LayoutMixin).width : 0),
      height: Math.round("height" in c.node ? (c.node as LayoutMixin).height : 0),
      scaleMode: c.scaleMode,
      data: dataUrl || "",
    });
  }

  return [{ colors }, { images }, { texts }, { structure }];
}
