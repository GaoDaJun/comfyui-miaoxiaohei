# ComfyUI MiaoXiaoHei

ComfyUI custom nodes for the MiaoXiaoHei image vectorization API.

This first version supports:

- Convert ComfyUI `IMAGE` to SVG by calling `POST /api/vectorize`
- Resize images larger than 2000 x 2000 pixels of total resolution before upload
- Compress uploaded images with quality 95 before upload
- Save returned SVG into the ComfyUI output folder
- Download SVG / PDF / EPS by `request_id`
- Query API quota and recent usage

> API keys are not included in this repository. Get an API key from your MiaoXiaoHei admin panel, then fill it in the node input or set the `MIAOXIAOHEI_API_KEY` environment variable.

## Installation

Clone this repository into your ComfyUI custom nodes folder:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/YOUR_NAME/comfyui-miaoxiaohei.git
cd comfyui-miaoxiaohei
pip install -r requirements.txt
```

Restart ComfyUI after installation.

For the Windows portable ComfyUI package, install dependencies with the bundled Python:

```bash
cd ComfyUI_windows_portable
python_embeded\python.exe -m pip install -r ComfyUI\custom_nodes\comfyui-miaoxiaohei\requirements.txt
```

## Nodes

### MiaoXiaoHei Image to SVG

Inputs:

- `image`: ComfyUI image input
- `api_key`: MiaoXiaoHei API key. Leave blank to use `MIAOXIAOHEI_API_KEY`
- `base_url`: default `https://www.miaoxiaohei.com`
- `filename_prefix`: output filename prefix
- `max_pixels`: default `4000000`; images above this total pixel count are resized proportionally before upload
- `upload_quality`: default `95`; upload compression quality
- `timeout_seconds`: request timeout

Outputs:

- `svg_text`: SVG source returned by the API
- `svg_path`: local saved SVG file path
- `request_id`: conversion request id
- `downloads_json`: API download links for `svg`, `pdf`, and `eps`

Upload preprocessing:

- The node never sends images above `max_pixels` total pixels.
- The default `max_pixels` is `4000000`, equivalent to `2000 x 2000`.
- Example: `3000 x 1000` is 3,000,000 pixels, so it is not resized.
- Example: `3000 x 2600` is 7,800,000 pixels, so it is resized proportionally to about 4,000,000 pixels.
- The node uploads WebP at `upload_quality` when Pillow supports WebP.
- If local Pillow cannot write WebP, it falls back to JPEG at the same quality.
- This preprocessing happens locally inside ComfyUI before the request reaches the MiaoXiaoHei server.

### MiaoXiaoHei Download Result

Use the `request_id` from the vectorize node to download `svg`, `pdf`, or `eps`.

### MiaoXiaoHei API Usage

Query quota, remaining balance, status, and recent API logs for the current API key.

## Environment Variable

Instead of filling the key in every workflow, you can set:

```bash
set MIAOXIAOHEI_API_KEY=your_api_key
```

On macOS / Linux:

```bash
export MIAOXIAOHEI_API_KEY=your_api_key
```

Then leave the `api_key` input empty.

## API Requirements

The current plugin calls these endpoints:

- `POST /api/vectorize`
- `GET /api/vectorize/download/{request_id}/{format}`
- `GET /api/vectorize/usage`

Authentication:

```text
X-API-Key: your_api_key
```

## Roadmap

- Add MiaoXiaoHei upscale node after the server exposes an API-key based upscale endpoint.
- Add image preview rendering for returned SVG when a lightweight renderer is available.
