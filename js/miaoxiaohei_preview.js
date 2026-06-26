import { app } from "../../scripts/app.js";

const EXTENSION_NAME = "miaoxiaohei.svg.preview";
const LOGO_URL = new URL("./miaoxiaohei_logo.svg", import.meta.url).href;

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

  const stage = document.createElement("div");
  stage.className = "mxh-stage";

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

  stage.append(original, svgWrap, line, handle, leftTag, rightTag);

  let ratio = 0.5;
  const applyRatio = () => {
    const percent = `${Math.round(ratio * 10000) / 100}%`;
    svgWrap.style.clipPath = `inset(0 0 0 ${percent})`;
    line.style.left = percent;
    handle.style.left = percent;
  };

  const move = (event) => {
    const rect = stage.getBoundingClientRect();
    ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    applyRatio();
  };

  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
  };

  stage.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    move(event);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  });
  applyRatio();

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
      width: 520px;
      max-width: 100%;
      padding: 12px;
      border-radius: 12px;
      background: #171717;
      color: #fff;
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .mxh-stage {
      position: relative;
      width: 100%;
      aspect-ratio: 1.45;
      overflow: hidden;
      border-radius: 10px;
      background:
        linear-gradient(45deg, rgba(255,255,255,.08) 25%, transparent 25%),
        linear-gradient(-45deg, rgba(255,255,255,.08) 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, rgba(255,255,255,.08) 75%),
        linear-gradient(-45deg, transparent 75%, rgba(255,255,255,.08) 75%),
        #202033;
      background-size: 22px 22px;
      background-position: 0 0, 0 11px, 11px -11px, -11px 0;
      cursor: ew-resize;
      touch-action: none;
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
    }
    .mxh-svg-wrap {
      position: absolute;
      inset: 0;
      pointer-events: none;
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
      pointer-events: none;
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
    }
    .mxh-left-tag { left: 12px; }
    .mxh-right-tag { right: 12px; }
    .mxh-actions {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin-top: 10px;
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
  `;
  document.head.appendChild(style);
}

function showPreviewWidget(node, data) {
  injectStyles();
  node.widgets = (node.widgets || []).filter((widget) => {
    if (widget.name !== "mxh_preview_widget") return true;
    widget.onRemove?.();
    return false;
  });

  const element = buildPreviewElement(data);
  const widget = node.addDOMWidget("mxh_preview_widget", "div", element, {
    serialize: false,
    hideOnZoom: false,
  });
  widget.computeSize = () => [540, 430];
  node.size = [Math.max(node.size?.[0] || 0, 560), Math.max(node.size?.[1] || 0, 500)];
  app.graph.setDirtyCanvas(true, true);
}

app.registerExtension({
  name: EXTENSION_NAME,
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "MiaoXiaoHeiSvgPreview") return;

    const onExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function onMiaoXiaoHeiPreviewExecuted(message) {
      onExecuted?.apply(this, arguments);
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
});
