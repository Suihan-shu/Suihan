/* Visual travel editor. A failed/conflicting save keeps the draft intact. */
(() => {
  const FILE = '_data/travel.yml';
  function create({ cms, app, notify, onSaved }) {
    const root = document.getElementById('travel-manager');
    const $ = id => document.getElementById(id);
    const { normalize, render, resolvePhoto, today, sortKey, updateEntry } = window.TravelData;
    const { parseTravel, dump } = window.CMSData;
    const form = $('cms-travel-form'), fields = $('travel-editor-fields');
    const caption = $('travel-entry-summary'), location = $('travel-entry-dest'), date = $('travel-entry-dates');
    const picker = $('travel-photos-input'), gallery = $('travel-photo-editor'), preview = $('travel-live-preview');
    const list = $('travel-management-list'), status = $('travel-manager-status');
    const savedPreviews = new Map();
    const options = { author: app.dataset.author, avatar: app.dataset.avatar, baseUrl: app.dataset.baseurl };
    options.sourceForPhoto = (photo, thumbnail = false) => savedPreviews.get(window.TravelData.photoPath(photo))
      || (thumbnail ? window.TravelData.resolveThumbnail(photo, options.baseUrl) : resolvePhoto(photo, options.baseUrl));
    let data = null, sha = null, editing = null, photos = [], dirty = false, busy = false, revision = 0;
    const dialog = document.createElement('dialog'); dialog.className = 'moments-photo-dialog';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '关闭照片';
    const largeImage = document.createElement('img'); largeImage.alt = '照片预览';
    dialog.append(close, largeImage); root.append(dialog);
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    options.onPhoto = source => { largeImage.src = source; dialog.showModal(); };
    const message = (text, error = false) => { status.textContent = text; status.classList.toggle('is-error', error); };
    function setBusy(value) {
      busy = value;
      fields.disabled = busy || !data;
      root.querySelectorAll('button').forEach(button => { button.disabled = busy; });
      $('travel-new-btn').disabled = busy || !data;
      $('travel-submit-btn').textContent = editing == null ? '发布动态' : '保存修改';
    }
    const draft = () => ({ text: caption.value, location: location.value, date: date.value,
      photos: photos.map(photo => photo.value) });
    function renderPreview() {
      const value = draft();
      preview.replaceChildren(render({ ...value, text: value.text || (photos.length ? '' : '你写下的文字和照片，会出现在这里。') }, options));
    }
    function releasePhotos() { photos.forEach(photo => { if (photo.previewUrl) URL.revokeObjectURL(photo.previewUrl); }); }
    function resetDraft() {
      releasePhotos(); photos = []; editing = null; dirty = false;
      form.reset(); date.value = today();
      $('travel-editor-title').textContent = '写一条动态'; $('travel-edit-badge').hidden = true;
      $('travel-cancel-btn').textContent = '清空';
      $('travel-submit-btn').textContent = '发布动态';
      renderPhotos();
    }
    function renderPhotos() {
      gallery.replaceChildren();
      photos.forEach((photo, index) => {
        const tile = document.createElement('div'); tile.className = 'moments-photo-tile';
        const image = document.createElement('img'); image.src = photo.previewUrl || options.sourceForPhoto(photo.value);
        image.alt = `第 ${index + 1} 张照片`; image.addEventListener('click', () => options.onPhoto(image.src));
        const tools = document.createElement('div'); tools.className = 'moments-photo-tools';
        [['←', '向前移动', -1], ['→', '向后移动', 1], ['×', '移除照片', 0]].forEach(([text, label, step]) => {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
          button.setAttribute('aria-label', `${label} ${index + 1}`);
          button.disabled = busy || (step !== 0 && (index + step < 0 || index + step >= photos.length));
          button.addEventListener('click', () => {
            if (busy) return;
            if (step) [photos[index], photos[index + step]] = [photos[index + step], photos[index]];
            else { if (photo.previewUrl) URL.revokeObjectURL(photo.previewUrl); photos.splice(index, 1); }
            dirty = true; renderPhotos();
          });
          tools.append(button);
        });
        tile.append(image, tools); gallery.append(tile);
      });
      $('travel-photo-count').textContent = `${photos.length} / 9`;
      renderPreview();
    }
    function renderList() {
      list.replaceChildren();
      $('travel-entry-count').textContent = data?.entries.length || 0;
      $('travel-management-empty').hidden = !data || data.entries.length > 0;
      const entries = (data?.entries || []).map((entry, index) => ({ entry, index })).sort((a, b) => sortKey(b.entry).localeCompare(sortKey(a.entry)));
      entries.forEach(({ entry, index }) => {
        const card = render(entry, options);
        const actions = document.createElement('div'); actions.className = 'moments-record-actions';
        const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = '编辑'; edit.className = 'moment-edit';
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '删除'; remove.className = 'moment-delete';
        edit.disabled = remove.disabled = busy;
        edit.addEventListener('click', () => {
          if (busy || (dirty && !confirm('有尚未保存的内容，放弃后编辑这条动态吗？'))) return;
          resetDraft(); editing = index;
          const value = normalize(entry);
          caption.value = value.text; location.value = value.location; date.value = value.date || today();
          photos = value.photos.map(photo => ({ value: photo }));
          $('travel-editor-title').textContent = '编辑这条动态'; $('travel-edit-badge').hidden = false;
          $('travel-submit-btn').textContent = '保存修改'; $('travel-cancel-btn').textContent = '取消编辑';
          renderPhotos(); form.scrollIntoView({ behavior: 'smooth', block: 'center' }); caption.focus({ preventScroll: true });
        });
        remove.addEventListener('click', () => removeEntry(index));
        actions.append(edit, remove); card.querySelector('.moment-card__body').append(actions); list.append(card);
      });
    }
    async function readCurrent() {
      const file = await cms.getFile(FILE);
      if (file.sha !== sha) throw new Error('另一处更新了旅行动态。请保留当前文案，刷新列表后再编辑。');
      return file;
    }
    async function load() {
      if (busy || (dirty && !confirm('刷新会放弃尚未保存的编辑，继续吗？'))) return;
      const ticket = ++revision; setBusy(true); message('正在读取你的动态…');
      try {
        const file = await cms.getFile(FILE);
        if (ticket !== revision) return;
        const next = parseTravel(file.content);
        if (!next.entries.every(entry => entry && typeof entry === 'object' && !Array.isArray(entry))) throw new Error('存在无法读取的动态，请检查原文件。');
        data = next; sha = file.sha; resetDraft(); renderList(); message(`已读取 ${data.entries.length} 条动态`);
      } catch (error) { if (ticket === revision) { data = null; message(`读取失败：${error.message} 点击“刷新列表”重试。`, true); } }
      finally { if (ticket === revision) setBusy(false); }
    }
    async function save() {
      if (busy || !data) return;
      if (!caption.value.trim() && !photos.length) { message('写一点文案，或添加至少一张照片。', true); caption.focus(); return; }
      setBusy(true); message('正在保存动态…');
      try {
        await readCurrent();
        for (let index = 0; index < photos.length; index++) {
          const photo = photos[index];
          if (!photo.file) continue;
          message(`正在上传照片 ${index + 1} / ${photos.length}…`);
          // Keep stable paths and completed steps so a partial upload can be retried.
          if (!photo.upload) {
            const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' })[photo.file.type];
            const path = `assets/img/travel/${crypto.randomUUID()}.${extension}`;
            const thumbnail = await window.TravelImages.createThumbnail(photo.file);
            photo.upload = { path, thumbnail, thumbnailPath: thumbnail ? `${path}.thumb.${thumbnail.type === 'image/webp' ? 'webp' : 'png'}` : null };
          }
          const upload = photo.upload;
          if (!upload.originalDone) {
            await cms.uploadBinary(upload.path, photo.file, 'Add travel photo');
            upload.originalDone = true;
          }
          if (upload.thumbnail && !upload.thumbnailDone) {
            await cms.uploadBinary(upload.thumbnailPath, upload.thumbnail, 'Add travel thumbnail');
            upload.thumbnailDone = true;
          }
          photo.value = upload.thumbnail ? { file: '/' + upload.path, thumbnail: '/' + upload.thumbnailPath } : '/' + upload.path;
          photo.file = null; photo.upload = null;
        }
        await readCurrent();
        const updated = updateEntry(editing == null ? null : data.entries[editing], draft());
        const entries = [...data.entries];
        if (editing == null) entries.unshift(updated); else entries[editing] = updated;
        const next = { ...data, entries };
        const result = await cms.putFile(FILE, dump(next), editing == null ? 'Add travel moment' : 'Edit travel moment', sha);
        data = next; sha = result.content.sha;
        photos.forEach(photo => { if (photo.previewUrl) { savedPreviews.set(window.TravelData.photoPath(photo.value), photo.previewUrl); photo.previewUrl = null; } });
        resetDraft(); renderList();
        message('保存成功。网站正在更新，完成后就能看到这条动态。'); notify('动态已保存', 'success'); onSaved();
      } catch (error) { message(`未能保存：${error.message} 你的编辑仍在这里。`, true); }
      finally { setBusy(false); renderPhotos(); }
    }
    async function removeEntry(index) {
      if (busy || !data) return;
      if (dirty) { message('请先保存或取消当前编辑，再删除动态。', true); return; }
      if (!confirm('确定删除这条动态吗？照片文件仍会保留。')) return;
      setBusy(true); message('正在删除动态…');
      try {
        await readCurrent();
        const next = { ...data, entries: data.entries.filter((_, i) => i !== index) };
        const result = await cms.putFile(FILE, dump(next), 'Delete travel moment', sha);
        data = next; sha = result.content.sha; resetDraft(); renderList();
        message('动态已删除，网站正在更新。'); onSaved();
      } catch (error) { message(`未能删除：${error.message}`, true); }
      finally { setBusy(false); }
    }
    form.addEventListener('submit', event => { event.preventDefault(); save(); });
    [caption, location, date].forEach(input => input.addEventListener('input', () => { dirty = true; renderPreview(); }));
    picker.addEventListener('change', () => {
      if (busy) return;
      const selected = Array.from(picker.files); picker.value = '';
      if (photos.length + selected.length > 9) { message('一条动态最多添加 9 张照片，请减少本次选择。', true); return; }
      if (selected.some(file => !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 20 * 1024 * 1024)) {
        message('请选择 20 MB 以内的 JPG、PNG、WebP 或 GIF 照片。', true); return;
      }
      selected.forEach(file => { const previewUrl = URL.createObjectURL(file); photos.push({ value: previewUrl, file, previewUrl }); });
      dirty = true; message('照片已加入草稿，可以预览、排序或移除。'); renderPhotos();
    });
    [$('travel-new-btn'), $('travel-cancel-btn')].forEach(button => button.addEventListener('click', () => {
      if (busy || (dirty && !confirm('放弃尚未保存的编辑吗？'))) return;
      resetDraft(); message(''); caption.focus();
    }));
    $('travel-refresh-btn').addEventListener('click', load);
    window.addEventListener('beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
    resetDraft();
    return { load, isBusy: () => busy, reset() {
      savedPreviews.forEach(url => URL.revokeObjectURL(url)); savedPreviews.clear(); dialog.close();
      revision++; data = null; sha = null; busy = false; resetDraft(); renderList(); setBusy(false); message('');
    } };
  }
  window.TravelCMS = { create };
})();
