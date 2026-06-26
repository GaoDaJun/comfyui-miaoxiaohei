# 喵小黑 ComfyUI 插件

把图片直接接入喵小黑转矢量服务，在 ComfyUI 里一键生成 SVG。

官网：[https://www.miaoxiaohei.com](https://www.miaoxiaohei.com)

## 安装

进入 ComfyUI 的自定义节点目录：

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/GaoDaJun/comfyui-miaoxiaohei.git
```

然后重启 ComfyUI。

## 使用

1. 添加图片加载节点。
2. 添加 `喵小黑图片转 SVG` 节点。
3. 把图片连接到节点的 `image`。
4. 在 `api_key` 填入你的喵小黑 ComfyUI API Key。
5. 运行工作流。

转换成功后，节点里会显示 SVG 预览，并把 SVG 文件保存到 ComfyUI 输出目录。

## API Key

登录喵小黑官网后，打开 ComfyUI 接入页复制自己的 API Key。

API Key 会扣除你在官网购买套餐里的次数。
