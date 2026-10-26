// Injected into every top-level ZTM page shown by the app. It runs before the page's
// own scripts, so it must not assume that <head> or <body> exist yet.
(() => {
  const AUTHENTICATION_ROUTES = __ZTM_AUTH_ROUTES__;
  const MEDIA_STATE_MESSAGE = "ztm-desktop-media-state";
  const MEDIA_READY_MESSAGE = "ztm-desktop-media-ready";
  const MEDIA_RESTORE_MESSAGE = "ztm-desktop-media-restore";
  const MEDIA_CAPTURE_MESSAGE = "ztm-desktop-media-capture";
  const MEDIA_PAUSE_MESSAGE = "ztm-desktop-media-pause";
  const MEDIA_EVENTS = ["timeupdate", "ratechange", "play", "pause", "ended"];

  function applyMediaSession(media, session) {
    if (!session || session.mediaTime == null) return;
    const apply = () => {
      media.currentTime = session.mediaTime;
      if (session.playbackRate != null)
        media.playbackRate = session.playbackRate;
      if (session.mediaPaused === false) media.play().catch(() => {});
      else if (session.mediaPaused === true) media.pause();
    };
    if (media.readyState >= 1) apply();
    else media.addEventListener("loadedmetadata", apply, { once: true });
  }

  function wireMediaElements(wired, session, onMediaEvent) {
    for (const media of document.querySelectorAll("video, audio")) {
      if (wired.has(media)) continue;
      wired.add(media);
      for (const event of MEDIA_EVENTS) {
        media.addEventListener(event, () => onMediaEvent(media));
      }
      applyMediaSession(media, session);
    }
  }

  function pausePlayingMedia() {
    for (const media of document.querySelectorAll("video, audio")) {
      if (!media.paused) media.pause();
    }
  }

  // Authentication is owned by Teachable and is sensitive to DOM, class, and
  // style changes made before its own scripts initialize. Leave those documents
  // completely untouched; the app customizations only apply after sign-in.
  const isAuthenticationDocument =
    location.hostname === "sso.teachable.com" ||
    (/^academy\.zerotomastery\.io$/.test(location.hostname) &&
      location.pathname
        .split("/")
        .filter(Boolean)
        .some((segment) => AUTHENTICATION_ROUTES.includes(segment)));
  if (isAuthenticationDocument) return;
  if (window.__ZTM_DESKTOP_ENHANCED__) return;
  window.__ZTM_DESKTOP_ENHANCED__ = true;

  const documentReadyTasks = [];
  let waitingForDocument = false;
  function whenDocumentReady(task) {
    if (document.readyState !== "loading") {
      task();
      return;
    }
    documentReadyTasks.push(task);
    if (waitingForDocument) return;
    waitingForDocument = true;
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        for (const readyTask of documentReadyTasks.splice(0)) readyTask();
      },
      { once: true },
    );
  }

  // The all-frame initialization script lets cross-origin player frames report
  // native <video>/<audio> progress without granting them access to Tauri IPC.
  if (window.top !== window) {
    const wiredMedia = new WeakSet();
    let pendingRestore = null;
    let activeMedia = null;

    function reportMedia(media) {
      activeMedia = media;
      window.top.postMessage(
        {
          type: MEDIA_STATE_MESSAGE,
          mediaTime: Number.isFinite(media.currentTime)
            ? media.currentTime
            : null,
          mediaPaused: media.paused,
          playbackRate: Number.isFinite(media.playbackRate)
            ? media.playbackRate
            : null,
        },
        "*",
      );
    }

    function wireFrameMedia() {
      wireMediaElements(wiredMedia, pendingRestore, reportMedia);
    }

    window.addEventListener("message", (event) => {
      if (event.source !== window.top) return;
      if (event.data?.type === MEDIA_PAUSE_MESSAGE) {
        wireFrameMedia();
        pausePlayingMedia();
        return;
      }
      if (event.data?.type === MEDIA_CAPTURE_MESSAGE) {
        wireFrameMedia();
        const media = activeMedia || document.querySelector("video, audio");
        if (media) reportMedia(media);
        return;
      }
      if (event.data?.type !== MEDIA_RESTORE_MESSAGE) return;
      pendingRestore = event.data.session;
      wireFrameMedia();
    });
    whenDocumentReady(wireFrameMedia);
    new MutationObserver(wireFrameMedia).observe(document, {
      childList: true,
      subtree: true,
    });
    window.top.postMessage({ type: MEDIA_READY_MESSAGE }, "*");
    return;
  }
  const isAcademyHost = /(^|\.)zerotomastery\.io$/.test(location.hostname);
  if (!isAcademyHost) return;

  window.__ZTM_DESKTOP_PAUSE__ = () => {
    pausePlayingMedia();
    for (const frame of document.querySelectorAll("iframe")) {
      frame.contentWindow?.postMessage({ type: MEDIA_PAUSE_MESSAGE }, "*");
    }
  };

  const SITE_NAVIGATION = ".ztm-sidebar, .ztm-sidebar-links";
  const HOME_LOGO = 'img[alt="school logo"], img[src*="ztm-logo-academy.svg"]';
  const COURSE_BACK = 'a.nav-icon-back[aria-label="Back to course curriculum"]';
  const STYLE_ID = "ztm-desktop-app-style";
  const THEME_KEY = __ZTM_THEME_STORAGE_KEY__;
  const isFullscreenView = window.__ZTM_DESKTOP_VIEW__ === "fullscreen";
  function initialAppTheme() {
    try {
      const saved = window.sessionStorage?.getItem(THEME_KEY);
      if (saved === "dark" || saved === "light") return saved;
    } catch {}
    if (window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return window.__ZTM_DESKTOP_THEME__ === "dark" ? "dark" : "light";
  }
  let appTheme = initialAppTheme();
  let paletteScheduled = false;

  function isCourseOverview() {
    return /^\/courses\/(?:enrolled\/)?[^/]+\/?$/.test(location.pathname);
  }

  function isAcademyCatalog() {
    return (
      isAcademyHost &&
      (location.pathname === "/" ||
        /^\/courses\/category\/[^/]+\/?$/.test(location.pathname))
    );
  }

  function shouldNormalizePalette() {
    return isAcademyCatalog() || isCourseOverview();
  }

  function rgbChannels(value) {
    const match = value.match(
      /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/,
    );
    if (match?.[4] === "0") return null;
    return match ? match.slice(1, 4).map(Number) : null;
  }

  function neutralRgb(value, minimum, maximum) {
    const channels = rgbChannels(value);
    if (!channels) return false;
    return (
      channels.every((channel) => channel >= minimum && channel <= maximum) &&
      Math.max(...channels) - Math.min(...channels) <= 18
    );
  }

  function darkRgb(value) {
    const channels = rgbChannels(value);
    return Boolean(channels?.every((channel) => channel <= 80));
  }

  function darkNeutralRgb(value) {
    const channels = rgbChannels(value);
    return Boolean(
      channels?.every((channel) => channel <= 80) &&
      Math.max(...channels) - Math.min(...channels) <= 18,
    );
  }

  function lightRgb(value) {
    const channels = rgbChannels(value);
    return Boolean(channels?.slice(0, 3).every((channel) => channel >= 175));
  }

  function hasDarkBackdrop(element) {
    for (let current = element; current; current = current.parentElement) {
      if (current.dataset.ztmLightSurface === "true") return true;
      const background = getComputedStyle(current).backgroundColor;
      if (rgbChannels(background)) return darkNeutralRgb(background);
    }
    return false;
  }

  function normalizeCourseOverview() {
    paletteScheduled = false;
    if (!document.body || typeof getComputedStyle !== "function") return;
    const elements = [document.body, ...document.body.querySelectorAll("*")];
    delete document.documentElement.dataset.ztmDarkPalette;
    delete document.documentElement.dataset.ztmLightPalette;
    for (const element of elements) {
      delete element.dataset.ztmDarkSurface;
      delete element.dataset.ztmDarkText;
      delete element.dataset.ztmLightSurface;
      delete element.dataset.ztmLightText;
    }
    if (!shouldNormalizePalette()) {
      return;
    }

    document.documentElement.dataset[
      appTheme === "dark" ? "ztmDarkPalette" : "ztmLightPalette"
    ] = "true";

    for (const element of elements) {
      if (element.closest("svg, picture, video, canvas")) continue;
      const computed = getComputedStyle(element);
      if (appTheme === "dark") {
        if (neutralRgb(computed.backgroundColor, 215, 255)) {
          element.dataset.ztmDarkSurface = "true";
        }
        if (darkRgb(computed.color)) {
          element.dataset.ztmDarkText = "true";
        }
      } else {
        const darkBackdrop = hasDarkBackdrop(element);
        if (darkNeutralRgb(computed.backgroundColor)) {
          element.dataset.ztmLightSurface = "true";
        }
        if (lightRgb(computed.color) && darkBackdrop) {
          element.dataset.ztmLightText = "true";
        }
      }
    }
  }

  function scheduleCoursePalette() {
    if (paletteScheduled || !window.requestAnimationFrame) return;
    paletteScheduled = true;
    window.requestAnimationFrame(normalizeCourseOverview);
  }

  function injectedCss() {
    return `:root { color-scheme: ${appTheme} !important; }
      :root[data-ztm-dark-palette="true"],
      :root[data-ztm-dark-palette="true"] body {
        background-color: #181818 !important;
        color: #f5f5f5 !important;
      }
      :root[data-theme="dark"] [data-ztm-dark-surface="true"] {
        background-color: #181818 !important;
        border-color: #363636 !important;
      }
      :root[data-theme="dark"] [data-ztm-dark-text="true"] {
        color: #f5f5f5 !important;
      }
      :root[data-ztm-light-palette="true"],
      :root[data-ztm-light-palette="true"] body {
        background-color: #f8fafc !important;
        color: #111827 !important;
      }
      :root[data-theme="light"] [data-ztm-light-surface="true"] {
        background-color: #ffffff !important;
        border-color: #d1d5db !important;
      }
      :root[data-theme="light"] [data-ztm-light-text="true"] {
        color: #111827 !important;
      }`;
  }

  function applyAppTheme(theme) {
    appTheme = theme === "dark" ? "dark" : "light";
    window.__ZTM_DESKTOP_THEME__ = appTheme;
    try {
      window.sessionStorage?.setItem(THEME_KEY, appTheme);
    } catch {}
    const root = document.documentElement;
    if (!root) return;
    if (root.classList.contains("dark") !== (appTheme === "dark")) {
      root.classList.toggle("dark", appTheme === "dark");
    }
    if (root.classList.contains("light") !== (appTheme === "light")) {
      root.classList.toggle("light", appTheme === "light");
    }
    if (root.dataset.theme !== appTheme) root.dataset.theme = appTheme;
    if (root.style.colorScheme !== appTheme) root.style.colorScheme = appTheme;
    const style = document.getElementById(STYLE_ID);
    if (style && style.textContent !== injectedCss()) {
      style.textContent = injectedCss();
    }
    scheduleCoursePalette();
  }
  window.__ZTM_DESKTOP_SET_THEME__ = applyAppTheme;

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const root = document.head || document.documentElement;
    if (!root) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = injectedCss();
    root.appendChild(style);
  }

  applyAppTheme(appTheme);
  addStyle();
  whenDocumentReady(() => {
    applyAppTheme(appTheme);
    addStyle();
  });

  function configureLessonNav() {
    for (const logo of document.querySelectorAll(HOME_LOGO)) {
      const link = logo.closest("a");
      if (!link) continue;
      const nav = logo.closest("div.nav") || link?.parentElement;
      if (!isFullscreenView) {
        nav?.remove();
        continue;
      }

      // The promoted window has no app chrome. Turn Academy's home link into a
      // return-to-app control so it cannot strand the user on another route.
      link.removeAttribute("href");
      link.dataset.ztmFullscreenExit = "true";
      link.setAttribute("role", "button");
      link.setAttribute("title", "Return to ZTM Desktop");
    }

    if (isFullscreenView) {
      for (const link of document.querySelectorAll(COURSE_BACK)) {
        link.removeAttribute("href");
        link.dataset.ztmFullscreenExit = "true";
        link.setAttribute("title", "Return to ZTM Desktop");
      }
    }
  }
  function removeSiteNavigation() {
    for (const navigation of document.querySelectorAll(SITE_NAVIGATION)) {
      (navigation.closest?.(".ztm-sidebar") || navigation).remove();
    }
  }
  function syncDocument() {
    applyAppTheme(appTheme);
    removeSiteNavigation();
    configureLessonNav();
    scheduleCoursePalette();
  }
  syncDocument();
  const navObserver = new MutationObserver(syncDocument);
  // Initialization scripts run before <html> exists. Observing Document keeps
  // this active from document-start and catches both initial markup and SPA swaps.
  navObserver.observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "data-theme", "style"],
  });

  const LEGACY_SESSION_KEY = "ztm-desktop-app-session";
  const COURSE_PROGRESS_KEY = "ztm-desktop-course-progress-v2";
  const ACTIVE_COURSE_KEY = "ztm-desktop-active-course";
  const wiredMedia = new WeakSet();
  let activeMedia = null;
  let framedMedia = null;
  let restore = null;
  let redirectingToProgress = false;
  let fullscreenExit = null;
  let finishFullscreenExit = null;

  function courseKey(url = location.href) {
    try {
      const path = new URL(url).pathname;
      const course = path.match(/^\/courses\/(?:enrolled\/)?([^/]+)/);
      if (course) return `course:${course[1]}`;
      const product = path.match(/^\/p\/([^/]+)/);
      return product ? `product:${product[1]}` : null;
    } catch {
      return null;
    }
  }

  function isCourseEntryPage() {
    return /^\/(?:courses\/(?:enrolled\/)?[^/]+|p\/[^/]+)\/?$/.test(
      location.pathname,
    );
  }

  function readCourseProgress() {
    try {
      return JSON.parse(localStorage.getItem(COURSE_PROGRESS_KEY)) || {};
    } catch {
      return {};
    }
  }

  const locationCourseKey = courseKey();
  let activeCourseKey = locationCourseKey;
  try {
    const rememberedCourse = sessionStorage.getItem(ACTIVE_COURSE_KEY);
    const isLessonPage = /\/(?:lectures|lessons)\//.test(location.pathname);
    if (isLessonPage && rememberedCourse) activeCourseKey = rememberedCourse;
    if (activeCourseKey) {
      sessionStorage.setItem(ACTIVE_COURSE_KEY, activeCourseKey);
    }
  } catch {}

  function validSession(session) {
    if (!session || typeof session.url !== "string") return false;
    try {
      const url = new URL(session.url);
      return (
        url.protocol === "https:" &&
        /(^|\.)zerotomastery\.io$/.test(url.hostname)
      );
    } catch {
      return false;
    }
  }

  function durableSession() {
    const progress = readCourseProgress();
    const saved = activeCourseKey ? progress[activeCourseKey] : null;
    if (validSession(saved)) return saved;
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_SESSION_KEY));
      return validSession(legacy) ? legacy : null;
    } catch {
      return null;
    }
  }

  const transferredRestore = window.__ZTM_DESKTOP_RESTORE__;
  const savedProgress = durableSession();
  if (
    !transferredRestore &&
    savedProgress &&
    isCourseEntryPage() &&
    savedProgress?.url !== location.href &&
    courseKey(savedProgress?.url) === locationCourseKey
  ) {
    redirectingToProgress = true;
    location.replace(savedProgress.url);
  }

  function captureSession() {
    const media =
      activeMedia ||
      (framedMedia ? null : document.querySelector("video, audio"));
    const mediaState = media
      ? {
          mediaTime: Number.isFinite(media.currentTime)
            ? media.currentTime
            : null,
          mediaPaused: media.paused,
          playbackRate: Number.isFinite(media.playbackRate)
            ? media.playbackRate
            : null,
        }
      : framedMedia || {
          mediaTime: null,
          mediaPaused: null,
          playbackRate: null,
        };
    return {
      url: location.href,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      ...mediaState,
    };
  }
  window.__ZTM_DESKTOP_CAPTURE_SESSION__ = captureSession;

  function exitFullscreen() {
    if (fullscreenExit) return fullscreenExit;
    const frames = [...document.querySelectorAll("iframe")];
    const invokeExit = () =>
      window.__TAURI_INTERNALS__?.invoke("web_view_fullscreen", {
        fullscreen: false,
        session: captureSession(),
      });
    if (frames.length === 0) return invokeExit();

    // Ask the focused cross-origin player for a synchronous snapshot. Its
    // ordinary timeupdate relay can be behind the actual playback position at
    // the exact moment Escape leaves native fullscreen.
    fullscreenExit = new Promise((resolve, reject) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        finishFullscreenExit = null;
        Promise.resolve(invokeExit()).then(resolve, reject);
      };
      finishFullscreenExit = finish;
      for (const frame of frames) {
        frame.contentWindow?.postMessage({ type: MEDIA_CAPTURE_MESSAGE }, "*");
      }
      window.setTimeout(finish, 100);
    });
    return fullscreenExit;
  }
  // The native window can leave OS fullscreen before a focused cross-origin
  // player delivers Escape to this document. Rust calls this hook while the
  // webview is still alive so its current playback state is captured before
  // the disposable fullscreen window is destroyed.
  window.__ZTM_DESKTOP_EXIT_FULLSCREEN__ = exitFullscreen;

  // Capture before Academy's delegated click handler. In the promoted window,
  // the logo is an exit control; elsewhere this prevents a pre-removal click.
  document.addEventListener(
    "click",
    (event) => {
      const link = event.target?.closest?.("a");
      if (!link) return;
      const isLogoHome =
        Boolean(link.querySelector?.(HOME_LOGO)) &&
        Boolean(link.closest?.("div.nav"));
      const isCourseBack = Boolean(link.matches?.(COURSE_BACK));
      if (!isLogoHome && !(isFullscreenView && isCourseBack)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (isFullscreenView) exitFullscreen()?.catch(() => {});
    },
    true,
  );

  function saveSession() {
    if (redirectingToProgress) return;
    const session = captureSession();
    try {
      localStorage.setItem(LEGACY_SESSION_KEY, JSON.stringify(session));
      const progress = readCourseProgress();
      if (activeCourseKey) progress[activeCourseKey] = session;
      if (locationCourseKey) progress[locationCourseKey] = session;
      localStorage.setItem(COURSE_PROGRESS_KEY, JSON.stringify(progress));
    } catch {}
  }
  window.__ZTM_DESKTOP_SAVE_SESSION__ = saveSession;

  function savedSession() {
    return savedProgress?.url === location.href ? savedProgress : null;
  }

  function resolvedRestore() {
    const saved = savedSession();
    if (!transferredRestore) return saved;
    if (!saved || saved.url !== transferredRestore.url) {
      return transferredRestore;
    }

    // Escape can make the native fullscreen resize fallback arrive before the
    // page's richer IPC payload. Keep its URL, but fill absent media state from
    // the last durable checkpoint written by the fullscreen player frame.
    return {
      ...transferredRestore,
      mediaTime: transferredRestore.mediaTime ?? saved.mediaTime,
      mediaPaused: transferredRestore.mediaPaused ?? saved.mediaPaused,
      playbackRate: transferredRestore.playbackRate ?? saved.playbackRate,
    };
  }

  restore = resolvedRestore();

  function wireTopLevelMedia() {
    wireMediaElements(wiredMedia, restore, (media) => {
      activeMedia = media;
      saveSession();
    });
  }

  function frameForSource(source) {
    return [...document.querySelectorAll("iframe")].find(
      (frame) => frame.contentWindow === source,
    );
  }

  function sendFrameRestore(target) {
    if (!restore || !target) return;
    target.postMessage({ type: MEDIA_RESTORE_MESSAGE, session: restore }, "*");
  }

  window.addEventListener("message", (event) => {
    if (!frameForSource(event.source)) return;
    if (event.data?.type === MEDIA_READY_MESSAGE) {
      sendFrameRestore(event.source);
      return;
    }
    if (event.data?.type !== MEDIA_STATE_MESSAGE) return;
    framedMedia = {
      mediaTime: Number.isFinite(event.data.mediaTime)
        ? event.data.mediaTime
        : null,
      mediaPaused:
        typeof event.data.mediaPaused === "boolean"
          ? event.data.mediaPaused
          : null,
      playbackRate: Number.isFinite(event.data.playbackRate)
        ? event.data.playbackRate
        : null,
    };
    saveSession();
    finishFullscreenExit?.();
  });

  function restoreSession() {
    if (!restore || restore.url !== location.href) return;
    window.scrollTo(restore.scrollX || 0, restore.scrollY || 0);
    wireTopLevelMedia();
    for (const frame of document.querySelectorAll("iframe")) {
      sendFrameRestore(frame.contentWindow);
    }
  }
  whenDocumentReady(() => {
    restoreSession();
    wireTopLevelMedia();
  });
  new MutationObserver(() => {
    wireTopLevelMedia();
    if (restore) {
      for (const frame of document.querySelectorAll("iframe")) {
        sendFrameRestore(frame.contentWindow);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  document.addEventListener("scroll", saveSession, { passive: true });
  window.addEventListener("load", restoreSession);
  window.addEventListener("pagehide", saveSession);

  if (window.__ZTM_DESKTOP_VIEW__ === "embedded") {
    // The embedded page has keyboard focus while it is shown, so the shell's own
    // F11 listener never sees the key.
    window.addEventListener("keydown", (event) => {
      if (event.key !== "F11") return;
      event.preventDefault();
      if (event.repeat) return;
      window.__TAURI_INTERNALS__
        ?.invoke("toggle_fullscreen")
        .catch((error) => console.error("toggle_fullscreen failed", error));
    });
  }

  if (window.__ZTM_DESKTOP_VIEW__ === "fullscreen") {
    // The resize watcher normally handles Escape. This is an additional disposal
    // path for platforms that do not emit a resize when leaving OS fullscreen.
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        exitFullscreen()?.catch(() => {});
      }
    });
  }

  // Observe the top-level document instead of replacing requestFullscreen. Video
  // players commonly request fullscreen from a nested iframe; in that case the
  // top-level fullscreen element is the iframe and this event still fires.
  let fullscreen = false;
  function reportFullscreen(next) {
    if (next === fullscreen) return;
    fullscreen = next;
    const ipc = window.__TAURI_INTERNALS__;
    if (!ipc) return;
    ipc
      .invoke("web_view_fullscreen", {
        fullscreen: next,
        session: captureSession(),
      })
      .catch((error) => console.error("web_view_fullscreen failed", error));
  }
  const onChange = () =>
    reportFullscreen(
      Boolean(document.fullscreenElement || document.webkitFullscreenElement),
    );
  document.addEventListener("fullscreenchange", onChange);
  document.addEventListener("webkitfullscreenchange", onChange);
  window.addEventListener("pagehide", () => reportFullscreen(false));
})();
