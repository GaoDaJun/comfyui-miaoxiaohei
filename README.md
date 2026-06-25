# 喵小黑 ComfyUI 插件

在 ComfyUI 里直接调用喵小黑 API，把图片转换成 SVG，也可以下载 PDF / EPS 文件。

## 安装

进入 ComfyUI 的自定义节点目录：

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/GaoDaJun/comfyui-miaoxiaohei.git
```

然后重启 ComfyUI。

插件不需要额外安装 Python 依赖，拉取后重启即可使用。

## 配置 API Key

打开 ComfyUI，在节点列表里找到：

```text
MiaoXiaoHei/API
```

把喵小黑后台提供的 API Key 填到节点里的 `api_key` 输入框。

常用节点：

- `MiaoXiaoHei Image to SVG`：图片转 SVG
- `MiaoXiaoHei Download Result`：下载 SVG / PDF / EPS
- `MiaoXiaoHei API Usage`：查看剩余额度和调用记录

## 基本用法

1. 添加 ComfyUI 的图片加载节点。
2. 连接到 `MiaoXiaoHei Image to SVG`。
3. 在 `api_key` 填入你的 API Key。
4. 运行工作流。
5. 转换完成后，会输出 SVG 文本和 SVG 文件路径。

如果需要下载 PDF 或 EPS，把转换节点输出的 `request_id` 填到 `MiaoXiaoHei Download Result`，选择格式后运行即可。

## 获取 API Key

请在喵小黑后台创建或获取 API Key。

## 常见问题

如果安装后看不到节点，请确认仓库已经放在 `ComfyUI/custom_nodes` 目录下，然后重启 ComfyUI。
