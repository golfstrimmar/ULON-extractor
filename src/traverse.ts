import { rgbToCss, rgbToHex } from "./lib/colors";
import type {
  ColorItem,
  ExtractorResult,
  FontItem,
  ImageItem,
  RgbColor,
  StructureNode,
  SvgItem,
  TextBlockItem,
  TextItem,
} from "./lib/types";

// ─── Вспомогательные функции для изображений и SVG ──────────────────────────

function decodeUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") {
    try {
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      // fallback below
    }
  }
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const c = bytes[i++];
    if (c < 0x80) {
      out += String.fromCharCode(c);
    } else if (c > 0xbf && c < 0xe0) {
      const c2 = bytes[i++];
      out += String.fromCharCode(((c & 0x1f) << 6) | (c2 & 0x3f));
    } else if (c > 0xdf && c < 0xf0) {
      const c2 = bytes[i++];
      const c3 = bytes[i++];
      out += String.fromCharCode(
        ((c & 0x0f) << 12) | ((c2 & 0x3f) << 6) | (c3 & 0x3f),
      );
    } else {
      const c2 = bytes[i++];
      const c3 = bytes[i++];
      const c4 = bytes[i++];
      const u =
        (((c & 0x07) << 18) |
          ((c2 & 0x3f) << 12) |
          ((c3 & 0x3f) << 6) |
          (c4 & 0x3f)) -
        0x10000;
      out += String.fromCharCode(0xd800 + (u >> 10), 0xdc00 + (u & 0x3ff));
    }
  }
  return out;
}

async function exportNodeAsDataUrl(node: SceneNode): Promise<string | null> {
  try {
    if (node.removed || !node.visible) return null;
    if (!("exportAsync" in node)) return null;

    const width =
      "width" in node && typeof node.width === "number" ? node.width : 0;
    const height =
      "height" in node && typeof node.height === "number" ? node.height : 0;
    if (width <= 0 || height <= 0) return null;

    const targetWidth = Math.min(Math.max(Math.round(width), 100), 600);

    const bytes = await node.exportAsync({
      format: "JPG",
      constraint: { type: "WIDTH", value: targetWidth },
    });

    if (!bytes || bytes.length === 0) return null;

    const base64 = figma.base64Encode(bytes);
    return `data:image/jpeg;base64,${base64}`;
  } catch (err) {
    console.warn("Failed to export image node:", node.name, err);
    return null;
  }
}

async function exportNodeAsSvg(node: SceneNode): Promise<string | null> {
  try {
    if (node.removed || !node.visible) return null;
    if (!("exportAsync" in node)) return null;

    const bytes = await node.exportAsync({
      format: "SVG",
      svgOutlineText: true,
      svgIdAttribute: false,
    });

    if (!bytes || bytes.length === 0) return null;

    let svgStr = decodeUtf8(bytes);
    svgStr = svgStr.replace(/<\?xml.*?\?>/i, "").trim();
    return svgStr;
  } catch (err) {
    console.warn("Failed to export SVG node:", node.name, err);
    return null;
  }
}

// ─── Вспомогательные функции для типографики и стилей ───────────────────────

function extractFontWeight(fontStyle?: string): number {
  if (!fontStyle) return 400;
  const s = fontStyle.toLowerCase();
  if (s.includes("thin") || s.includes("hairline")) return 100;
  if (
    s.includes("extralight") ||
    s.includes("extra-light") ||
    s.includes("ultra light")
  )
    return 200;
  if (s.includes("light")) return 300;
  if (s.includes("medium")) return 500;
  if (s.includes("semibold") || s.includes("semi-bold") || s.includes("demi"))
    return 600;
  if (s.includes("bold")) return 700;
  if (
    s.includes("extrabold") ||
    s.includes("extra-bold") ||
    s.includes("ultrabold")
  )
    return 800;
  if (s.includes("black") || s.includes("heavy")) return 900;
  return 400;
}

function extractSolidColor(
  paints: readonly Paint[] | PluginAPI["mixed"] | undefined,
): string | null {
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

function extractBoxShadow(node: SceneNode): string | null {
  if (!("effects" in node) || !Array.isArray(node.effects)) return null;

  const shadows: string[] = [];

  for (const effect of node.effects) {
    if (effect.visible === false) continue;
    if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
      const isInset = effect.type === "INNER_SHADOW";
      const x = Math.round(effect.offset.x);
      const y = Math.round(effect.offset.y);
      const blur = Math.round(effect.radius);
      const spread = Math.round(effect.spread ?? 0);
      const color = rgbToCss(effect.color, effect.color.a);

      const shadowCss = `${isInset ? "inset " : ""}${x}px ${y}px ${blur}px ${spread}px ${color}`;
      shadows.push(shadowCss);
    }
  }

  return shadows.length > 0 ? shadows.join(", ") : null;
}

function extractBorder(node: SceneNode): {
  border?: string;
  borderRadius?: string;
} {
  const result: { border?: string; borderRadius?: string } = {};

  // 1. Извлечение скругления углов (border-radius)
  if ("cornerRadius" in node) {
    if (typeof node.cornerRadius === "number" && node.cornerRadius > 0) {
      result.borderRadius = `${Math.round(node.cornerRadius)}px`;
    } else if (node.cornerRadius === figma.mixed) {
      const tl = Math.round(
        "topLeftRadius" in node && typeof node.topLeftRadius === "number"
          ? node.topLeftRadius
          : 0,
      );
      const tr = Math.round(
        "topRightRadius" in node && typeof node.topRightRadius === "number"
          ? node.topRightRadius
          : 0,
      );
      const br = Math.round(
        "bottomRightRadius" in node &&
          typeof node.bottomRightRadius === "number"
          ? node.bottomRightRadius
          : 0,
      );
      const bl = Math.round(
        "bottomLeftRadius" in node && typeof node.bottomLeftRadius === "number"
          ? node.bottomLeftRadius
          : 0,
      );
      if (tl > 0 || tr > 0 || br > 0 || bl > 0) {
        result.borderRadius = `${tl}px ${tr}px ${br}px ${bl}px`;
      }
    }
  }

  // 2. Извлечение рамки (border)
  if (
    "strokes" in node &&
    Array.isArray(node.strokes) &&
    node.strokes.length > 0
  ) {
    const visibleStroke = node.strokes.find(
      (s) => s.visible !== false && s.type === "SOLID",
    );
    if (visibleStroke && visibleStroke.type === "SOLID") {
      const strokeColor = rgbToHex(
        visibleStroke.color,
        visibleStroke.opacity ?? 1,
      );

      let style = "solid";
      if (
        "dashPattern" in node &&
        Array.isArray(node.dashPattern) &&
        node.dashPattern.length > 0
      ) {
        style = node.dashPattern[0] <= 2 ? "dotted" : "dashed";
      }

      let weight = 1;
      if ("strokeWeight" in node && typeof node.strokeWeight === "number") {
        weight = Math.round(node.strokeWeight);
      }

      if (weight > 0 && strokeColor) {
        result.border = `${weight}px ${style} ${strokeColor}`;
      }
    }
  }

  return result;
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "box"
  );
}

// ─── Распознавание SVG/Иконок ────────────────────────────────────────────────

function isSvgCandidate(node: SceneNode): boolean {
  if (node.visible === false) return false;

  // 1. Прямые векторные ноды
  if (
    node.type === "VECTOR" ||
    node.type === "BOOLEAN_OPERATION" ||
    node.type === "STAR" ||
    node.type === "POLYGON" ||
    node.type === "ELLIPSE" ||
    node.type === "LINE"
  ) {
    return true;
  }

  // 2. Контейнеры (Frame, Group, Component, Instance), которые представляют собой иконку
  if (
    node.type === "FRAME" ||
    node.type === "GROUP" ||
    node.type === "COMPONENT" ||
    node.type === "INSTANCE"
  ) {
    const width =
      "width" in node && typeof node.width === "number" ? node.width : 0;
    const height =
      "height" in node && typeof node.height === "number" ? node.height : 0;

    const isSmall = width > 0 && width <= 128 && height > 0 && height <= 128;

    const nameLower = node.name.toLowerCase();
    const hasIconName =
      nameLower.includes("icon") ||
      nameLower.startsWith("ic_") ||
      nameLower.startsWith("ic-") ||
      nameLower.includes("svg") ||
      nameLower.includes("logo") ||
      nameLower.includes("vector") ||
      nameLower.includes("glyph");

    let hasVectors = false;
    let hasImages = false;
    let hasLongText = false;

    function checkChild(child: SceneNode) {
      if (
        child.type === "VECTOR" ||
        child.type === "BOOLEAN_OPERATION" ||
        child.type === "STAR" ||
        child.type === "POLYGON" ||
        child.type === "ELLIPSE" ||
        child.type === "LINE"
      ) {
        hasVectors = true;
      }
      if ("fills" in child && Array.isArray(child.fills)) {
        for (const f of child.fills) {
          if (f.type === "IMAGE") hasImages = true;
        }
      }
      if (child.type === "TEXT" && child.characters.trim().length > 4) {
        hasLongText = true;
      }
      if ("children" in child) {
        for (const c of child.children) {
          checkChild(c);
        }
      }
    }

    checkChild(node);

    if (hasImages || hasLongText) return false;

    if (hasIconName && (hasVectors || isSmall)) return true;
    if (isSmall && hasVectors) return true;
  }

  return false;
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
  imageCandidates: ImageCandidate[],
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
          {
            r: stop.color.r,
            g: stop.color.g,
            b: stop.color.b,
            a: stop.color.a,
          },
          gradientOpacity,
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

// ─── Определение секций и плоский сбор текстовых блоков ──────────────────────

function getSectionNodes(
  roots: readonly SceneNode[],
  addColor: (color: RgbColor, opacity?: number) => void,
  imageCandidates: ImageCandidate[],
): SceneNode[] {
  const sections: SceneNode[] = [];

  for (const root of roots) {
    if (root.removed || root.visible === false) continue;

    // Проверяем: является ли этот root артбордом/контейнером нескольких секций
    if (
      root.type === "FRAME" &&
      "children" in root &&
      (root.parent?.type === "PAGE" || roots.length === 1)
    ) {
      const childFrames = root.children.filter(
        (c) =>
          !c.removed &&
          c.visible !== false &&
          (c.type === "FRAME" || c.type === "SECTION") &&
          "height" in c &&
          typeof c.height === "number" &&
          c.height > 60,
      );

      // Если внутри есть 2 или более полноценных фрейма/секции, считаем их секциями
      if (childFrames.length >= 2) {
        if ("fills" in root) {
          collectPaints(
            root.fills as readonly Paint[],
            root,
            addColor,
            imageCandidates,
          );
        }
        if ("strokes" in root) {
          collectPaints(
            root.strokes as readonly Paint[],
            root,
            addColor,
            imageCandidates,
          );
        }
        if ("backgrounds" in root) {
          collectPaints(
            root.backgrounds as readonly Paint[],
            root,
            addColor,
            imageCandidates,
          );
        }
        sections.push(...childFrames);
        continue;
      }
    }

    sections.push(root);
  }

  return sections;
}

function extractSection(
  sectionNode: SceneNode,
  addColor: (color: RgbColor, opacity?: number) => void,
  addFont: (family: string, weight: number) => void,
  imageCandidates: ImageCandidate[],
  svgCandidates: SceneNode[],
  textItems: TextItem[],
): StructureNode | null {
  if (sectionNode.removed || sectionNode.visible === false) return null;

  const sectionBgColor = extractBackgroundColor(sectionNode);
  const shadow = extractBoxShadow(sectionNode);
  const borderInfo = extractBorder(sectionNode);

  const textBlocks: TextBlockItem[] = [];

  // Сбор стилей и заливок самой секции
  if ("fills" in sectionNode) {
    collectPaints(
      sectionNode.fills as readonly Paint[],
      sectionNode,
      addColor,
      imageCandidates,
    );
  }
  if ("strokes" in sectionNode) {
    collectPaints(
      sectionNode.strokes as readonly Paint[],
      sectionNode,
      addColor,
      imageCandidates,
    );
  }
  if ("backgrounds" in sectionNode) {
    collectPaints(
      sectionNode.backgrounds as readonly Paint[],
      sectionNode,
      addColor,
      imageCandidates,
    );
  }
  if ("effects" in sectionNode && Array.isArray(sectionNode.effects)) {
    for (const effect of sectionNode.effects) {
      if (effect.visible === false) continue;
      if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
        addColor(effect.color, effect.color.a ?? 1);
      }
    }
  }

  function walk(node: SceneNode, parentBg: string | null) {
    if (node.removed || node.visible === false) return;

    const nodeBgColor = extractBackgroundColor(node) || parentBg;

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
        collectPaints(
          node.fills as readonly Paint[],
          node,
          addColor,
          imageCandidates,
        );
      }
    }

    if ("strokes" in node) {
      collectPaints(
        node.strokes as readonly Paint[],
        node,
        addColor,
        imageCandidates,
      );
    }

    if ("backgrounds" in node) {
      collectPaints(
        node.backgrounds as readonly Paint[],
        node,
        addColor,
        imageCandidates,
      );
    }

    if ("effects" in node && Array.isArray(node.effects)) {
      for (const effect of node.effects) {
        if (effect.visible === false) continue;
        if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
          addColor(effect.color, effect.color.a ?? 1);
        }
      }
    }

    // 2. Проверка: является ли нода SVG-иконкой
    if (isSvgCandidate(node)) {
      svgCandidates.push(node);
      return;
    }

    // 3. Обработка текстовой ноды
    if (node.type === "TEXT") {
      const rawText = node.characters.trim();
      if (!rawText) return;

      let fontFamily = "Inter";
      let fontStyle = "Regular";

      if (node.fontName && node.fontName !== figma.mixed) {
        fontFamily = node.fontName.family;
        fontStyle = node.fontName.style;
        const weight = extractFontWeight(fontStyle);
        addFont(fontFamily, weight);
      } else if (node.fontName === figma.mixed) {
        try {
          const segments = node.getStyledTextSegments(["fontName"]);
          for (const seg of segments) {
            if (seg.fontName) {
              addFont(seg.fontName.family, extractFontWeight(seg.fontName.style));
            }
          }
          if (segments.length > 0 && segments[0].fontName) {
            fontFamily = segments[0].fontName.family;
            fontStyle = segments[0].fontName.style;
          }
        } catch {
          addFont(fontFamily, 400);
        }
      }

      const fontSize =
        typeof node.fontSize === "number" ? Math.round(node.fontSize) : 16;
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
      const textAlign = node.textAlignHorizontal
        ? textAlignMap[node.textAlignHorizontal] || "left"
        : "left";

      const textColor = extractSolidColor(
        node.fills !== figma.mixed ? (node.fills as readonly Paint[]) : undefined,
      );

      const fontSlug = fontFamily.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const className = `font-${fontSlug}-${fontWeight}-${fontSize}`;
      const textBorderInfo = extractBorder(node);

      // Глобальный TextItem
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
        section: sectionNode.name,
      };
      if (textBorderInfo.border) textItem.border = textBorderInfo.border;
      if (textBorderInfo.borderRadius)
        textItem.borderRadius = textBorderInfo.borderRadius;
      textItems.push(textItem);

      // Плоский текстовый блок для структуры секции (без промежуточной вложенности)
      const textBlock: TextBlockItem = {
        id: node.id,
        name: node.name,
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
      };
      if (textBorderInfo.border) textBlock.border = textBorderInfo.border;
      if (textBorderInfo.borderRadius)
        textBlock.borderRadius = textBorderInfo.borderRadius;
      textBlocks.push(textBlock);

      return;
    }

    // 4. Рекурсивный обход детей контейнера
    if ("children" in node) {
      for (const child of node.children) {
        walk(child, nodeBgColor);
      }
    }
  }

  if ("children" in sectionNode) {
    for (const child of sectionNode.children) {
      walk(child, sectionBgColor);
    }
  } else if (sectionNode.type === "TEXT") {
    walk(sectionNode, sectionBgColor);
  }

  const structNode: StructureNode = {
    id: sectionNode.id,
    name: sectionNode.name,
    tag: "div",
    className: `section-${slugify(sectionNode.name)}`,
    backgroundColor: sectionBgColor,
    children: textBlocks,
  };

  if (shadow) {
    structNode.boxShadow = shadow;
  }
  if (borderInfo.border) {
    structNode.border = borderInfo.border;
  }
  if (borderInfo.borderRadius) {
    structNode.borderRadius = borderInfo.borderRadius;
  }

  return structNode;
}

// ─── Главная функция извлечения ─────────────────────────────────────────────

export async function extractFromNodes(
  roots: readonly SceneNode[],
): Promise<ExtractorResult> {
  const seenColors = new Set<string>();
  const colors: ColorItem[] = [];
  const rawImageCandidates: ImageCandidate[] = [];
  const rawSvgCandidates: SceneNode[] = [];
  const texts: TextItem[] = [];
  const structure: StructureNode[] = [];

  // 🌟 Хранилище уникальных шрифтов: Family -> Set(weights)
  const fontsMap = new Map<string, Set<number>>();

  const addColor = (color: RgbColor, opacity = 1) => {
    const hex = rgbToHex(color, opacity);
    if (!seenColors.has(hex)) {
      seenColors.add(hex);
      colors.push({ hex, original: rgbToCss(color, opacity) });
    }
  };

  const addFont = (family: string, weight: number) => {
    if (!family) return;
    const cleanFamily = family.trim();
    if (!fontsMap.has(cleanFamily)) {
      fontsMap.set(cleanFamily, new Set<number>());
    }
    fontsMap.get(cleanFamily)!.add(weight);
  };

  // 1. Определение секций и сбор структуры с плоскими текстовыми блоками
  const sectionNodes = getSectionNodes(roots, addColor, rawImageCandidates);

  for (const sectionNode of sectionNodes) {
    const structNode = extractSection(
      sectionNode,
      addColor,
      addFont,
      rawImageCandidates,
      rawSvgCandidates,
      texts,
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
      height: Math.round(
        "height" in c.node ? (c.node as LayoutMixin).height : 0,
      ),
      scaleMode: c.scaleMode,
      data: dataUrl || "",
    });
  }

  // 4. Экспорт SVG / Иконок
  const seenSvgIds = new Set<string>();
  const svgs: SvgItem[] = [];
  for (const node of rawSvgCandidates) {
    if (seenSvgIds.has(node.id)) continue;
    seenSvgIds.add(node.id);

    const svgContent = await exportNodeAsSvg(node);
    if (svgContent && svgContent.includes("<svg")) {
      svgs.push({
        id: node.id,
        name: node.name,
        content: svgContent,
        width: Math.round("width" in node ? (node as LayoutMixin).width : 24),
        height: Math.round(
          "height" in node ? (node as LayoutMixin).height : 24,
        ),
      });
    }
  }

  // 🌟 5. Формирование списка шрифтов с сортировкой начертаний
  const fonts: FontItem[] = Array.from(fontsMap.entries()).map(
    ([family, weightsSet]) => ({
      family,
      weights: Array.from(weightsSet).sort((a, b) => a - b),
    }),
  );

  // 🌟 Возвращаем расширенный результат
  return [
    { colors },
    { images },
    { texts },
    { structure },
    { svgs },
    { fonts },
  ];
}
