/* Generate a lightweight list image without changing the original or GIF animation. */
(() => {
  async function createThumbnail(file) {
    if (file.type === 'image/gif') return null;
    const url = URL.createObjectURL(file);
    const image = new Image();
    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('无法读取照片，请换一张图片后重试。'));
        image.src = url;
      });
      const scale = Math.min(1, 800 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('无法处理照片，请更新浏览器后重试。');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.76));
      if (!blob) throw new Error('生成缩略图失败，请重试。');
      // Browsers without WebP encoding return PNG. Never upload a larger preview.
      return blob.size < file.size ? blob : null;
    } finally { URL.revokeObjectURL(url); image.src = ''; }
  }
  window.TravelImages = { createThumbnail };
})();
