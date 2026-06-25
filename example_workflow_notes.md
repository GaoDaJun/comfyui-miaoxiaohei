# 示例工作流说明

1. 在 ComfyUI 中添加一个图片加载节点。
2. 将图片输出连接到 `MiaoXiaoHei Image to SVG` 节点。
3. `base_url` 填写你的服务地址，例如 `https://www.miaoxiaohei.com`。
4. `api_key` 填写喵小黑后台发放的 API Key，也可以设置环境变量 `MIAOXIAOHEI_API_KEY` 后留空。
5. 运行工作流。
6. 转换完成后，SVG 文件会保存到 ComfyUI 的 `output/miaoxiaohei/` 目录。

上传前处理规则：

- 图片总像素超过 `max_pixels` 时会按比例缩放。
- 默认 `max_pixels` 是 `4000000`，等价于 `2000 x 2000`。
- `3000 x 1000` 图片只有 300 万像素，不会缩放。
- `3000 x 2600` 图片有 780 万像素，会缩放到约 400 万像素以内。
- 默认上传压缩质量是 `95`。

下载 PDF 或 EPS：

1. 将 `MiaoXiaoHei Image to SVG` 输出的 `request_id` 复制或连接到 `MiaoXiaoHei Download Result`。
2. 在 `format` 中选择 `pdf` 或 `eps`。
3. 运行节点后，文件会保存到本地输出目录。
