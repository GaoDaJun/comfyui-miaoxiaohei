# Example Workflow Notes

1. Add an image loader node in ComfyUI.
2. Connect the image output to `MiaoXiaoHei Image to SVG`.
3. Fill `base_url` with your service URL, for example `https://www.miaoxiaohei.com`.
4. Fill `api_key`, or set `MIAOXIAOHEI_API_KEY` before starting ComfyUI.
5. Run the workflow.
6. The SVG file is saved under ComfyUI `output/miaoxiaohei/`.

The vectorize node preprocesses uploads locally:

- Images above `max_pixels` total pixels are resized proportionally.
- The default `max_pixels` is `4000000`, equivalent to `2000 x 2000`.
- A `3000 x 1000` image is not resized because it is only 3,000,000 pixels.
- A `3000 x 2600` image is resized because it is 7,800,000 pixels.
- The default upload compression quality is `95`.

To download PDF or EPS:

1. Connect or copy the `request_id` output to `MiaoXiaoHei Download Result`.
2. Select `pdf` or `eps` in the `format` input.
3. Run the node.
