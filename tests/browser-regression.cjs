const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const siteDir = path.resolve(process.env.SITE_DIR || '_site');
const baselineDir = process.env.BASELINE_DIR && path.resolve(process.env.BASELINE_DIR);
const basePath = process.env.SITE_BASEURL ?? '/MyPage-suihan';
const artifacts = path.resolve('_site/review-artifacts');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2' };
async function serve(root) {
  const server = http.createServer((req, res) => {
    try {
      let url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (!url.startsWith(basePath + '/')) { res.writeHead(404).end(); return; }
      url = url.slice(basePath.length);
      const target = path.resolve(root, '.' + url, url.endsWith('/') ? 'index.html' : '');
      if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
        res.writeHead(404).end(); return;
      }
      res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
      fs.createReadStream(target).pipe(res);
    } catch { res.writeHead(400).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}${basePath}` };
}
(async () => {
  assert.ok(fs.existsSync(path.join(siteDir, 'index.html')), 'Build the site before browser tests');
  fs.mkdirSync(artifacts, { recursive: true });
  const optimized = await serve(siteDir);
  const baseline = baselineDir ? await serve(baselineDir) : null;
  const executablePath = process.env.CHROME_PATH || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  ].find(file => fs.existsSync(file));
  let browser;
  const errors = [];
  try {
    browser = await puppeteer.launch({ executablePath, headless: true });
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 1000 });
    const mainText = () => page.$eval('[role="main"]', el => { const clone = el.cloneNode(true); clone.querySelectorAll('script, style').forEach(node => node.remove()); return clone.textContent.replace(/\s+/g, ' ').trim(); });
    async function visit(url) {
      await page.goto(url, { waitUntil: 'load', timeout: 45000 });
      await page.waitForFunction(() => window.jQuery && window.jQuery.isReady);
    }
    for (const route of ['/', '/cv/', '/repositories/', '/projects/', '/travel/', '/admin/']) {
      let before;
      if (baseline) { await visit(baseline.url + route); before = await mainText(); }
      errors.length = 0;
      await visit(optimized.url + route);
      if (baseline) assert.equal(await mainText(), before, `Visible page content changed at ${route}`);
      assert.deepEqual(errors, [], `Runtime errors at ${route}`);
      console.log(`PASS page ${route}${baseline ? ' matches baseline content' : ''}`);
    }
    await visit(optimized.url + '/');
    await page.waitForFunction(() => typeof document.querySelector('ninja-keys')?.open === 'function');
    assert.ok(await page.$eval('ninja-keys', el => el.data.some(item => item.id === 'nav-home')));
    await page.evaluate(() => window.openSearchModal());
    assert.equal(await page.$eval('ninja-keys', el => el.visible), true);
    await page.keyboard.press('Escape');
    await page.click('#light-toggle');
    assert.equal(await page.$eval('html', el => el.dataset.theme), 'light');
    await page.click('#light-toggle');
    assert.equal(await page.$eval('html', el => el.dataset.theme), 'dark');
    await page.click('#light-toggle');
    await page.screenshot({ path: path.join(artifacts, 'home-desktop.png'), fullPage: true });
    console.log('PASS search and three-state theme switch');
    // An image error must affect only that picture, even before jQuery is available.
    assert.equal(await page.evaluate(() => {
      const image = document.querySelector('picture img');
      const first = image.parentElement;
      const copy = first.cloneNode(true);
      document.body.append(copy);
      const handler = image.getAttribute('onerror');
      Function(handler).call(image);
      const ok = first.querySelectorAll('source').length === 0 && copy.querySelectorAll('source').length > 0;
      copy.remove();
      return ok;
    }), true);
    console.log('PASS per-picture responsive image fallback');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await visit(optimized.url + '/cv/');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('mobile-toc-toggle')).bottom !== 'auto');
    await page.click('#mobile-toc-toggle');
    assert.equal(await page.$eval('#mobile-toc-drawer', el => el.classList.contains('open')), true);
    await page.waitForFunction(() => document.getElementById('mobile-toc-drawer').getBoundingClientRect().right <= window.innerWidth + 1);
    await page.click('#mobile-toc-close');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction(() => {
      const p = document.getElementById('progress'); return p.max > 1 && Math.abs(p.value - p.max) <= 2;
    });
    const oldMax = await page.$eval('#progress', el => el.max);
    await page.evaluate(() => {
      const extra = document.createElement('div'); extra.style.height = '700px'; document.body.append(extra);
    });
    await page.waitForFunction(previous => document.getElementById('progress').max >= previous + 600, {}, oldMax);
    await page.evaluate(() => { document.body.lastElementChild.remove(); window.scrollTo(0, 0); });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: path.join(artifacts, 'cv-mobile.png'), fullPage: true });
    console.log('PASS mobile TOC, scroll progress and dynamic content growth');
    // Populate travel data only inside this local test page, never in source content.
    const travelOriginal = '/assets/img/travel/e10dbec6-f54c-4630-ac89-e30957bf2ef6.jpg';
    const travelThumbnail = travelOriginal + '.thumb.webp';
    const photoRequests = [];
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (req.url().includes('/assets/img/travel/')) photoRequests.push(req.url());
      if (req.url().endsWith('/travel/')) {
        let html = fs.readFileSync(path.join(siteDir, 'travel/index.html'), 'utf8');
        const trips = [
          { title: 'Original format', date: '2026-09-04', location: '西安', text: '原格式', photos: [{ file: `${basePath}/assets/img/profile.jpg`, thumbnail: `${basePath}/assets/img/travel/missing.webp` }] },
          { title: 'CMS format', date_range: '2026-09-05', destination: '成都', summary: '后台格式', photos: [{ url: travelOriginal, thumbnail: travelThumbnail }] }
        ];
        html = html.replace(/(<script[^>]*id="travel-log-data"[^>]*>)[\s\S]*?(<\/script>)/, '$1' + JSON.stringify(trips) + '$2');
        req.respond({ status: 200, contentType: 'text/html', body: html });
      } else req.continue();
    });
    await visit(optimized.url + '/travel/');
    assert.equal(photoRequests.length, 0, 'Locked travel photos must not be fetched');
    assert.equal(await page.$eval('#travel-password', el => el.autocomplete), 'section-travel current-password');
    await page.type('#travel-password', 'wrong');
    await page.click('#travel-unlock-button');
    await page.waitForFunction(() => document.querySelector('#travel-gate-status').classList.contains('is-error'));
    assert.equal(await page.$eval('#travel-journal', el => el.hidden), true);
    const password = await page.$eval('[data-travel-log]', el => el.dataset.password);
    await page.type('#travel-password', password);
    await page.click('#travel-unlock-button');
    await page.waitForFunction(() => !document.querySelector('#travel-journal').hidden);
    assert.equal(await page.$$eval('.travel-entry', els => els.length), 2);
    assert.ok((await page.$eval('.travel-entry__text', el => el.textContent)).startsWith('CMS format'));
    assert.ok((await page.$eval('#travel-entry-grid', el => el.textContent)).includes('成都'));
    await page.waitForFunction(() => document.querySelector('.travel-photo__image').naturalWidth > 0);
    assert.ok((await page.$eval('.travel-photo__image', el => el.currentSrc)).endsWith(travelThumbnail));
    assert.equal(await page.$eval('.travel-photo__image', el => el.loading), 'eager');
    assert.equal(await page.$eval('.travel-photo__image', el => el.fetchPriority), 'high');
    assert.ok(!photoRequests.some(url => url.endsWith(travelOriginal)), 'Original loads only after clicking');
    await page.screenshot({ path: path.join(artifacts, 'travel-thumbnails-mobile.png'), fullPage: true });
    await page.click('.travel-photo');
    await page.waitForFunction(() => document.querySelector('#travel-lightbox-image').naturalWidth > 0);
    assert.ok((await page.$eval('#travel-lightbox-image', el => el.currentSrc)).endsWith(travelOriginal));
    assert.equal(await page.$eval('#travel-lightbox', el => el.hidden), false);
    await page.keyboard.press('Escape');
    await page.$eval('.travel-entry:last-child .travel-photo', el => el.scrollIntoView({ block: 'center' }));
    await page.waitForFunction(() => { const img = document.querySelector('.travel-entry:last-child .travel-photo__image'); return img?.complete && img.naturalWidth > 0 && img.src.endsWith('/assets/img/profile.jpg'); });
    assert.equal(await page.$eval('.travel-entry:last-child .travel-photo', el => el.disabled), false);
    await page.click('#travel-lock-button');
    assert.equal(await page.$$eval('.travel-entry', els => els.length), 0);
    console.log('PASS travel password, both data formats, photo preview and lock');
    // All CMS traffic is intercepted. No real token, commit, or remote write is used.
    const yaml = require('../assets/js/lib/js-yaml.min.js');
    const cvFixture = yaml.load(fs.readFileSync('_data/cv.yml', 'utf8'), { schema: yaml.JSON_SCHEMA });
    cvFixture.cv.summary = '第一行 "引用"\n第二行';
    cvFixture.cv.website = 'https://example.com';
    cvFixture.cv.sections['其他'] = [{ name: '保留条目' }];
    cvFixture.cv.sections['教育经历'][0].institution = '<img id="injected" src="x"> & school';
    const originalTravel = { password: 'test-password', custom: 'keep', entries: [{
      date: '2026-09-01', location: { zh: '西安' }, text: '原内容\n第二行', photos: [{ file: '/assets/img/profile.jpg', caption: '保留' }]
    }] };
    const files = {
      '_data/cv.yml': { sha: 'cv-old', content: yaml.dump(cvFixture) },
      '_data/travel.yml': { sha: 'travel-old', content: yaml.dump(originalTravel) },
      '_pages/about.md': { sha: 'about-old', content: fs.readFileSync('_pages/about.md', 'utf8') }
    };
    const writes = [];
    let failTravelRead = false;
    let failThumbnailUpload = true;
    const admin = await browser.newPage();
    admin.on('pageerror', error => errors.push(error.message));
    await admin.setViewport({ width: 1280, height: 1000 });
    await admin.evaluateOnNewDocument(() => localStorage.setItem('site_github_cms_config', JSON.stringify({
      token: 'local-fixture-only', owner: 'tester', repo: 'site', branch: 'main'
    })));
    await admin.setRequestInterception(true);
    admin.on('request', request => {
      const url = new URL(request.url());
      if (url.hostname !== 'api.github.com') { request.continue(); return; }
      const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS' };
      const reply = (status, body) => request.respond({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
      if (request.method() === 'OPTIONS') return reply(204, null);
      if (url.pathname === '/user') return reply(200, { login: 'tester', name: '<b id="unsafe-user">tester</b>' });
      if (url.pathname.endsWith('/actions/runs')) return reply(200, { workflow_runs: [] });
      if (!url.pathname.includes('/contents/')) return reply(200, { full_name: 'tester/site', permissions: { push: true } });
      const filePath = decodeURIComponent(url.pathname.split('/contents/')[1]);
      if (request.method() === 'GET') {
        if (failTravelRead && filePath === '_data/travel.yml') return reply(403, { message: 'Forbidden' });
        const file = files[filePath];
        return file ? reply(200, { ...file, encoding: 'base64', content: Buffer.from(file.content).toString('base64') }) : reply(404, {});
      }
      if (failThumbnailUpload && filePath.includes('.thumb.')) { failThumbnailUpload = false; return reply(500, { message: 'Temporary upload failure' }); }
      const payload = JSON.parse(request.postData());
      if (payload.sha !== files[filePath]?.sha) return reply(409, {});
      writes.push({ filePath, payload });
      files[filePath] = { sha: `new-${writes.length}`, content: Buffer.from(payload.content, 'base64').toString() };
      return reply(200, { content: { sha: files[filePath].sha } });
    });
    await admin.goto(optimized.url + '/admin/', { waitUntil: 'load' });
    await admin.waitForFunction(() => document.querySelector('#cv-summary').value.includes('第二行')).catch(async error => {
      console.error(await admin.$eval('#publisher-auth-status', el => el.textContent), errors);
      throw error;
    });
    assert.equal(await admin.$eval('.edu-institution', el => el.value), cvFixture.cv.sections['教育经历'][0].institution);
    assert.equal(await admin.$('#injected'), null);
    assert.equal(await admin.$('#unsafe-user'), null);
    assert.equal(await admin.$eval('#input-github-token', el => el.tagName), 'TEXTAREA');
    assert.equal(await admin.$eval('#input-github-token', el => el.autocomplete), 'off');
    for (let i = 1; i <= 2; i++) {
      await admin.$eval('#cms-cv-form', el => el.requestSubmit());
      await admin.waitForFunction(() => !document.querySelector('#cv-submit-btn').disabled);
      assert.equal(writes.length, i, 'Consecutive saves must use the updated SHA');
    }
    const savedCv = yaml.load(files['_data/cv.yml'].content, { schema: yaml.JSON_SCHEMA });
    assert.equal(savedCv.cv.summary, cvFixture.cv.summary);
    assert.equal(savedCv.cv.website, cvFixture.cv.website);
    assert.deepEqual(savedCv.cv.sections['其他'], cvFixture.cv.sections['其他']);
    await admin.waitForFunction(() => !document.querySelector('#travel-editor-fields').disabled);
    await admin.$eval('#travel-entry-summary', el => { el.value = '新旅行'; });
    await admin.$eval('#travel-entry-dest', el => { el.value = '成都'; });
    await admin.$eval('#travel-entry-dates', el => { el.value = '2026-09-05'; });
    await admin.$eval('#cms-travel-form', el => el.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await admin.waitForFunction(() => !document.querySelector('#travel-submit-btn').disabled);
    assert.equal(writes.length, 3);
    const savedTravel = yaml.load(files['_data/travel.yml'].content, { schema: yaml.JSON_SCHEMA });
    assert.equal(savedTravel.entries.length, 2);
    assert.deepEqual(savedTravel.entries[1], originalTravel.entries[0]);
    assert.equal(savedTravel.custom, originalTravel.custom);
    assert.equal(savedTravel.password, originalTravel.password);
    // Edit an existing moment visually, add/reorder/remove photos, and preserve identity.
    await admin.click('[data-publisher-tab="travel"]');
    await admin.click('#travel-management-list .moment-edit');
    const firstId = savedTravel.entries[0].id;
    await admin.$eval('#travel-entry-summary', el => { el.value = '修改后的文案'; el.dispatchEvent(new Event('input')); });
    await admin.$eval('#travel-entry-dest', el => { el.value = ''; el.dispatchEvent(new Event('input')); });
    const upload = await admin.$('#travel-photos-input');
    await upload.uploadFile(path.resolve('assets/img/profile.jpg'), path.resolve('assets/img/wechat-qr.jpg'));
    assert.equal(await admin.$$eval('.moments-photo-tile', els => els.length), 2);
    const beforeOrder = await admin.$$eval('.moments-photo-tile img', els => els.map(el => el.src));
    await admin.click('[aria-label="向后移动 1"]');
    assert.deepEqual(await admin.$$eval('.moments-photo-tile img', els => els.map(el => el.src)), beforeOrder.toReversed());
    await admin.click('[aria-label="移除照片 1"]');
    assert.equal(await admin.$$eval('.moments-photo-tile', els => els.length), 1);
    assert.ok((await admin.$eval('#travel-live-preview', el => el.textContent)).includes('修改后的文案'));
    await admin.$eval('#cms-travel-form', el => el.requestSubmit());
    await admin.waitForFunction(() => !document.querySelector('#travel-submit-btn').disabled);
    assert.equal(writes.length, 4, 'Original upload succeeds but failed thumbnail leaves metadata untouched');
    assert.ok((await admin.$eval('#travel-manager-status', el => el.textContent)).includes('未能保存'));
    assert.equal(await admin.$$eval('.moments-photo-tile', els => els.length), 1);
    await admin.$eval('#cms-travel-form', el => el.requestSubmit());
    await admin.waitForFunction(() => !document.querySelector('#travel-submit-btn').disabled);
    assert.equal(writes.length, 6, 'Retry adds the thumbnail and metadata without duplicating the original');
    const photoWrites = writes.filter(write => write.filePath.startsWith('assets/img/'));
    assert.equal(photoWrites.length, 2);
    const thumbnailWrite = photoWrites.find(write => write.filePath.endsWith('.thumb.webp'));
    assert.ok(thumbnailWrite, 'Browser generated WebP');
    const thumbnailBytes = Buffer.from(thumbnailWrite.payload.content, 'base64');
    assert.equal(thumbnailBytes.toString('ascii', 8, 12), 'WEBP');
    assert.ok(thumbnailBytes.length < Buffer.from(photoWrites[0].payload.content, 'base64').length);
    assert.equal(await admin.evaluate(() => window.TravelImages.createThumbnail(new Blob(['GIF89a'], { type: 'image/gif' }))), null, 'GIF animation stays intact');
    const editedTravel = yaml.load(files['_data/travel.yml'].content, { schema: yaml.JSON_SCHEMA });
    assert.equal(editedTravel.entries.length, 2);
    assert.equal(editedTravel.entries[0].id, firstId);
    assert.equal(editedTravel.entries[0].text, '修改后的文案');
    assert.equal(editedTravel.entries[0].location, '');
    assert.equal(editedTravel.entries[0].photos.length, 1);
    assert.ok(editedTravel.entries[0].photos[0].thumbnail.endsWith('.thumb.webp'));
    assert.ok(editedTravel.entries[0].photos[0].file.endsWith('.jpg'));
    assert.deepEqual(editedTravel.entries[1], originalTravel.entries[0]);
    // Newly published photos can be previewed before Pages deploys them.
    await admin.$eval('#travel-management-list .travel-photo', el => el.scrollIntoView({ behavior: 'instant', block: 'center' }));
    await admin.click('#travel-management-list .travel-photo');
    assert.equal(await admin.$eval('.moments-photo-dialog', el => el.open), true);
    await admin.click('.moments-photo-dialog button');
    await admin.setViewport({ width: 390, height: 844 });
    assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await admin.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await admin.screenshot({ path: path.join(artifacts, 'moments-admin-mobile.png'), fullPage: true });
    await admin.setViewport({ width: 1280, height: 1000 });
    await admin.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await admin.screenshot({ path: path.join(artifacts, 'moments-admin-desktop.png'), fullPage: true });
    // A remote update cannot be overwritten; the draft survives until the user refreshes.
    await admin.click('#travel-management-list .moment-edit');
    await admin.$eval('#travel-entry-summary', el => { el.value = '冲突时保留的草稿'; el.dispatchEvent(new Event('input')); });
    files['_data/travel.yml'].sha = 'remote-change';
    await admin.$eval('#cms-travel-form', el => el.requestSubmit());
    await admin.waitForFunction(() => !document.querySelector('#travel-submit-btn').disabled);
    assert.equal(writes.length, 6);
    assert.equal(await admin.$eval('#travel-entry-summary', el => el.value), '冲突时保留的草稿');
    assert.ok((await admin.$eval('#travel-manager-status', el => el.textContent)).includes('另一处更新'));
    admin.on('dialog', dialog => dialog.accept());
    await admin.$eval('#travel-refresh-btn', el => el.click());
    await admin.waitForFunction(() => document.querySelector('#travel-manager-status').textContent.startsWith('已读取') && !document.querySelector('#travel-editor-fields').disabled);
    // Deleting a post does not delete shared image files or other posts.
    await admin.$eval('#travel-management-list .moment-delete', el => el.scrollIntoView({ behavior: 'instant', block: 'center' }));
    await admin.$eval('#travel-management-list .moment-delete', el => el.click());
    await admin.waitForFunction(() => document.querySelector('#travel-manager-status').textContent.includes('动态已删除'));
    assert.equal(writes.length, 7);
    assert.equal(yaml.load(files['_data/travel.yml'].content).entries.length, 1);
    assert.equal(writes.filter(write => write.filePath.startsWith('assets/img/')).length, 2);
    failTravelRead = true;
    await admin.$eval('#travel-entry-summary', el => { el.value = '读取失败'; el.dispatchEvent(new Event('input')); });
    await admin.$eval('#cms-travel-form', el => el.requestSubmit());
    await admin.waitForFunction(() => !document.querySelector('#travel-submit-btn').disabled);
    assert.equal(writes.length, 7, 'A failed travel read must never overwrite the document');
    // Clear the local test draft before closing the page.
    await admin.$eval('#travel-cancel-btn', el => el.click());
    await admin.close();
    console.log('PASS CMS credentials, moment CRUD, photo previews/reorder/remove, mobile layout, conflict and failed-read protection');
    assert.deepEqual(errors, [], 'Unexpected runtime errors during interaction');
  } finally {
    if (browser) await browser.close();
    optimized.server.close(); baseline?.server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
