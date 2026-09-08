// Backfill local travel photos only. Requires Python + Pillow; original files stay intact.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const yaml = require('../assets/js/lib/js-yaml.min.js');
const root = path.resolve(__dirname, '..');
const file = path.join(root, '_data/travel.yml');
const data = yaml.load(fs.readFileSync(file, 'utf8'), { schema: yaml.JSON_SCHEMA });
let original = 0, thumbnails = 0, count = 0;
const cached = new Map();
function optimize(photo) {
  const source = typeof photo === 'string' ? photo : photo?.file || photo?.src || photo?.url;
  if (photo?.thumbnail || !/^\/assets\/img\/travel\/[^/]+\.(jpe?g|png|webp)$/i.test(source || '')) return photo;
  const absolute = path.resolve(root, '.' + source);
  if (!absolute.startsWith(path.join(root, 'assets', 'img', 'travel') + path.sep) || !fs.existsSync(absolute)) return photo;
  if (!cached.has(source)) {
    const target = source + '.thumb.webp';
    const result = JSON.parse(execFileSync(process.env.PYTHON || 'python', [path.join(__dirname, 'travel-thumbnail.py'), absolute, path.join(root, '.' + target)], { encoding: 'utf8' }));
    cached.set(source, result.skipped ? null : target);
    if (!result.skipped) { original += result.original; thumbnails += result.thumbnail; count++; }
  }
  const thumbnail = cached.get(source);
  return thumbnail ? { ...(typeof photo === 'string' ? { file: photo } : photo), thumbnail } : photo;
}
for (const entry of data.entries || []) {
  if (!Array.isArray(entry.photos)) continue;
  entry.photos = entry.photos.map(optimize);
}
if (count) fs.writeFileSync(file, yaml.dump(data, { lineWidth: -1, noRefs: true }));
console.log(JSON.stringify({ count, originalBytes: original, thumbnailBytes: thumbnails, reduction: original ? `${(100 * (1 - thumbnails / original)).toFixed(1)}%` : 'unchanged' }));
