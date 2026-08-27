import { rgbToCss, rgbToHex } from "./lib/colors";
import type {
  ColorItem,
  ExtractorResult,
  ImageItem,
  RgbColor,
} from "./lib/types";

async function exportNodeAsDataUrl(node: SceneNode): Promise<string | null> {
  try {
    if (node.removed || !node.visible) return null;
    if (!("exportAsync" in node)) return null;

    const width = "width" in node && typeof node.width === "number" ? node.width : 0;
    const height = "height" in node && typeof node.height === "number" ? node.height : 0;
    if (width <= 0 || height <= 0) return null;

    // Ограничиваем ширину до 600px (JPG quality 0.85) — лёгкий вес (20-50 КБ)
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

function scanNode(
  node: SceneNode,
  addColor: (color: RgbColor, opacity?: number) => void,
  imageCandidates: ImageCandidate[]
) {
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

  if ("children" in node) {
    for (const child of node.children) {
      scanNode(child, addColor, imageCandidates);
    }
  }
}

export async function extractFromNodes(
  roots: readonly SceneNode[]
): Promise<ExtractorResult> {
  const seenColors = new Set<string>();
  const colors: ColorItem[] = [];
  const rawImageCandidates: ImageCandidate[] = [];

  const addColor = (color: RgbColor, opacity = 1) => {
    const hex = rgbToHex(color, opacity);
    if (!seenColors.has(hex)) {
      seenColors.add(hex);
      colors.push({ hex, original: rgbToCss(color, opacity) });
    }
  };

  // 1. Быстрое синхронное сканирование нод
  for (const root of roots) {
    scanNode(root, addColor, rawImageCandidates);
  }

  // 2. Дедупликация по imageHash
  const seenHashes = new Set<string>();
  const uniqueCandidates: ImageCandidate[] = [];
  for (const c of rawImageCandidates) {
    if (!seenHashes.has(c.imageHash)) {
      seenHashes.add(c.imageHash);
      uniqueCandidates.push(c);
    }
  }

  // 3. Быстрый экспорт картинок в веб-формат (JPG 600px)
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

  return [{ colors }, { images }];
}
