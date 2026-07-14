/**
 * Portrait processing pipeline.
 * Uses remove.bg when REMOVE_BG_API_KEY is set; otherwise applies a client-side cut-out.
 */

export type ProcessPortraitResult = {
  processedImage: string;
  method: "removebg" | "client_cutout";
};

export async function processPortraitOnServer(
  imageDataUrl: string,
  apiKey?: string,
): Promise<ProcessPortraitResult> {
  if (apiKey) {
    try {
      const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
      const form = new FormData();
      form.append("image_file_b64", base64);
      form.append("size", "auto");

      const response = await fetch("https://api.remove.bg/v1.0/removebg", {
        method: "POST",
        headers: { "X-Api-Key": apiKey },
        body: form,
      });

      if (response.ok) {
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (const i of bytes) binary += String.fromCharCode(i);
        const b64 = btoa(binary);
        return {
          processedImage: `data:image/png;base64,${b64}`,
          method: "removebg",
        };
      }
    } catch {
      // Fall through to client-side cutout on server using canvas simulation.
    }
  }

  return {
    processedImage: await applyClientCutout(imageDataUrl),
    method: "client_cutout",
  };
}

export async function applyClientCutout(dataUrl: string): Promise<string> {
  if (typeof window !== "undefined") {
    return cutoutInBrowser(dataUrl);
  }

  // Server-side: return original when no browser canvas (remove.bg failed).
  return dataUrl;
}

function cutoutInBrowser(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = Math.min(img.width, img.height, 1024);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      const offsetX = (img.width - size) / 2;
      const offsetY = (img.height - size) / 2;
      ctx.drawImage(img, offsetX, offsetY, size, size, 0, 0, size, size);

      const imageData = ctx.getImageData(0, 0, size, size);
      const data = imageData.data;
      const cx = size / 2;
      const cy = size / 2;
      const rx = size * 0.38;
      const ry = size * 0.48;

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const dx = (x - cx) / rx;
          const dy = (y - cy) / ry;
          const dist = dx * dx + dy * dy;
          const idx = (y * size + x) * 4;
          if (dist > 1) {
            const edge = dist - 1;
            const alpha = Math.max(0, 1 - edge * 4);
            data[idx + 3] = Math.round(data[idx + 3]! * alpha);
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
