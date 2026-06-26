import io
import json
import os
import re
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Dict, Tuple

import numpy as np
from PIL import Image

try:
    import folder_paths
except Exception:  # pragma: no cover - only used outside ComfyUI during local checks.
    folder_paths = None

try:
    from aiohttp import web
    from server import PromptServer
except Exception:  # pragma: no cover - ComfyUI provides these at runtime.
    web = None
    PromptServer = None


PLUGIN_VERSION = "0.1.5"
DEFAULT_BASE_URL = "https://www.miaoxiaohei.com"
USER_AGENT = f"ComfyUI-MiaoXiaoHei/{PLUGIN_VERSION}"
DEFAULT_MAX_PIXELS = 2000 * 2000
HARD_MAX_PIXELS = 2000 * 2000
DEFAULT_UPLOAD_QUALITY = 95
DEFAULT_TIMEOUT_SECONDS = 500
DOWNLOAD_MIME_TYPES = {
    "svg": "image/svg+xml",
    "pdf": "application/pdf",
    "eps": "application/postscript",
}
_RESULT_CACHE: Dict[str, Dict[str, Any]] = {}


def _clean_base_url(base_url: str) -> str:
    value = str(base_url or DEFAULT_BASE_URL).strip()
    if not value:
        value = DEFAULT_BASE_URL
    return value.rstrip("/")


def _default_base_url() -> str:
    return _clean_base_url(os.environ.get("MIAOXIAOHEI_BASE_URL", DEFAULT_BASE_URL))


def _api_key(api_key: str) -> str:
    value = str(api_key or "").strip() or os.environ.get("MIAOXIAOHEI_API_KEY", "").strip()
    if not value:
        raise ValueError("缺少 API Key，请在 api_key 中填写，或设置 MIAOXIAOHEI_API_KEY。")
    return value


def _headers(api_key: str) -> Dict[str, str]:
    return {
        "X-API-Key": _api_key(api_key),
        "X-MiaoXiaoHei-Client": "comfyui",
        "User-Agent": USER_AGENT,
    }


def _http_request(
    url: str,
    method: str = "GET",
    headers: Dict[str, str] | None = None,
    body: bytes | None = None,
    timeout: int = 60,
) -> Tuple[int, Dict[str, str], bytes]:
    request = urllib.request.Request(url, data=body, headers=headers or {}, method=method.upper())
    try:
        with urllib.request.urlopen(request, timeout=max(10, int(timeout or 60))) as response:
            return response.status, dict(response.headers.items()), response.read()
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers.items()), error.read()
    except urllib.error.URLError as error:
        raise RuntimeError(f"API 请求失败：{error.reason}") from error


def _absolute_url(base_url: str, path_or_url: str) -> str:
    value = str(path_or_url or "").strip()
    if not value:
        return ""
    if value.startswith(("http://", "https://")):
        return value
    if not value.startswith("/"):
        value = f"/{value}"
    return f"{_clean_base_url(base_url)}{value}"


def _cache_result(result_id: str, data: Dict[str, Any]) -> None:
    _RESULT_CACHE[result_id] = {**data, "created_at": time.time()}
    if len(_RESULT_CACHE) <= 100:
        return
    expired_before = time.time() - 24 * 60 * 60
    for key, value in list(_RESULT_CACHE.items()):
        if value.get("created_at", 0) < expired_before:
            _RESULT_CACHE.pop(key, None)
    while len(_RESULT_CACHE) > 100:
        oldest_key = min(_RESULT_CACHE, key=lambda item: _RESULT_CACHE[item].get("created_at", 0))
        _RESULT_CACHE.pop(oldest_key, None)


def _get_cached_result(result_id: str) -> Dict[str, Any]:
    data = _RESULT_CACHE.get(str(result_id or "").strip())
    if not data:
        raise ValueError("SVG 结果已过期或不存在，请重新运行图片转 SVG 节点。")
    return data


def _download_result_file(result_id: str, output_format: str) -> Tuple[bytes, str, str]:
    clean_format = str(output_format or "").strip().lower()
    if clean_format not in DOWNLOAD_MIME_TYPES:
        raise ValueError("不支持的下载格式。")

    data = _get_cached_result(result_id)
    if clean_format == "svg":
        svg_path = Path(str(data.get("svg_path") or ""))
        if svg_path.exists():
            return svg_path.read_bytes(), svg_path.name, DOWNLOAD_MIME_TYPES["svg"]
        return str(data.get("svg_text") or "").encode("utf-8"), "miaoxiaohei_vector.svg", DOWNLOAD_MIME_TYPES["svg"]

    request_id = str(data.get("request_id") or "").strip()
    api_key = str(data.get("api_key") or "").strip()
    base_url = _clean_base_url(str(data.get("base_url") or DEFAULT_BASE_URL))
    if not request_id:
        raise ValueError("当前结果缺少 request_id，无法下载 PDF/EPS，请重新转换。")

    url = f"{base_url}/api/vectorize/download/{request_id}/{clean_format}"
    status_code, response_headers, content = _http_request(
        url,
        method="GET",
        headers=_headers(api_key),
        timeout=DEFAULT_TIMEOUT_SECONDS,
    )
    content_type = next(
        (value for key, value in response_headers.items() if key.lower() == "content-type"),
        "",
    )
    if "application/json" in content_type:
        payload = _read_json_response(status_code, content)
        _raise_for_api_error(payload, f"下载失败，HTTP {status_code}。")
    if status_code >= 400:
        text = content.decode("utf-8", errors="replace")[:500] if content else ""
        raise RuntimeError(f"下载失败，HTTP {status_code}：{text}")

    filename = f"miaoxiaohei_vector_{request_id[:8]}.{clean_format}"
    return content, filename, DOWNLOAD_MIME_TYPES[clean_format]


def _multipart_form_data(field_name: str, filename: str, content: bytes, content_type: str) -> Tuple[bytes, str]:
    boundary = f"----MiaoXiaoHeiComfyUI{uuid.uuid4().hex}"
    lines = [
        f"--{boundary}\r\n".encode("utf-8"),
        (
            f'Content-Disposition: form-data; name="{field_name}"; '
            f'filename="{filename}"\r\n'
        ).encode("utf-8"),
        f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"),
        content,
        b"\r\n",
        f"--{boundary}--\r\n".encode("utf-8"),
    ]
    return b"".join(lines), f"multipart/form-data; boundary={boundary}"


def _safe_filename(text: str, fallback: str = "miaoxiaohei") -> str:
    value = re.sub(r"[^a-zA-Z0-9._-]+", "_", str(text or "").strip()).strip("._-")
    return value[:80] or fallback


def _output_dir() -> Path:
    if folder_paths is not None:
        try:
            base = folder_paths.get_output_directory()
        except Exception:
            base = None
    else:
        base = None

    path = Path(base or Path.cwd() / "output") / "miaoxiaohei"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _unique_path(prefix: str, suffix: str, request_id: str = "") -> Path:
    safe_prefix = _safe_filename(prefix)
    safe_request = _safe_filename(request_id[:12], "result") if request_id else "result"
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    base = _output_dir() / f"{safe_prefix}_{timestamp}_{safe_request}.{suffix.lstrip('.')}"
    if not base.exists():
        return base

    for index in range(2, 1000):
        candidate = base.with_name(f"{base.stem}_{index}{base.suffix}")
        if not candidate.exists():
            return candidate
    raise RuntimeError("Could not create a unique output filename.")


def _image_tensor_to_pil(image: Any) -> Image.Image:
    if image is None:
        raise ValueError("Missing IMAGE input.")

    if hasattr(image, "detach"):
        array = image.detach().cpu().numpy()
    else:
        array = np.asarray(image)

    if array.ndim == 4:
        array = array[0]
    if array.ndim != 3:
        raise ValueError(f"Unsupported IMAGE shape: {array.shape}")

    if array.shape[0] in (1, 3, 4) and array.shape[-1] not in (1, 3, 4):
        array = np.moveaxis(array, 0, -1)

    array = np.clip(array, 0.0, 1.0)
    array = (array * 255.0).round().astype(np.uint8)

    channels = array.shape[-1]
    if channels == 1:
        return Image.fromarray(array[..., 0], mode="L")
    elif channels == 3:
        return Image.fromarray(array, mode="RGB")
    elif channels == 4:
        return Image.fromarray(array, mode="RGBA")
    raise ValueError(f"Unsupported IMAGE channel count: {channels}")


def _prepare_upload_image(
    image: Any,
    max_pixels: int = DEFAULT_MAX_PIXELS,
    quality: int = DEFAULT_UPLOAD_QUALITY,
) -> Tuple[bytes, str, str]:
    pil_image = _image_tensor_to_pil(image)
    max_pixels = min(HARD_MAX_PIXELS, max(256 * 256, int(max_pixels or DEFAULT_MAX_PIXELS)))
    quality = max(1, min(100, int(quality or DEFAULT_UPLOAD_QUALITY)))

    width, height = pil_image.size
    total_pixels = width * height
    if total_pixels > max_pixels:
        scale = (max_pixels / float(total_pixels)) ** 0.5
        target_size = (max(1, round(width * scale)), max(1, round(height * scale)))
        resampling = getattr(Image, "Resampling", Image).LANCZOS
        pil_image = pil_image.resize(target_size, resampling)

    buffer = io.BytesIO()
    has_alpha = pil_image.mode in ("RGBA", "LA") or (pil_image.mode == "P" and "transparency" in pil_image.info)
    try:
        if has_alpha:
            pil_image.save(buffer, format="WEBP", quality=quality, method=6, lossless=False)
        else:
            pil_image.convert("RGB").save(buffer, format="WEBP", quality=quality, method=6, lossless=False)
        return buffer.getvalue(), "image.webp", "image/webp"
    except Exception:
        buffer = io.BytesIO()
        background = Image.new("RGB", pil_image.size, (255, 255, 255))
        if has_alpha:
            alpha_source = pil_image.convert("RGBA")
            background.paste(alpha_source, mask=alpha_source.getchannel("A"))
        else:
            background = pil_image.convert("RGB")
        background.save(buffer, format="JPEG", quality=quality, optimize=True, progressive=True)
        return buffer.getvalue(), "image.jpg", "image/jpeg"


def _read_json_response(status_code: int, content: bytes) -> Dict[str, Any]:
    try:
        return json.loads(content.decode("utf-8", errors="replace"))
    except json.JSONDecodeError:
        text = content.decode("utf-8", errors="replace")[:500] if content else ""
        raise RuntimeError(f"API 返回了非 JSON 内容（{status_code}）：{text}")


def _raise_for_api_error(payload: Dict[str, Any], fallback: str = "喵小黑 API 请求失败。") -> None:
    if payload.get("success") is True:
        return
    message = payload.get("message") or payload.get("error") or fallback
    request_id = payload.get("request_id")
    if request_id:
        message = f"{message} request_id={request_id}"
    raise RuntimeError(message)


class MiaoXiaoHeiVectorize:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "api_key": ("STRING", {"default": "", "multiline": False}),
            }
        }

    RETURN_TYPES = ("MIAOXIAOHEI_SVG",)
    RETURN_NAMES = ("SVG结果",)
    FUNCTION = "run"
    CATEGORY = "喵小黑"

    def run(
        self,
        image,
        api_key: str,
    ) -> Tuple[Dict[str, Any]]:
        base_url = _default_base_url()
        upload_bytes, upload_name, upload_mime = _prepare_upload_image(
            image,
            DEFAULT_MAX_PIXELS,
            DEFAULT_UPLOAD_QUALITY,
        )
        url = f"{base_url}/api/vectorize"
        body, content_type = _multipart_form_data("image", upload_name, upload_bytes, upload_mime)
        headers = {
            **_headers(api_key),
            "Content-Type": content_type,
        }
        status_code, _, content = _http_request(
            url,
            method="POST",
            headers=headers,
            body=body,
            timeout=DEFAULT_TIMEOUT_SECONDS,
        )
        payload = _read_json_response(status_code, content)
        _raise_for_api_error(payload, f"Vectorize failed with HTTP {status_code}.")

        svg_text = str(payload.get("svg") or "")
        if "<svg" not in svg_text.lower():
            raise RuntimeError("API response did not include valid SVG text.")

        request_id = str(payload.get("request_id") or "")
        result_id = uuid.uuid4().hex
        svg_path = _unique_path("miaoxiaohei_vector", "svg", request_id)
        svg_path.write_text(svg_text, encoding="utf-8")

        result = {
            "result_id": result_id,
            "request_id": request_id,
            "svg_text": svg_text,
            "svg_path": str(svg_path),
            "base_url": base_url,
            "api_key": _api_key(api_key),
        }
        _cache_result(result_id, result)

        return (result,)


class MiaoXiaoHeiSvgPreview:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "SVG结果": ("MIAOXIAOHEI_SVG",),
                "原图": ("IMAGE",),
            }
        }

    RETURN_TYPES = ()
    FUNCTION = "run"
    CATEGORY = "喵小黑"
    OUTPUT_NODE = True

    def run(self, **kwargs) -> Dict[str, Any]:
        svg_result = kwargs.get("SVG结果") or kwargs.get("svg_result")
        original_image = kwargs.get("原图") or kwargs.get("original_image")

        if not isinstance(svg_result, dict):
            raise ValueError("请连接“喵小黑图片转 SVG”节点输出的 SVG结果。")
        if original_image is None:
            raise ValueError("请连接原图。")

        svg_text = str(svg_result.get("svg_text") or "")
        svg_path = str(svg_result.get("svg_path") or "")
        result_id = str(svg_result.get("result_id") or svg_result.get("request_id") or uuid.uuid4().hex)
        request_id = str(svg_result.get("request_id") or "")
        base_url = str(svg_result.get("base_url") or _default_base_url())
        api_key = str(svg_result.get("api_key") or "")

        if "<svg" not in svg_text.lower():
            if svg_path and Path(svg_path).exists():
                svg_text = Path(svg_path).read_text(encoding="utf-8")
            else:
                raise RuntimeError("SVG 结果缺少 SVG 内容，请重新转换。")

        original_path = _unique_path("miaoxiaohei_original", "png", request_id)
        _image_tensor_to_pil(original_image).save(original_path, format="PNG")

        _cache_result(
            result_id,
            {
                "result_id": result_id,
                "request_id": request_id,
                "svg_text": svg_text,
                "svg_path": svg_path,
                "base_url": base_url,
                "api_key": api_key,
            },
        )

        return {
            "ui": {
                "svg": [svg_text],
                "svg_path": [svg_path],
                "result_id": [result_id],
                "original_image": [
                    {
                        "filename": original_path.name,
                        "subfolder": "miaoxiaohei",
                        "type": "output",
                    }
                ],
            }
        }


NODE_CLASS_MAPPINGS = {
    "MiaoXiaoHeiVectorize": MiaoXiaoHeiVectorize,
    "MiaoXiaoHeiSvgPreview": MiaoXiaoHeiSvgPreview,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MiaoXiaoHeiVectorize": "喵小黑图片转 SVG",
    "MiaoXiaoHeiSvgPreview": "喵小黑预览 SVG",
}


if PromptServer is not None and web is not None:
    @PromptServer.instance.routes.get("/miaoxiaohei/download/{result_id}/{output_format}")
    async def miaoxiaohei_download(request):
        try:
            result_id = request.match_info.get("result_id", "")
            output_format = request.match_info.get("output_format", "")
            content, filename, mime_type = _download_result_file(result_id, output_format)
            return web.Response(
                body=content,
                content_type=mime_type,
                headers={"Content-Disposition": f'attachment; filename="{filename}"'},
            )
        except Exception as error:
            return web.json_response({"success": False, "message": str(error)}, status=400)
