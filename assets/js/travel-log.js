(() => {
  const root = document.querySelector("[data-travel-log]");
  if (!root) return;

  const gate = document.getElementById("travel-gate");
  const journal = document.getElementById("travel-journal");
  const form = document.getElementById("travel-unlock-form");
  const passwordInput = document.getElementById("travel-password");
  const passwordToggle = document.getElementById("travel-password-toggle");
  const unlockButton = document.getElementById("travel-unlock-button");
  const lockButton = document.getElementById("travel-lock-button");
  const status = document.getElementById("travel-gate-status");
  const entryGrid = document.getElementById("travel-entry-grid");
  const emptyState = document.getElementById("travel-journal-empty");
  const dataNode = document.getElementById("travel-log-data");
  const lightbox = document.getElementById("travel-lightbox");
  const lightboxImage = document.getElementById("travel-lightbox-image");
  const lightboxCaption = document.getElementById("travel-lightbox-caption");
  const lightboxClose = document.getElementById("travel-lightbox-close");
  const expectedPassword = root.dataset.password || "";
  const baseUrl = (root.dataset.baseurl || "").replace(/\/$/, "");
  let entries = [];
  let lightboxTrigger = null;

  try {
    entries = JSON.parse(dataNode?.textContent || "[]");
    if (!Array.isArray(entries)) entries = [];
  } catch (error) {
    console.error("Travel journal data is not valid JSON", error);
    entries = [];
  }

  const openLightbox = (source, alt, caption, trigger) => {
    if (!source) return;
    lightboxTrigger = trigger;
    lightboxImage.src = source;
    lightboxImage.alt = alt;
    lightboxCaption.textContent = caption;
    lightboxCaption.hidden = !caption;
    lightbox.hidden = false;
    document.body.classList.add("travel-lightbox-open");
    lightboxClose.focus();
  };

  const closeLightbox = () => {
    if (lightbox.hidden) return;
    lightbox.hidden = true;
    lightboxImage.removeAttribute("src");
    lightboxCaption.textContent = "";
    document.body.classList.remove("travel-lightbox-open");
    lightboxTrigger?.focus();
    lightboxTrigger = null;
  };

  const renderEntry = entry => window.TravelData.render(entry, {
    author: root.dataset.author, avatar: root.dataset.avatar, baseUrl, onPhoto: openLightbox,
  });

  const releaseDecryptedContent = () => {
    closeLightbox();
    entryGrid.replaceChildren();
  };

  const showJournal = () => {
    const sortedEntries = [...entries].sort((left, right) => window.TravelData.sortKey(right).localeCompare(window.TravelData.sortKey(left)));
    entryGrid.replaceChildren(...sortedEntries.map((entry) => renderEntry(entry)));
    emptyState.hidden = sortedEntries.length > 0;
    gate.hidden = true;
    journal.hidden = false;
    // Reveal first, then prioritize only photos actually visible in the viewport.
    let firstVisible = true;
    entryGrid.querySelectorAll('.travel-photo__image').forEach(image => {
      const bounds = image.getBoundingClientRect();
      if (bounds.top < window.innerHeight && bounds.bottom > 0) {
        image.loading = 'eager';
        if (firstVisible) image.fetchPriority = 'high';
        firstVisible = false;
      }
    });
    lockButton.focus({ preventScroll: true });
  };

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const password = passwordInput.value;
    if (!password) {
      setStatus(root.dataset.passwordRequired, true);
      passwordInput.focus();
      return;
    }
    if (!expectedPassword) {
      setStatus(root.dataset.configMissing, true);
      return;
    }

    unlockButton.disabled = true;
    root.classList.add("is-unlocking");
    setStatus(root.dataset.unlocking);
    window.setTimeout(() => {
      if (password === expectedPassword) {
        passwordInput.value = "";
        setStatus("");
        showJournal();
      } else {
        passwordInput.value = "";
        setStatus(root.dataset.wrongPassword, true);
        passwordInput.focus();
      }
      unlockButton.disabled = false;
      root.classList.remove("is-unlocking");
    }, 80);
  });

  passwordToggle.addEventListener("click", () => {
    const shouldShow = passwordInput.type === "password";
    passwordInput.type = shouldShow ? "text" : "password";
    passwordToggle.setAttribute("aria-pressed", String(shouldShow));
    passwordToggle.setAttribute("aria-label", shouldShow ? root.dataset.hidePassword : root.dataset.showPassword);
    const icon = passwordToggle.querySelector("i");
    icon.className = shouldShow ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
    passwordInput.focus();
  });

  lockButton.addEventListener("click", () => {
    releaseDecryptedContent();
    journal.hidden = true;
    gate.hidden = false;
    setStatus("");
    passwordInput.type = "password";
    passwordToggle.setAttribute("aria-pressed", "false");
    passwordToggle.setAttribute("aria-label", root.dataset.showPassword);
    passwordToggle.querySelector("i").className = "fa-solid fa-eye";
    passwordInput.focus();
  });

  lightboxClose.addEventListener("click", closeLightbox);
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) closeLightbox();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !lightbox.hidden) closeLightbox();
  });
  window.addEventListener("beforeunload", releaseDecryptedContent);
})();
