import { app } from "../../scripts/app.js";

function dataUrlFromSvg(svgText) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
}

function addTextWidget(node, name, value) {
  const widget = node.addWidget("text", name, value || "", () => {});
  widget.inputEl?.setAttribute("readonly", "readonly");
  return widget;
}

function showSvgPreview(node, svgText, svgPath, downloadUrl) {
  if (!svgText) return;

  node.widgets = (node.widgets || []).filter((widget) => {
    if (!widget.name?.startsWith("喵小黑")) return true;
    widget.onRemove?.();
    return false;
  });

  const image = new Image();
  image.src = dataUrlFromSvg(svgText);
  image.onload = () => {
    const width = Math.max(320, Math.min(520, image.naturalWidth || 420));
    const height = Math.max(220, Math.min(420, image.naturalHeight || 260));
    node.imgs = [image];
    node.imageIndex = 0;
    node.size = [Math.max(node.size?.[0] || 0, width), Math.max(node.size?.[1] || 0, height + 120)];
    app.graph.setDirtyCanvas(true, true);
  };

  addTextWidget(node, "喵小黑 SVG文件", svgPath || "");
  addTextWidget(node, "喵小黑 下载链接", downloadUrl || "");
}

app.registerExtension({
  name: "miaoxiaohei.svg.preview",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "MiaoXiaoHeiVectorize") return;

    const onExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function onMiaoXiaoHeiExecuted(message) {
      onExecuted?.apply(this, arguments);
      const svgText = message?.svg?.[0] || "";
      const svgPath = message?.svg_path?.[0] || "";
      const downloadUrl = message?.download_url?.[0] || "";
      showSvgPreview(this, svgText, svgPath, downloadUrl);
    };
  },
});
