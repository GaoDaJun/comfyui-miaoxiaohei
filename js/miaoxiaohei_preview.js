import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const EXTENSION_NAME = "miaoxiaohei.svg.preview";
const LOGO_URL = new URL("./miaoxiaohei_logo.svg", import.meta.url).href;
const MIN_NODE_WIDTH = 560;
const MIN_NODE_HEIGHT = 520;
const MIN_WIDGET_WIDTH = 420;
const MIN_WIDGET_HEIGHT = 300;
const NODE_HEADER_AND_INPUTS_HEIGHT = 112;
const NODE_HORIZONTAL_INSET = 24;
const PREVIEW_WIDGET_NAME = "mxh_preview_widget";

function svgDataUrl(svgText) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText || "")}`;
}

function imageApiUrl(imageInfo) {
  if (!imageInfo?.filename) return "";
  const params = new URLSearchParams({
    filename: imageInfo.filename,
    type: imageInfo.type || "output",
    subfolder: imageInfo.subfolder || "",
  });
  return `/view?${params.toString()}`;
}

function downloadUrl(resultId, format) {
  return `/miaoxiaohei/download/${encodeURIComponent(resultId || "")}/${format}`;
}

function getPreviewWidgetHeight(node) {
  const nodeHeight = Math.max(node?.size?.[1] || MIN_NODE_HEIGHT, MIN_NODE_HEIGHT);
  return Math.max(MIN_WIDGET_HEIGHT, nodeHeight - NODE_HEADER_AND_INPUTS_HEIGHT);
}

function getPreviewWidgetWidth(node, availableWidth) {
  const rawWidth = Number(availableWidth || node?.size?.[0] || MIN_NODE_WIDTH);
  return Math.max(MIN_WIDGET_WIDTH, rawWidth - NODE_HORIZONTAL_INSET);
}

function syncPreviewElementSize(node, element, availableWidth) {
  const width = getPreviewWidgetWidth(node, availableWidth);
  const height = getPreviewWidgetHeight(node);
  const parent = element.parentElement;
  const nextSizeKey = `${Math.round(width)}x${Math.round(height)}`;

  if (element.__mxhSizeKey === nextSizeKey && parent?.__mxhSizeKey === nextSizeKey) {
    return { width, height };
  }

  if (parent) {
    parent.style.width = `${width}px`;
    parent.style.height = `${height}px`;
    parent.style.minHeight = `${MIN_WIDGET_HEIGHT}px`;
    parent.style.maxWidth = "100%";
    parent.style.overflow = "hidden";
    parent.__mxhSizeKey = nextSizeKey;
  }

  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  element.style.maxWidth = "100%";
  element.style.overflow = "hidden";
  element.style.minHeight = `${MIN_WIDGET_HEIGHT}px`;
  element.style.setProperty("--mxh-widget-width", `${width}px`);
  element.style.setProperty("--mxh-widget-height", `${height}px`);
  element.style.setProperty("--comfy-widget-height", `${height}px`);
  element.style.setProperty("--comfy-widget-min-height", `${MIN_WIDGET_HEIGHT}px`);
  element.__mxhSizeKey = nextSizeKey;
  return { width, height };
}

function stopWheelPropagation(event) {
  event.preventDefault();
  event.stopPropagation();
}

function renamePreviewInputs(node) {
  if (!node?.inputs?.length) return;
  let changed = false;
  for (const input of node.inputs) {
    if (input.name === "svg_result") {
      input.name = "SVG结果";
      changed = true;
    } else if (input.name === "original_image") {
      input.name = "原图";
      changed = true;
    }
  }
  if (changed) {
    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
  }
}

function isPreviewNode(node) {
  return node?.comfyClass === "MiaoXiaoHeiSvgPreview" || node?.type === "MiaoXiaoHeiSvgPreview";
}

function nodeIdEquals(left, right) {
  return left != null && right != null && String(left) === String(right);
}

function getExecutingNodeId(detail) {
  if (detail == null) return null;
  if (typeof detail === "object") {
    return detail.node ?? detail.node_id ?? detail.id ?? null;
  }
  return detail;
}

function getGraphNodes() {
  return app.graph?._nodes || app.graph?.nodes || [];
}

function getNodeInput(node, names) {
  return node?.inputs?.find((input) => names.includes(input.name));
}

function getInputOriginNodeId(node, names) {
  const input = getNodeInput(node, names);
  const link = input?.link != null ? app.graph?.links?.[input.link] : null;
  return link?.origin_id;
}

function isTrackedExecutionNode(previewNode, executingNodeId) {
  if (nodeIdEquals(previewNode?.id, executingNodeId)) return true;

  const svgOriginId = getInputOriginNodeId(previewNode, ["SVG结果", "svg_result"]);
  return nodeIdEquals(svgOriginId, executingNodeId);
}

function findPreviewNodesForExecution(executingNodeId) {
  return getGraphNodes().filter((node) => isPreviewNode(node) && isTrackedExecutionNode(node, executingNodeId));
}

function buildStatusElement(status = "waiting") {
  const isRunning = status === "running";
  const root = document.createElement("div");
  root.className = `mxh-preview mxh-status-preview ${isRunning ? "is-running" : "is-waiting"}`;
  root.dataset.captureWheel = "true";
  root.addEventListener("wheel", stopWheelPropagation, { passive: false });

  const stage = document.createElement("div");
  stage.className = "mxh-stage mxh-status-stage";
  stage.dataset.captureWheel = "true";

  const content = document.createElement("div");
  content.className = "mxh-status-content";

  const logoWrap = document.createElement("div");
  logoWrap.className = "mxh-status-logo-wrap";

  const logo = document.createElement("img");
  logo.src = LOGO_URL;
  logo.alt = "";
  logoWrap.appendChild(logo);

  const text = document.createElement("div");
  text.className = "mxh-status-text";
  text.textContent = isRunning ? "正在转换" : "等待转换";

  content.append(logoWrap, text);
  stage.appendChild(content);
  root.appendChild(stage);
  return root;
}

function removePreviewWidget(node) {
  node.widgets = (node.widgets || []).filter((widget) => {
    if (widget.name !== PREVIEW_WIDGET_NAME) return true;
    widget.onRemove?.();
    return false;
  });
}

function attachPreviewWidget(node, element) {
  syncPreviewElementSize(node, element);
  const widget = node.addDOMWidget(PREVIEW_WIDGET_NAME, "div", element, {
    serialize: false,
    hideOnZoom: false,
    getMinHeight: () => MIN_WIDGET_HEIGHT,
    getHeight: () => syncPreviewElementSize(node, element).height,
    onResize: () => syncPreviewElementSize(node, element),
  });
  widget.computeSize = (width) => {
    const nodeWidth = Math.max(width || node.size?.[0] || MIN_NODE_WIDTH, MIN_WIDGET_WIDTH);
    const size = syncPreviewElementSize(node, element, width);
    return [nodeWidth, size.height];
  };
  widget.computeLayoutSize = (targetNode) => {
    const size = syncPreviewElementSize(targetNode || node, element);
    return {
      minWidth: MIN_WIDGET_WIDTH,
      minHeight: size.height,
    };
  };
  widget.serializeValue = () => undefined;
  widget.serialize = false;
  return widget;
}

function ensurePreviewNodeSizing(node) {
  node.size = [
    Math.max(node.size?.[0] || 0, MIN_NODE_WIDTH),
    Math.max(node.size?.[1] || 0, MIN_NODE_HEIGHT),
  ];
  if (!node.__mxhPreviewResizePatched) {
    const onResize = node.onResize;
    node.onResize = function onMiaoXiaoHeiPreviewResize(size) {
      const result = onResize?.apply(this, arguments);
      const previewWidget = this.widgets?.find((item) => item.name === PREVIEW_WIDGET_NAME);
      if (previewWidget?.element) {
        syncPreviewElementSize(this, previewWidget.element);
      }
      return result;
    };
    const onDrawForeground = node.onDrawForeground;
    node.onDrawForeground = function onMiaoXiaoHeiPreviewDrawForeground(ctx) {
      const result = onDrawForeground?.apply(this, arguments);
      const previewWidget = this.widgets?.find((item) => item.name === PREVIEW_WIDGET_NAME);
      if (previewWidget?.element) {
        syncPreviewElementSize(this, previewWidget.element);
      }
      return result;
    };
    const onMouseMove = node.onMouseMove;
    node.onMouseMove = function onMiaoXiaoHeiPreviewMouseMove(event, pos, graphCanvas) {
      const result = onMouseMove?.apply(this, arguments);
      const previewWidget = this.widgets?.find((item) => item.name === PREVIEW_WIDGET_NAME);
      if (previewWidget?.element) {
        syncPreviewElementSize(this, previewWidget.element);
      }
      return result;
    };
    node.__mxhPreviewResizePatched = true;
  }
}

function syncPreviewNodeWidget(node) {
  if (!isPreviewNode(node)) return;
  const previewWidget = node.widgets?.find((item) => item.name === PREVIEW_WIDGET_NAME);
  if (previewWidget?.element) {
    syncPreviewElementSize(node, previewWidget.element);
  }
}

function syncAllPreviewWidgets() {
  for (const node of getGraphNodes()) {
    syncPreviewNodeWidget(node);
  }
}

function createButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function filenameFromDisposition(disposition, fallback) {
  const value = disposition || "";
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(value);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const match = /filename="?([^";]+)"?/i.exec(value);
  return match?.[1] || fallback;
}

async function triggerDownload(url, fallbackName) {
  const response = await fetch(url);
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || contentType.includes("application/json")) {
    let message = "下载失败，请稍后重试";
    try {
      const data = await response.json();
      message = data?.message || message;
    } catch {
      message = await response.text() || message;
    }
    alert(message);
    return;
  }
  const blob = await response.blob();
  const filename = filenameFromDisposition(response.headers.get("content-disposition"), fallbackName);
  saveBlob(blob, filename);
}

async function copySvg(svgText) {
  try {
    await navigator.clipboard.writeText(svgText || "");
  } catch {
    const input = document.createElement("textarea");
    input.value = svgText || "";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
}

async function copySvgWithFeedback(button, svgText) {
  await copySvg(svgText);
  const previousText = button.textContent;
  button.textContent = "已复制";
  button.disabled = true;
  window.setTimeout(() => {
    button.textContent = previousText;
    button.disabled = false;
  }, 1200);
}

function buildPreviewElement(data) {
  const root = document.createElement("div");
  root.className = "mxh-preview";
  root.dataset.captureWheel = "true";
  root.addEventListener("wheel", stopWheelPropagation, { passive: false });

  const stage = document.createElement("div");
  stage.className = "mxh-stage";
  stage.dataset.captureWheel = "true";

  const viewport = document.createElement("div");
  viewport.className = "mxh-viewport";

  const original = document.createElement("img");
  original.className = "mxh-image mxh-original";
  original.src = data.originalUrl;
  original.alt = "原图";

  const svgWrap = document.createElement("div");
  svgWrap.className = "mxh-svg-wrap";

  const svgImage = document.createElement("img");
  svgImage.className = "mxh-image mxh-svg";
  svgImage.src = svgDataUrl(data.svgText);
  svgImage.alt = "SVG";
  svgWrap.appendChild(svgImage);

  const line = document.createElement("div");
  line.className = "mxh-slider-line";

  const handle = document.createElement("div");
  handle.className = "mxh-slider-handle";

  const logo = document.createElement("img");
  logo.src = LOGO_URL;
  logo.alt = "";
  handle.appendChild(logo);

  const leftTag = document.createElement("span");
  leftTag.className = "mxh-tag mxh-left-tag";
  leftTag.textContent = "原图";

  const rightTag = document.createElement("span");
  rightTag.className = "mxh-tag mxh-right-tag";
  rightTag.textContent = "SVG";

  viewport.append(original, svgWrap, line, handle);
  stage.append(viewport, leftTag, rightTag);

  let ratio = 0.5;
  let zoom = 1;
  let offsetX = 0;
  let offsetY = 0;

  const applyRatio = () => {
    const percent = `${Math.round(ratio * 10000) / 100}%`;
    svgWrap.style.clipPath = `inset(0 0 0 ${percent})`;
    line.style.left = percent;
    handle.style.left = percent;
  };

  const applyTransform = () => {
    const transform = `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`;
    original.style.transform = transform;
    svgImage.style.transform = transform;
  };

  const move = (event) => {
    const rect = viewport.getBoundingClientRect();
    ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    applyRatio();
  };

  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
  };

  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    move(event);
    handle.setPointerCapture?.(event.pointerId);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  });

  stage.addEventListener("wheel", (event) => {
    stopWheelPropagation(event);

    const previousZoom = zoom;
    const direction = event.deltaY > 0 ? -1 : 1;
    zoom = Math.max(0.35, Math.min(6, zoom * (direction > 0 ? 1.12 : 0.88)));

    const rect = viewport.getBoundingClientRect();
    const pointX = event.clientX - rect.left - rect.width / 2;
    const pointY = event.clientY - rect.top - rect.height / 2;
    const scaleChange = zoom / previousZoom;
    offsetX = pointX - (pointX - offsetX) * scaleChange;
    offsetY = pointY - (pointY - offsetY) * scaleChange;
    applyTransform();
  }, { passive: false });

  applyRatio();
  applyTransform();

  const actions = document.createElement("div");
  actions.className = "mxh-actions";
  const copyButton = createButton("复制SVG", () => copySvgWithFeedback(copyButton, data.svgText));
  actions.append(
    createButton("下载SVG", () => triggerDownload(downloadUrl(data.resultId, "svg"), "miaoxiaohei_vector.svg")),
    copyButton,
    createButton("下载PDF", () => triggerDownload(downloadUrl(data.resultId, "pdf"), "miaoxiaohei_vector.pdf")),
    createButton("下载EPS", () => triggerDownload(downloadUrl(data.resultId, "eps"), "miaoxiaohei_vector.eps")),
  );

  root.append(stage, actions);
  return root;
}

function injectStyles() {
  if (document.getElementById("mxh-preview-style")) return;
  const style = document.createElement("style");
  style.id = "mxh-preview-style";
  style.textContent = `
    .mxh-preview {
      width: var(--mxh-widget-width, 100%);
      height: var(--mxh-widget-height, 100%);
      min-height: 260px;
      padding: 12px;
      border-radius: 12px;
      background: #1f1f1f;
      color: #fff;
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      display: grid;
      grid-template-rows: minmax(0, 1fr) auto;
      gap: 10px;
    }
    .mxh-stage {
      position: relative;
      width: 100%;
      min-height: 0;
      overflow: hidden;
      border-radius: 10px;
      background:
        linear-gradient(45deg, rgba(255,255,255,.045) 25%, transparent 25%),
        linear-gradient(-45deg, rgba(255,255,255,.045) 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, rgba(255,255,255,.045) 75%),
        linear-gradient(-45deg, transparent 75%, rgba(255,255,255,.045) 75%),
        #242424;
      background-size: 22px 22px;
      background-position: 0 0, 0 11px, 11px -11px, -11px 0;
      cursor: zoom-in;
      touch-action: none;
    }
    .mxh-viewport {
      position: absolute;
      inset: 0;
      overflow: hidden;
      transform-origin: center center;
    }
    .mxh-image {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: transparent;
      user-select: none;
      pointer-events: none;
      transform-origin: center center;
    }
    .mxh-svg-wrap {
      position: absolute;
      inset: 0;
      pointer-events: none;
      transform-origin: center center;
    }
    .mxh-slider-line {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      transform: translateX(-1px);
      background: rgba(255,255,255,.9);
      box-shadow: 0 0 0 1px rgba(0,0,0,.16);
      pointer-events: none;
    }
    .mxh-slider-handle {
      position: absolute;
      top: 50%;
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      transform: translate(-50%, -50%);
      background: rgba(255,255,255,.95);
      border: 1px solid rgba(0,0,0,.12);
      box-shadow: 0 10px 28px rgba(0,0,0,.22);
      cursor: ew-resize;
      pointer-events: auto;
      touch-action: none;
      z-index: 3;
    }
    .mxh-slider-handle img {
      width: 30px;
      height: 30px;
      object-fit: contain;
    }
    .mxh-tag {
      position: absolute;
      bottom: 12px;
      padding: 4px 8px;
      border-radius: 6px;
      background: rgba(0,0,0,.72);
      font-size: 12px;
      font-weight: 700;
      color: #fff;
      pointer-events: none;
      z-index: 4;
    }
    .mxh-left-tag { left: 12px; }
    .mxh-right-tag { right: 12px; }
    .mxh-actions {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin: 0;
    }
    .mxh-actions button {
      min-height: 32px;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 8px;
      background: #ffffff;
      color: #111827;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
    }
    .mxh-actions button:hover {
      background: #e7ff97;
    }
    .mxh-actions button:disabled {
      cursor: default;
      opacity: .78;
    }
    .mxh-status-preview {
      grid-template-rows: minmax(0, 1fr);
      gap: 0;
    }
    .mxh-status-stage {
      cursor: default;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .mxh-status-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      color: #fff;
      user-select: none;
      pointer-events: none;
    }
    .mxh-status-logo-wrap {
      width: 72px;
      height: 72px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: rgba(245,245,245,.96);
      border: 1px solid rgba(255,255,255,.1);
      box-shadow: 0 14px 34px rgba(0,0,0,.3);
    }
    .mxh-status-logo-wrap img {
      width: 52px;
      height: 52px;
      object-fit: contain;
    }
    .mxh-status-text {
      padding: 6px 14px;
      border-radius: 999px;
      background: rgba(17,17,17,.76);
      color: #fff;
      font-size: 18px;
      font-weight: 800;
      letter-spacing: 0;
    }
    .mxh-status-preview.is-running .mxh-status-logo-wrap {
      position: relative;
    }
    .mxh-status-preview.is-running .mxh-status-logo-wrap::before {
      content: "";
      position: absolute;
      inset: -8px;
      border-radius: 999px;
      border: 3px solid rgba(255,255,255,.18);
      border-top-color: #9dd6ff;
      animation: mxh-spin 1s linear infinite;
    }
    @keyframes mxh-spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

function showStatusWidget(node, status = "waiting") {
  injectStyles();
  renamePreviewInputs(node);
  removePreviewWidget(node);
  const element = buildStatusElement(status);
  attachPreviewWidget(node, element);
  ensurePreviewNodeSizing(node);
  node.__mxhPreviewMode = status;
  app.graph.setDirtyCanvas(true, true);
}

function showPreviewWidget(node, data) {
  injectStyles();
  renamePreviewInputs(node);
  removePreviewWidget(node);
  const element = buildPreviewElement(data);
  attachPreviewWidget(node, element);
  ensurePreviewNodeSizing(node);
  node.__mxhPreviewMode = "result";
  app.graph.setDirtyCanvas(true, true);
}

app.registerExtension({
  name: EXTENSION_NAME,
  setup() {
    const graphCanvas = app.canvas;
    if (!graphCanvas || graphCanvas.__mxhPreviewCanvasPatched) return;

    const onDrawForeground = graphCanvas.onDrawForeground;
    graphCanvas.onDrawForeground = function onMiaoXiaoHeiCanvasDrawForeground(ctx, visibleNodes) {
      const result = onDrawForeground?.apply(this, arguments);
      syncAllPreviewWidgets();
      return result;
    };

    graphCanvas.__mxhPreviewCanvasPatched = true;
  },
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "MiaoXiaoHeiSvgPreview") return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function onMiaoXiaoHeiPreviewCreated() {
      const result = onNodeCreated?.apply(this, arguments);
      renamePreviewInputs(this);
      window.setTimeout(() => {
        if (!this.widgets?.some((widget) => widget.name === PREVIEW_WIDGET_NAME)) {
          showStatusWidget(this, "waiting");
        }
      }, 0);
      return result;
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function onMiaoXiaoHeiPreviewConfigured() {
      const result = onConfigure?.apply(this, arguments);
      renamePreviewInputs(this);
      window.setTimeout(() => {
        if (!this.widgets?.some((widget) => widget.name === PREVIEW_WIDGET_NAME)) {
          showStatusWidget(this, "waiting");
        }
      }, 0);
      return result;
    };

    const onExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function onMiaoXiaoHeiPreviewExecuted(message) {
      onExecuted?.apply(this, arguments);
      renamePreviewInputs(this);
      const data = {
        svgText: message?.svg?.[0] || "",
        resultId: message?.result_id?.[0] || "",
        originalUrl: imageApiUrl(message?.original_image?.[0]),
      };
      if (data.svgText && data.originalUrl) {
        showPreviewWidget(this, data);
      }
    };
  },
  nodeCreated(node) {
    if (isPreviewNode(node)) {
      renamePreviewInputs(node);
      window.setTimeout(() => {
        if (!node.widgets?.some((widget) => widget.name === PREVIEW_WIDGET_NAME)) {
          showStatusWidget(node, "waiting");
        }
      }, 0);
    }
  },
  loadedGraphNode(node) {
    if (isPreviewNode(node)) {
      renamePreviewInputs(node);
      window.setTimeout(() => {
        if (!node.widgets?.some((widget) => widget.name === PREVIEW_WIDGET_NAME)) {
          showStatusWidget(node, "waiting");
        }
      }, 0);
    }
  },
});

api.addEventListener("executing", (event) => {
  const executingNodeId = getExecutingNodeId(event?.detail);

  if (executingNodeId == null) {
    for (const node of getGraphNodes()) {
      if (isPreviewNode(node) && node.__mxhPreviewMode === "running") {
        showStatusWidget(node, "waiting");
      }
    }
    return;
  }

  for (const node of findPreviewNodesForExecution(executingNodeId)) {
    showStatusWidget(node, "running");
  }
});
