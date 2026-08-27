import { extractFromNodes } from "./traverse";

figma.showUI(__html__, { width: 420, height: 320, title: "ULON Extractor" });

figma.ui.onmessage = async (msg: { type: string }) => {
  try {
    let roots: readonly SceneNode[];

    if (msg.type === "EXTRACT_SELECTION") {
      roots = figma.currentPage.selection;
      if (roots.length === 0) {
        figma.ui.postMessage({
          type: "ERROR",
          message: "Ничего не выделено. Выдели ноды и попробуй снова.",
        });
        return;
      }
    } else if (msg.type === "EXTRACT_ALL") {
      roots = figma.currentPage.children;
      if (roots.length === 0) {
        figma.ui.postMessage({ type: "ERROR", message: "Страница пуста." });
        return;
      }
    } else {
      return;
    }

    const result = await extractFromNodes(roots);
    figma.ui.postMessage({ type: "RESULT", payload: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    figma.ui.postMessage({ type: "ERROR", message });
  }
};
