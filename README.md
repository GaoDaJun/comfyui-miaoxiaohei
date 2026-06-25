# 喵小黑 ComfyUI 插件

这是喵小黑图片转矢量 API 的 ComfyUI 自定义节点插件。安装后，可以在 ComfyUI 中直接调用喵小黑云端 API，将图片转换为 SVG，并可继续下载 PDF / EPS 结果。

当前版本支持：

- 将 ComfyUI 的 `IMAGE` 图片输入转换为 SVG
- 调用喵小黑接口 `POST /api/vectorize`
- 上传前在本地自动预处理图片，减少服务器带宽和资源消耗
- 超过 `2000 x 2000` 总分辨率的图片会按比例缩放到 400 万像素以内
- 上传前默认使用质量 `95` 压缩
- 将返回的 SVG 自动保存到 ComfyUI 输出目录
- 根据 `request_id` 下载 SVG / PDF / EPS
- 查询 API Key 的额度、剩余额度和调用记录

> 仓库里不包含任何 API Key。请在喵小黑后台创建或获取 API Key，然后填到节点的 `api_key` 输入框，或者设置环境变量 `MIAOXIAOHEI_API_KEY`。

## 安装方式

进入 ComfyUI 的自定义节点目录，然后克隆本仓库：

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/GaoDaJun/comfyui-miaoxiaohei.git
cd comfyui-miaoxiaohei
pip install -r requirements.txt
```

安装完成后，重启 ComfyUI。

如果你使用的是 Windows 便携版 ComfyUI，请使用便携版自带的 Python 安装依赖：

```bash
cd ComfyUI_windows_portable
python_embeded\python.exe -m pip install -r ComfyUI\custom_nodes\comfyui-miaoxiaohei\requirements.txt
```

## 节点列表

### MiaoXiaoHei Image to SVG

图片转 SVG 节点。接收 ComfyUI 的图片输入，调用喵小黑 API 后返回 SVG 文本和本地保存路径。

输入参数：

- `image`：ComfyUI 图片输入
- `api_key`：喵小黑 API Key；留空时会读取环境变量 `MIAOXIAOHEI_API_KEY`
- `base_url`：接口域名，默认 `https://www.miaoxiaohei.com`
- `filename_prefix`：输出文件名前缀
- `max_pixels`：上传前允许的最大像素总量，默认 `4000000`
- `upload_quality`：上传压缩质量，默认 `95`
- `timeout_seconds`：接口超时时间

输出结果：

- `svg_text`：接口返回的 SVG 源码
- `svg_path`：保存到本地的 SVG 文件路径
- `request_id`：本次转换请求 ID
- `downloads_json`：SVG / PDF / EPS 下载地址信息

### MiaoXiaoHei Download Result

下载转换结果节点。使用 `MiaoXiaoHei Image to SVG` 返回的 `request_id`，下载对应的 SVG、PDF 或 EPS 文件。

输入参数：

- `request_id`：转换请求 ID
- `api_key`：喵小黑 API Key
- `base_url`：接口域名
- `format`：下载格式，可选 `svg`、`pdf`、`eps`
- `filename_prefix`：输出文件名前缀
- `timeout_seconds`：接口超时时间

输出结果：

- `file_path`：下载到本地后的文件路径

### MiaoXiaoHei API Usage

API 用量查询节点。用于查看当前 API Key 的总额度、已用额度、剩余额度、限速和最近调用记录。

输出结果：

- `summary`：简要用量信息
- `raw_json`：接口返回的完整 JSON

## 上传前预处理规则

插件会在本地 ComfyUI 里先处理图片，然后再上传到喵小黑服务器：

- 不会上传超过 `max_pixels` 总像素的图片
- 默认 `max_pixels = 4000000`，等价于 `2000 x 2000`
- `3000 x 1000 = 3000000` 像素，不会缩放
- `3000 x 2600 = 7800000` 像素，会按比例缩放到约 400 万像素以内
- 默认优先保存为 WebP，质量为 `upload_quality`
- 如果本地 Pillow 不支持 WebP，会自动退回 JPEG，同样使用该质量

这一步发生在用户本地电脑，不会额外消耗喵小黑服务器资源。

## API Key 配置

方式一：直接在节点里填写 `api_key`。

方式二：设置环境变量，然后节点里的 `api_key` 留空。

Windows：

```bash
set MIAOXIAOHEI_API_KEY=your_api_key
```

macOS / Linux：

```bash
export MIAOXIAOHEI_API_KEY=your_api_key
```

## 当前调用的接口

```text
POST /api/vectorize
GET /api/vectorize/download/{request_id}/{format}
GET /api/vectorize/usage
```

鉴权方式：

```text
X-API-Key: your_api_key
```

## 后续计划

- 后端开放 API-Key 版本的高清放大接口后，增加高清放大 ComfyUI 节点
- 后端开放 API-Key 版本的抠图接口后，增加抠图 ComfyUI 节点
- 增加 SVG 转预览图能力，方便在 ComfyUI 内直接查看矢量结果
