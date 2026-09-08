const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const crypto = require('node:crypto');
const context = vm.createContext({ window: {}, crypto, URL, document: { baseURI: 'https://example.com/MyPage-suihan/travel/' } });
vm.runInContext(fs.readFileSync('assets/js/travel-data.js', 'utf8'), context);
const data = context.window.TravelData;
const plain = value => JSON.parse(JSON.stringify(value));
test('legacy trip title, caption, location, range and cover become an editable moment without data loss', () => {
  const original = { id: 'old', title: '四姑娘山', summary: '一起走过的路', destination: { zh: '四川阿坝' },
    date_range: '2023年8月7日-8月11日', cover_image: '/cover.jpg', photos: [{ file: '/other.jpg', caption: '注释' }], tags: ['山'] };
  const normalized = data.normalize(original);
  assert.equal(normalized.text, '四姑娘山\n一起走过的路');
  assert.equal(normalized.location, '四川阿坝');
  const updated = data.updateEntry(original, normalized);
  assert.equal(updated.id, 'old');
  assert.equal(updated.text, normalized.text);
  assert.equal(updated.date, original.date_range);
  assert.deepEqual(plain(updated.photos), ['/cover.jpg', { file: '/other.jpg', caption: '注释' }]);
  assert.deepEqual(plain(updated.tags), ['山']);
  assert.equal(data.normalize(updated).text, normalized.text);
  assert.equal(original.title, '四姑娘山');
});
test('removed legacy cover and cleared location do not reappear after saving', () => {
  const old = { title: '标题', destination: '旧地点', cover_image: '/cover.jpg', summary: '旧文案', photos: [] };
  const updated = data.updateEntry(old, { text: '新文案', location: '', date: '2026-09-06', photos: [] });
  assert.equal(data.normalize(updated).location, '');
  assert.equal(data.normalize(updated).photos.length, 0);
  assert.equal(data.normalize(updated).text, '新文案');
});
test('new photo-only and text-only moments need no title', () => {
  for (const draft of [{ text: '', photos: ['/photo.jpg'] }, { text: '只有文案', photos: [] }]) {
    const created = data.updateEntry(null, { ...draft, date: '', location: '' });
    assert.match(created.id, /^moment-/);
    assert.match(created.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(created.created_at);
    assert.equal('title' in created, false);
  }
});
test('photo order and object metadata survive edits', () => {
  const first = { file: '/a.jpg', alt: 'A', caption: '原说明' }, second = { url: '/b.jpg' };
  const updated = data.updateEntry({ photos: [first, second] }, { text: '排序', location: '', date: '2026-09-06', photos: [second, first] });
  assert.deepEqual(plain(updated.photos), [second, first]);
});
test('Chinese date ranges and modern dates are sorted by date', () => {
  assert.ok(data.sortKey({ date: '2026-09-06' }) > data.sortKey({ date_range: '2023年8月7日-8月11日' }));
  assert.ok(data.sortKey({ date: '2026-09-06', time: '12:31' }) > data.sortKey({ date: '2026-09-06', time: '12:30' }));
});
test('photo resolver respects the project base path and rejects executable URLs', () => {
  assert.equal(data.resolvePhoto('/assets/img/a.jpg', '/MyPage-suihan'), 'https://example.com/MyPage-suihan/assets/img/a.jpg');
  assert.equal(data.resolvePhoto({ url: 'https://cdn.example.com/a.jpg' }), 'https://cdn.example.com/a.jpg');
  assert.equal(data.resolvePhoto('javascript:alert(1)'), '');
  assert.equal(data.resolvePhoto({}), '');
});


test('thumbnail resolution supports legacy photos, metadata and safe fallback', () => {
  const photo = { file: '/assets/img/travel/full.jpg', thumbnail: '/assets/img/travel/small.webp', caption: 'keep' };
  assert.equal(data.resolveThumbnail(photo, '/MyPage-suihan'), 'https://example.com/MyPage-suihan/assets/img/travel/small.webp');
  assert.equal(data.resolvePhoto(photo, '/MyPage-suihan'), 'https://example.com/MyPage-suihan/assets/img/travel/full.jpg');
  assert.equal(data.resolveThumbnail('/assets/img/old.jpg', '/MyPage-suihan'), 'https://example.com/MyPage-suihan/assets/img/old.jpg');
  assert.equal(data.resolveThumbnail({ ...photo, thumbnail: 'javascript:alert(1)' }, '/MyPage-suihan'), data.resolvePhoto(photo, '/MyPage-suihan'));
  const updated = data.updateEntry({}, { text: '', date: '2026-09-08', location: '', photos: [photo] });
  assert.deepEqual(plain(updated.photos), [photo]);
});
