/* Shared travel formats and card rendering for the journal and its editor. */
(() => {
  const localized = value => value == null ? '' : typeof value === 'object'
    ? String(value.zh ?? Object.values(value).find(item => typeof item === 'string') ?? '') : String(value);
  const photoPath = photo => typeof photo === 'string' ? photo : photo?.file || photo?.src || photo?.url || '';
  const normalize = (entry = {}) => {
    const title = localized(entry.title);
    const body = localized(entry.text ?? entry.summary);
    const photos = Array.isArray(entry.photos) ? [...entry.photos] : [];
    if (entry.cover_image && !photos.some(photo => photoPath(photo) === entry.cover_image)) photos.unshift(entry.cover_image);
    return { text: [title, body].filter(Boolean).join('\n'), location: localized(entry.location ?? entry.destination),
      date: String(entry.date || entry.date_range || ''), time: String(entry.time || ''), photos };
  };
  const today = () => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const sortKey = entry => {
    const match = /^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/.exec(String(entry.date || entry.date_range || entry.created_at || ''));
    return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')} ${entry.time || '00:00'}` : '';
  };
  const resolvePhoto = (photo, baseUrl = '') => {
    const value = photoPath(photo);
    if (!value) return '';
    try {
      const relative = value.startsWith('/assets/') ? baseUrl.replace(/\/$/, '') + value : value;
      const url = new URL(relative, document.baseURI);
      return ['http:', 'https:', 'blob:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  };
  const resolveThumbnail = (photo, baseUrl = '') => resolvePhoto(photo?.thumbnail, baseUrl) || resolvePhoto(photo, baseUrl);
  const updateEntry = (original, draft) => {
    const now = new Date();
    const result = { ...original, id: original?.id || `moment-${crypto.randomUUID()}`,
      text: draft.text.trim(), location: draft.location.trim(), date: draft.date.trim() || today(),
      photos: draft.photos, updated_at: now.toISOString() };
    if (!original) {
      result.created_at = now.toISOString();
      result.time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }
    // Legacy headings and covers are already represented in the editable caption/photos.
    for (const key of ['title', 'summary', 'destination', 'date_range', 'cover_image']) delete result[key];
    return result;
  };
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };
  const render = (entry, { author = 'Suihan-shu', avatar = '', baseUrl = '', onPhoto, sourceForPhoto } = {}) => {
    const data = normalize(entry);
    const card = element('article', 'travel-entry moment-card');
    const portrait = element('img', 'moment-card__avatar');
    portrait.alt = ''; portrait.width = 42; portrait.height = 42;
    if (avatar) portrait.src = avatar;
    const content = element('div', 'moment-card__body');
    content.append(element('p', 'moment-card__author', author));
    if (data.text) content.append(element('p', 'travel-entry__text', data.text));
    if (data.photos.length) {
      const grid = element('div', 'travel-photo-grid');
      grid.dataset.count = String(data.photos.length);
      data.photos.forEach((photo, index) => {
        const button = element('button', 'travel-photo'); button.type = 'button';
        button.setAttribute('aria-label', `查看第 ${index + 1} 张照片`);
        const source = sourceForPhoto ? sourceForPhoto(photo) : resolvePhoto(photo, baseUrl);
        const thumbnail = sourceForPhoto ? sourceForPhoto(photo, true) : resolveThumbnail(photo, baseUrl);
        const image = element('img', 'travel-photo__image');
        image.alt = localized(photo?.alt) || `旅行照片 ${index + 1}`;
        image.loading = 'lazy'; image.decoding = 'async';
        if (thumbnail) image.src = thumbnail;
        const unavailable = () => { button.disabled = true; button.classList.add('travel-photo--error'); button.replaceChildren(element('span', '', '照片暂时无法显示')); };
        image.addEventListener('error', () => {
          if (source && image.src !== source) { image.src = source; return; }
          unavailable();
        });
        button.append(image);
        if (!source) unavailable();
        button.addEventListener('click', () => onPhoto?.(source, image.alt, localized(photo?.caption), button));
        grid.append(button);
      });
      content.append(grid);
    }
    if (data.location) {
      const location = element('p', 'travel-entry__location');
      const icon = element('i', 'fa-solid fa-location-dot'); icon.setAttribute('aria-hidden', 'true');
      location.append(icon, document.createTextNode(' ' + data.location)); content.append(location);
    }
    const date = element('p', 'travel-entry__date', [data.date, data.time].filter(Boolean).join(' · '));
    content.append(date);
    card.append(portrait, content);
    return card;
  };
  window.TravelData = { localized, photoPath, normalize, today, sortKey, resolvePhoto, resolveThumbnail, updateEntry, render };
})();
