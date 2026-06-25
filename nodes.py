import io
import json
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, Tuple

import numpy as np
import requests
from PIL import Image

try:
    import folder_paths
except Exception:  # pragma: no cover - only used outside ComfyUI during local checks.
    folder_paths = None


PLUGIN_VERSION = "0.1.2"
DEFAULT_BASE_URL = "https://www.miaoxiaohei.com"
USER_AGENT = f"ComfyUI-MiaoXiaoHei/{PLUGIN_VERSION}"
DEFAULT_MAX_PIXELS = 2000 * 2000
HARD_MAX_PIXELS = 2000 * 2000
DEFAULT_UPLOAD_QUALITY = 95


def _clean_base_url(base_url: str) -> str:
    value = str(base_url or DEFAULT_BASE_URL).strip()
    if not value:
        value = DEFAULT_BASE_URL
    return value.rstrip("/")


def _api_key(api_key: str) -> str:
    value = str(api_key or "").strip() or os.environ.get("MIAOXIAOHEI_API_KEY", "").strip()
    if not value:
        raise ValueError("Missing API Key. Fill api_key or set MIAOXIAOHEI_API_KEY.")
    return value


def _headers(api_key: str) -> Dict[str, str]:
    return {
        "X-API-Key": _api_key(api_key),
        "User-Agent": USER_AGENT,
    }


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


def _read_json_response(response: requests.Response) -> Dict[str, Any]:
    try:
        return response.json()
    except json.JSONDecodeError:
        text = response.text[:500] if response.text else ""
        raise RuntimeError(f"API returned non-JSON response ({response.status_code}): {text}")


def _raise_for_api_error(payload: Dict[str, Any], fallback: str = "MiaoXiaoHei API request failed.") -> None:
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
                "base_url": ("STRING", {"default": DEFAULT_BASE_URL, "multiline": False}),
                "filename_prefix": ("STRING", {"default": "miaoxiaohei_vector", "multiline": False}),
                "max_pixels": ("INT", {"default": DEFAULT_MAX_PIXELS, "min": 65536, "max": HARD_MAX_PIXELS, "step": 65536}),
                "upload_quality": ("INT", {"default": DEFAULT_UPLOAD_QUALITY, "min": 1, "max": 100, "step": 1}),
                "timeout_seconds": ("INT", {"default": 180, "min": 10, "max": 900, "step": 10}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("svg_text", "svg_path", "request_id", "downloads_json")
    FUNCTION = "run"
    CATEGORY = "MiaoXiaoHei/API"

    def run(
        self,
        image,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        filename_prefix: str = "miaoxiaohei_vector",
        max_pixels: int = DEFAULT_MAX_PIXELS,
        upload_quality: int = DEFAULT_UPLOAD_QUALITY,
        timeout_seconds: int = 180,
    ) -> Tuple[str, str, str, str]:
        upload_bytes, upload_name, upload_mime = _prepare_upload_image(image, max_pixels, upload_quality)
        url = f"{_clean_base_url(base_url)}/api/vectorize"
        response = requests.post(
            url,
            headers=_headers(api_key),
            files={"image": (upload_name, upload_bytes, upload_mime)},
            timeout=max(10, int(timeout_seconds or 180)),
        )
        payload = _read_json_response(response)
        _raise_for_api_error(payload, f"Vectorize failed with HTTP {response.status_code}.")

        svg_text = str(payload.get("svg") or "")
        if "<svg" not in svg_text.lower():
            raise RuntimeError("API response did not include valid SVG text.")

        request_id = str(payload.get("request_id") or "")
        svg_path = _unique_path(filename_prefix, "svg", request_id)
        svg_path.write_text(svg_text, encoding="utf-8")

        downloads = payload.get("downloads") or {}
        downloads_json = json.dumps(downloads, ensure_ascii=False, indent=2)
        return svg_text, str(svg_path), request_id, downloads_json


class MiaoXiaoHeiDownloadResult:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "request_id": ("STRING", {"default": "", "multiline": False}),
                "api_key": ("STRING", {"default": "", "multiline": False}),
                "base_url": ("STRING", {"default": DEFAULT_BASE_URL, "multiline": False}),
                "format": (["svg", "pdf", "eps"], {"default": "svg"}),
                "filename_prefix": ("STRING", {"default": "miaoxiaohei_download", "multiline": False}),
                "timeout_seconds": ("INT", {"default": 180, "min": 10, "max": 900, "step": 10}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("file_path",)
    FUNCTION = "run"
    CATEGORY = "MiaoXiaoHei/API"

    def run(
        self,
        request_id: str,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        format: str = "svg",
        filename_prefix: str = "miaoxiaohei_download",
        timeout_seconds: int = 180,
    ) -> Tuple[str]:
        clean_request_id = str(request_id or "").strip()
        if not clean_request_id:
            raise ValueError("request_id is required.")

        output_format = str(format or "svg").strip().lower()
        if output_format not in {"svg", "pdf", "eps"}:
            raise ValueError("format must be svg, pdf, or eps.")

        url = f"{_clean_base_url(base_url)}/api/vectorize/download/{clean_request_id}/{output_format}"
        response = requests.get(url, headers=_headers(api_key), timeout=max(10, int(timeout_seconds or 180)))
        content_type = response.headers.get("Content-Type", "")

        if "application/json" in content_type:
            payload = _read_json_response(response)
            _raise_for_api_error(payload, f"Download failed with HTTP {response.status_code}.")

        if response.status_code >= 400:
            text = response.text[:500] if response.text else response.reason
            raise RuntimeError(f"Download failed with HTTP {response.status_code}: {text}")

        file_path = _unique_path(filename_prefix, output_format, clean_request_id)
        file_path.write_bytes(response.content)
        return (str(file_path),)


class MiaoXiaoHeiUsage:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "api_key": ("STRING", {"default": "", "multiline": False}),
                "base_url": ("STRING", {"default": DEFAULT_BASE_URL, "multiline": False}),
                "page": ("INT", {"default": 1, "min": 1, "max": 9999, "step": 1}),
                "timeout_seconds": ("INT", {"default": 60, "min": 10, "max": 300, "step": 10}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("summary", "raw_json")
    FUNCTION = "run"
    CATEGORY = "MiaoXiaoHei/API"

    def run(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        page: int = 1,
        timeout_seconds: int = 60,
    ) -> Tuple[str, str]:
        url = f"{_clean_base_url(base_url)}/api/vectorize/usage"
        response = requests.get(
            url,
            headers=_headers(api_key),
            params={"page": max(1, int(page or 1))},
            timeout=max(10, int(timeout_seconds or 60)),
        )
        payload = _read_json_response(response)
        _raise_for_api_error(payload, f"Usage query failed with HTTP {response.status_code}.")

        data = payload.get("data") or {}
        client = data.get("client") or {}
        summary = (
            f"name: {client.get('name') or '-'}\n"
            f"status: {client.get('status') or '-'}\n"
            f"quota: {client.get('used_quota', 0)} / {client.get('total_quota', 0)}\n"
            f"remaining: {client.get('remaining_quota', 0)}\n"
            f"rate_limit_per_minute: {client.get('rate_limit_per_minute', '-')}\n"
            f"expires_at: {client.get('expires_at') or '-'}"
        )
        return summary, json.dumps(payload, ensure_ascii=False, indent=2)


NODE_CLASS_MAPPINGS = {
    "MiaoXiaoHeiVectorize": MiaoXiaoHeiVectorize,
    "MiaoXiaoHeiDownloadResult": MiaoXiaoHeiDownloadResult,
    "MiaoXiaoHeiUsage": MiaoXiaoHeiUsage,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MiaoXiaoHeiVectorize": "MiaoXiaoHei Image to SVG",
    "MiaoXiaoHeiDownloadResult": "MiaoXiaoHei Download Result",
    "MiaoXiaoHeiUsage": "MiaoXiaoHei API Usage",
}
