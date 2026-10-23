// The simple view. Waits for the Moodle page to finish loading, reads what it
// needs out of it (session key, user, the course's section list), then clears
// the page and renders a plain list of courses -> units -> files in its place.
(() => {
  const CULMS = globalThis.CULMS;
  if (!CULMS || !CULMS.parse || CULMS.started) return;
  CULMS.started = true;

  const P = CULMS.parse;
  const html = document.documentElement;
  const STORE = "culms-simple:v1";
  const STALE_MS = 60 * 60 * 1000;
  const PARALLEL = 4;

  // ---------------------------------------------------------------- helpers

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat(Infinity)) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c instanceof Node ? c : String(c));
    }
    return el;
  }

  const ICONS = {
    file: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6",
    forum: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
    quiz: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
    assign: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6v4H9z",
    url: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
    page: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5",
    folder: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
    video: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM10 8l6 4-6 4z",
    book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
    other: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01",
    download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
    external: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3",
    search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
    refresh: "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
    back: "M19 12H5M12 19l-7-7 7-7",
    chevron: "M9 18l6-6-6-6",
    lock: "M5 11h14v10H5zM7 11V7a5 5 0 0 1 10 0v4",
    clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  };

  function icon(name, cls) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "cs-icon" + (cls ? " " + cls : ""));
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", ICONS[name] || ICONS.other);
    svg.append(path);
    return svg;
  }

  // Moodle's file icon name (every one in core's pix/f) -> short label and
  // colour class. Older themes add a size ("pdf-24"), which is dropped.
  const PDF = ["PDF", "k-pdf"];
  const PPT = ["PPT", "k-ppt"];
  const DOC = ["DOC", "k-doc"];
  const XLS = ["XLS", "k-xls"];
  const ZIP = ["ZIP", "k-zip"];
  const IMG = ["IMG", "k-img"];
  const VID = ["VID", "k-vid"];
  const AUD = ["AUD", "k-vid"];
  const TXT = ["TXT", "k-txt"];
  const CODE = ["CODE", "k-txt"];
  const FILE_KINDS = {
    pdf: PDF,
    powerpoint: PPT, impress: PPT,
    document: DOC, writer: DOC, publisher: DOC,
    spreadsheet: XLS, calc: XLS, chart: XLS, database: ["DB", "k-xls"], base: ["DB", "k-xls"],
    archive: ZIP,
    image: IMG, jpeg: IMG, png: IMG, gif: IMG, bmp: IMG, tiff: IMG, eps: IMG, psd: IMG, draw: IMG,
    video: VID, mpeg: VID, quicktime: VID, avi: VID, wmv: VID, flash: VID,
    audio: AUD, mp3: AUD, wav: AUD,
    text: TXT, isf: TXT,
    sourcecode: CODE, markup: CODE, html: ["HTML", "k-txt"], math: CODE,
    epub: ["EPUB", "k-doc"],
    moodle: ["MBZ", "k-zip"],
  };
  // By extension, for a file whose icon says "unknown" once its name is known.
  const EXT_KINDS = {
    pdf: PDF, ppt: PPT, pptx: PPT, pps: PPT, ppsx: PPT, odp: PPT, key: PPT,
    doc: DOC, docx: DOC, odt: DOC, rtf: DOC,
    xls: XLS, xlsx: XLS, csv: XLS, ods: XLS,
    zip: ZIP, rar: ZIP, "7z": ZIP, gz: ZIP, tar: ZIP,
    jpg: IMG, jpeg: IMG, png: IMG, gif: IMG, webp: IMG, svg: IMG,
    mp4: VID, mkv: VID, mov: VID, webm: VID, avi: VID,
    mp3: AUD, wav: AUD, m4a: AUD, ogg: AUD,
    txt: TXT, md: TXT,
  };
  const MOD_KINDS = {
    forum: ["forum", "Forum"],
    assign: ["assign", "Assignment"],
    quiz: ["quiz", "Quiz"],
    url: ["url", "Link"],
    page: ["page", "Page"],
    folder: ["folder", "Folder"],
    book: ["book", "Book"],
    lti: ["video", "External tool"],
    hvp: ["video", "Interactive"],
    h5pactivity: ["video", "Interactive"],
    scorm: ["video", "SCORM package"],
    imscp: ["book", "Content package"],
    attendance: ["assign", "Attendance"],
    feedback: ["quiz", "Feedback"],
    questionnaire: ["quiz", "Questionnaire"],
    survey: ["quiz", "Survey"],
    choice: ["quiz", "Poll"],
    lesson: ["book", "Lesson"],
    glossary: ["book", "Glossary"],
    wiki: ["page", "Wiki"],
    data: ["page", "Database"],
    workshop: ["assign", "Workshop"],
    chat: ["forum", "Chat"],
    bigbluebuttonbn: ["video", "Live class"],
    zoom: ["video", "Live class"],
    customcert: ["file", "Certificate"],
  };
  const isFile = (it) => it.modname === "resource";
  const isMaterial = (it) => it.modname === "resource" || it.modname === "folder" || it.modname === "url" || it.modname === "page" || it.modname === "book";
  // Activities whose text goes into a zip as Markdown.
  const isText = (it) => it.modname === "page" || it.modname === "book";

  function fileKind(it) {
    const kind = FILE_KINDS[(it.filetype || "").replace(/-\d+$/, "")];
    if (kind) return kind;
    const res = state.resolved.get(it.cmid);
    const ext = res ? (/\.(\w{1,5})$/.exec(res.filename) || [])[1] : "";
    if (!ext) return ["FILE", "k-file"];
    return EXT_KINDS[ext.toLowerCase()] || [ext.toUpperCase(), "k-file"];
  }

  function kindTile(it) {
    if (isFile(it)) {
      const [label, cls] = fileKind(it);
      return h("span", { class: `cs-tile ${cls}` }, label);
    }
    const [ic] = MOD_KINDS[it.modname] || ["other"];
    return h("span", { class: "cs-tile k-mod" }, icon(ic));
  }

  function kindLabel(it) {
    if (isFile(it)) {
      const [label] = fileKind(it);
      return label === "FILE" ? "File" : label;
    }
    return (MOD_KINDS[it.modname] || [null, it.modname ? it.modname[0].toUpperCase() + it.modname.slice(1) : "Activity"])[1];
  }

  // ------------------------------------------------------------ assessments

  // Quizzes, assignments and surprise tests. CU runs a surprise test as an
  // assignment or a quiz, usually in a "Surprise Test" section.
  function assessKind(it, sec) {
    if (it.modname !== "quiz" && it.modname !== "assign") return null;
    if (/surprise/i.test(`${it.name} ${sec ? sec.name : ""}`)) return "surprise";
    return it.modname;
  }
  const ASSESS_KINDS = [
    ["surprise", "Surprise tests", "surprise test"],
    ["quiz", "Quizzes", "quiz"],
    ["assign", "Assignments", "assignment"],
  ];

  const deadline = (it) => (it.dates || []).find((d) => /^(due|close|cut)/i.test(d.label)) || null;
  const opening = (it) => (it.dates || []).find((d) => /^open/i.test(d.label)) || null;

  function fmtDay(ms) {
    return new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  // "Due 30 Oct, 11:00 pm" / "Closed 20 Oct, ..." from the course page.
  function dateLine(it) {
    const due = deadline(it);
    if (due) return `${due.label} ${fmtDay(due.time)}`;
    const open = opening(it);
    return open ? `${open.label} ${fmtDay(open.time)}` : "";
  }

  function statusOf(cmid) {
    if (!state.status.has(cmid)) state.status.set(cmid, store.get(`status:${cmid}`));
    return state.status.get(cmid);
  }

  // Where the student stands on a quiz or assignment, as { text, tone }, tone
  // being done, todo, late or wait. Uses the activity's own page once it has
  // been read, and the course page's dates and completion until then.
  function standing(it) {
    const st = statusOf(it.cmid);
    const now = Date.now();
    const due = deadline(it);
    const open = opening(it);
    const past = !!due && due.time < now;
    if (st && st.kind === "assign") {
      const sub = st.submission.toLowerCase();
      if (st.grade) return { text: `Graded ${st.grade}`, tone: "done" };
      if (/submitted/.test(sub) && !/not submitted/.test(sub)) return { text: "Submitted", tone: "done" };
      if (open && open.time > now) return { text: `Opens ${fmtDay(open.time)}`, tone: "wait" };
      if (/draft/.test(sub)) return { text: past ? "Draft, past due" : "Draft, not submitted", tone: past ? "late" : "todo" };
      return past ? { text: "Not submitted", tone: "late" } : { text: "To submit", tone: "todo" };
    }
    if (st && st.kind === "quiz") {
      if (st.inProgress) return { text: "In progress", tone: "todo" };
      if (st.finished) return { text: st.grade ? `Attempted · ${st.grade}` : "Attempted", tone: "done" };
      if (open && open.time > now) return { text: `Opens ${fmtDay(open.time)}`, tone: "wait" };
      return past ? { text: "Missed", tone: "late" } : { text: "Not attempted", tone: "todo" };
    }
    if (it.done === true) return { text: "Done", tone: "done" };
    if (open && open.time > now) return { text: `Opens ${fmtDay(open.time)}`, tone: "wait" };
    if (it.done === false) return past ? { text: "Missed", tone: "late" } : { text: "To do", tone: "todo" };
    return null;
  }

  function paintStatus(el) {
    const s = standing(el.csItem);
    el.className = "cs-status" + (s ? ` t-${s.tone}` : "");
    el.textContent = s ? s.text : "";
    el.hidden = !s;
  }

  function statusChip(it) {
    const el = h("span", { "data-status": it.cmid });
    el.csItem = it;
    paintStatus(el);
    return el;
  }

  // Read each quiz's and assignment's own page (Moodle's web service for this
  // is switched off on CULMS), a few at a time, repainting chips as they come.
  async function loadStatuses(items, force, onEach) {
    const todo = items.filter((it) => {
      const st = statusOf(it.cmid);
      return force || !st || Date.now() - st.at > STALE_MS;
    });
    let expired = null;
    await pool(todo, PARALLEL, async (it) => {
      if (expired) return;
      try {
        const st = { at: Date.now(), ...(await state.lms.status(it)) };
        state.status.set(it.cmid, st);
        store.set(`status:${it.cmid}`, st);
      } catch (err) {
        if (err instanceof CULMS.SessionExpired) expired = err;
        return;
      }
      for (const el of document.querySelectorAll(`[data-status="${it.cmid}"]`)) paintStatus(el);
      if (onEach) onEach();
    });
    if (expired) throw expired;
  }

  // Quizzes, assignments and surprise tests in a course tree.
  function assessments(sections) {
    const out = [];
    for (const s of sections || []) {
      for (const it of s.items || []) {
        const kind = assessKind(it, s);
        if (kind) out.push({ it, sec: s, kind });
      }
    }
    return out;
  }

  function tally(list) {
    const n = { todo: 0, late: 0 };
    for (const a of list) {
      const s = standing(a.it);
      if (s && (s.tone === "todo" || s.tone === "late")) n[s.tone]++;
    }
    return n;
  }

  function fmtSize(n) {
    if (n === null || n === undefined) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  function fmtWhen(ms) {
    const d = new Date(ms);
    return d.toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function ago(ms) {
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m} min ago`;
    const hrs = Math.round(m / 60);
    if (hrs < 24) return `${hrs} h ago`;
    return `${Math.round(hrs / 24)} d ago`;
  }

  async function pool(items, limit, fn) {
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  }

  // localStorage is per-origin and lives in this browser only; nothing leaves it.
  const store = {
    key: (k) => `${STORE}:${state.user.id || "u"}:${k}`,
    get(k) {
      try {
        return JSON.parse(localStorage.getItem(this.key(k)));
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(this.key(k), JSON.stringify(v));
      } catch {
        // Quota or blocked storage: the view still works, just without cache.
      }
    },
    pref(k, fallback) {
      try {
        const v = localStorage.getItem(`${STORE}:pref:${k}`);
        return v === null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    setPref(k, v) {
      try {
        localStorage.setItem(`${STORE}:pref:${k}`, JSON.stringify(v));
      } catch {}
    },
  };

  // ------------------------------------------------------------------ state

  const state = {
    user: { id: null, name: "" },
    lms: null,
    expanded: new Set(),
    folders: new Map(),
    resolved: new Map(),
    status: new Map(),
    route: null,
    query: "",
  };

  let root, main, banner, searchInput, toastEl, toastTimer;

  // -------------------------------------------------------------- bootstrap

  function waitForLoad() {
    if (document.readyState === "complete") return Promise.resolve();
    // Moodle pages can hang on a slow asset; the markup we need is already
    // parsed at document_idle, so do not wait for ever.
    return new Promise((resolve) => {
      window.addEventListener("load", resolve, { once: true });
      setTimeout(resolve, 4000);
    });
  }

  function addPill(label, onClick, href) {
    const pill = h("a", { class: "culms-pill", href: href || "#", onclick: onClick }, label);
    document.body.append(pill);
  }

  async function start() {
    await waitForLoad();
    const route = CULMS.route(location);
    const cfg = P.config(document);
    const original = location.hash === "#original";

    if (!route || original || !CULMS.enabled() || !cfg.loggedIn || !cfg.sesskey) {
      html.classList.remove("culms-pending");
      if (!cfg.loggedIn) return;
      if (!CULMS.enabled() || original) {
        if (route) {
          addPill("Simple view", (e) => {
            e.preventDefault();
            try {
              localStorage.removeItem(CULMS.MODE_KEY);
            } catch {}
            location.href = location.pathname + location.search;
          });
        }
        return;
      }
      // An activity page: offer a way back to the simple course view.
      const cid = /"courseId":(\d+)/.exec(document.documentElement.innerHTML);
      const href = cid && Number(cid[1]) > 1 ? `/course/view.php?id=${cid[1]}` : "/my/";
      addPill("Simple view", null, href);
      return;
    }

    state.user = { id: cfg.userId, name: P.userName(document) };
    state.lms = new CULMS.Lms(cfg.sesskey);

    // The course page the browser just loaded already holds the section list
    // and the activities of one section: keep them so the first render needs
    // one request fewer.
    let prefill = null;
    if (route.name === "course") {
      // Read everything now: takeOver() is about to empty this document.
      prefill = { id: route.id, title: courseTitleFrom(document) };
      prefill.sections = P.sections(document);
      prefill.items = prefilledItems(document);
      prefill.flat = prefill.sections.length ? [] : P.activities(document);
    }

    takeOver();
    window.addEventListener("popstate", () => render(CULMS.route(location)));
    render(route, prefill);
  }

  function courseTitleFrom(doc) {
    const t = (doc.title || "").replace(/^Course:\s*/i, "").replace(/\s*\|\s*CU-LMS\s*$/i, "");
    return CULMS.cleanName(t);
  }

  function prefilledItems(doc) {
    const out = new Map();
    for (const li of doc.querySelectorAll("li.section[data-number]")) {
      const n = Number(li.dataset.number);
      out.set(n, P.activities(doc, n));
    }
    return out;
  }

  // Strip Moodle's styles and markup, keep the <head> metadata, mount our root.
  function takeOver() {
    const isOurs = (n) => n.id === "culms-simple";
    const killStyles = (scope) =>
      scope.querySelectorAll('link[rel~="stylesheet"], style').forEach((n) => n.remove());
    killStyles(document);
    document.body.replaceChildren();
    document.body.className = "";
    document.body.removeAttribute("style");
    for (const c of Array.from(html.classList)) if (c !== "culms-pending") html.classList.remove(c);
    html.removeAttribute("style");
    html.classList.add("culms-simple");

    banner = h("div", { class: "cs-banner", hidden: true });
    main = h("main", { class: "cs-main", id: "cs-main" });
    toastEl = h("div", { class: "cs-toast", role: "status", "aria-live": "polite" });
    root = h("div", { id: "culms-simple" }, header(), banner, main, footer(), toastEl);
    document.body.append(root);
    html.classList.remove("culms-pending");
    // The sticky unit bar sits under the header, whose height changes when
    // it wraps on a phone.
    const top = root.querySelector(".cs-top");
    new ResizeObserver(() => html.style.setProperty("--cs-top", `${top.offsetHeight}px`)).observe(top);

    // Moodle keeps running underneath (YUI loads CSS, modals, toasts). Keep
    // its additions out so the page stays ours.
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.matches('link[rel~="stylesheet"], style')) n.remove();
          else if (n.parentNode === document.body && !isOurs(n)) n.remove();
        }
      }
    }).observe(html, { childList: true, subtree: true });

    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement !== searchInput && !/input|textarea/i.test(document.activeElement.tagName)) {
        e.preventDefault();
        searchInput.focus();
      } else if (e.key === "Escape" && document.activeElement === searchInput) {
        searchInput.value = "";
        onSearch();
        searchInput.blur();
      }
    });
  }

  function header() {
    searchInput = h("input", {
      type: "search",
      placeholder: "Search your files…  ( / )",
      "aria-label": "Search course material",
      oninput: onSearch,
    });
    return h(
      "header",
      { class: "cs-top" },
      h("a", { class: "cs-brand", href: "/my/", onclick: nav }, h("b", null, "CU"), "LMS", h("span", null, "simple")),
      h("label", { class: "cs-search" }, icon("search"), searchInput),
      h(
        "nav",
        { class: "cs-menu" },
        h("a", { href: "/grade/report/overview/index.php" }, "Grades"),
        h("a", { href: "/calendar/view.php?view=month", onclick: nav }, "Calendar"),
        h("a", { class: "cs-menu-original", href: "#", onclick: toOriginal, title: "Turn the simple view off" }, "Original site"),
        h("a", { href: `/login/logout.php?sesskey=${encodeURIComponent(state.lms.sesskey)}` }, "Log out")
      )
    );
  }

  function footer() {
    return h(
      "footer",
      { class: "cs-foot" },
      "CULMS Simple — everything here is read live from lms.cuchd.in with your own session. ",
      h("a", { href: "#", onclick: toOriginal }, "Switch to the original site")
    );
  }

  function toOriginal(e) {
    e.preventDefault();
    try {
      localStorage.setItem(CULMS.MODE_KEY, "off");
    } catch {}
    location.reload();
  }

  function nav(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.currentTarget;
    const url = new URL(a.href, location.href);
    const route = CULMS.route(url);
    if (!route) return;
    e.preventDefault();
    if (searchInput.value) {
      searchInput.value = "";
      state.query = "";
    }
    history.pushState(null, "", url.pathname + url.search);
    render(route);
    window.scrollTo(0, 0);
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 5000);
  }

  function failed(err) {
    if (err instanceof CULMS.SessionExpired) {
      banner.replaceChildren(
        h("strong", null, "Your LMS session has ended. "),
        "Log in again through CUIMS, then come back here. ",
        h("a", { href: "https://students.cuchd.in/" }, "Open CUIMS"),
        " · ",
        h("a", { href: "#", onclick: (e) => (e.preventDefault(), location.reload()) }, "Retry")
      );
      banner.hidden = false;
      return true;
    }
    console.warn("[CULMS Simple]", err);
    return false;
  }

  // ----------------------------------------------------------------- routes

  let renderToken = 0;

  function render(route, prefill) {
    state.route = route;
    const token = ++renderToken;
    if (state.query) return renderSearch();
    if (!route || route.name === "home") return renderHome(token);
    if (route.name === "course") return renderCourse(route, token, prefill);
    if (route.name === "calendar") return renderCalendar(route, token);
  }

  // ------------------------------------------------------------------- home

  async function renderHome(token) {
    document.title = "My courses · CULMS";
    const upcoming = h("section", { class: "cs-card cs-upcoming", hidden: true });
    const list = h("div", { class: "cs-courses" });
    const status = h("span", { class: "cs-muted" });
    const first = (state.user.name || "").split(/\s+/)[0];
    main.replaceChildren(
      h("div", { class: "cs-head" },
        h("h1", null, first ? `Hi, ${titleCase(first)}` : "My courses"),
        h("div", { class: "cs-actions" },
          status,
          h("button", { class: "cs-btn", onclick: () => indexAll(status) , title: "Load every course so search covers all of them" }, icon("refresh"), "Refresh all")
        )
      ),
      upcoming,
      h("h2", { class: "cs-h2" }, "Courses"),
      list
    );

    const cached = store.get("courses");
    if (cached) drawCourses(list, cached.list);
    else list.append(skeleton(6));

    state.lms.upcoming().then(
      (events) => token === renderToken && drawUpcoming(upcoming, events),
      (err) => failed(err)
    );

    try {
      const courses = await state.lms.courses();
      store.set("courses", { at: Date.now(), list: courses });
      if (token === renderToken) drawCourses(list, courses);
    } catch (err) {
      if (!failed(err) && !cached) list.replaceChildren(h("p", { class: "cs-empty" }, `Could not load your courses: ${err.message}`));
    }
  }

  function titleCase(s) {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }

  function drawUpcoming(box, events) {
    if (!events.length) return;
    box.hidden = false;
    box.replaceChildren(
      h("h2", { class: "cs-h2" }, icon("clock"), "Due soon",
        h("a", { class: "cs-h2-link", href: "/calendar/view.php?view=month", onclick: nav }, "Calendar")),
      h("ul", { class: "cs-list" },
        events.map((e) =>
          h("li", { class: "cs-row" + (e.overdue ? " overdue" : "") },
            h("span", { class: "cs-date" }, fmtWhen(e.time)),
            h("a", { class: "cs-name", href: e.url }, e.name),
            h("span", { class: "cs-meta" }, [e.what, e.course].filter(Boolean).join(" · "), e.overdue ? h("em", null, " overdue") : null)
          )
        )
      )
    );
  }

  function courseStats(id) {
    const c = store.get(`course:${id}`);
    if (!c) return null;
    let files = 0;
    let items = 0;
    for (const s of c.sections) {
      for (const it of s.items || []) {
        if (it.modname === "label") continue;
        items++;
        if (isFile(it)) files++;
      }
    }
    return { files, items, at: c.at };
  }

  // CU enrols a student in two Moodle courses per subject: the class course
  // (26BAT-604_26MBA-109_ALL: quizzes, live links) and the CONT_ course with
  // the units. Both are one subject here; the class course leads.
  function subjects(courses) {
    const by = new Map();
    for (const c of courses) {
      const key = c.code ? CULMS.subjectKey(c.code) : `#${c.id}`;
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(c);
    }
    return Array.from(by.values(), (list) => {
      const main = list.find((c) => !c.isCont) || list[0];
      return { main, list, title: main.title, code: main.code ? CULMS.subjectKey(main.code) : "" };
    });
  }

  // The courses of the subject `id` belongs to, content course first.
  function subjectOf(id, courses) {
    const s = subjects(courses).find((x) => x.list.some((c) => c.id === id));
    return s ? [...s.list].sort((a, b) => Number(b.isCont) - Number(a.isCont)) : [];
  }

  function drawCourses(list, courses) {
    if (!courses.length) {
      list.replaceChildren(h("p", { class: "cs-empty" }, "You are not enrolled in any courses."));
      return;
    }
    const sorted = subjects(courses).sort((a, b) => a.title.localeCompare(b.title));
    list.replaceChildren(
      ...sorted.map((s) => {
        const stats = s.list.map((c) => courseStats(c.id)).filter(Boolean);
        const st = stats.length ? { files: stats.reduce((n, x) => n + x.files, 0), items: stats.reduce((n, x) => n + x.items, 0) } : null;
        const lone = s.list.length === 1 && s.main.isCont;
        return h("a", { class: "cs-course", href: `/course/view.php?id=${s.main.id}`, onclick: nav },
          h("span", { class: "cs-course-title" }, s.title, lone ? h("span", { class: "cs-chip" }, "CONT") : null),
          h("span", { class: "cs-meta" },
            s.code,
            st ? ` · ${st.files} file${st.files === 1 ? "" : "s"}, ${st.items} item${st.items === 1 ? "" : "s"}` : ""
          ),
          assessLine(s.list.flatMap((c) => assessments((store.get(`course:${c.id}`) || {}).sections))),
          icon("chevron", "cs-go")
        );
      })
    );
  }

  // "2 quizzes · 3 assignments · 1 surprise test · 2 to do" for a course card.
  function assessLine(list) {
    if (!list.length) return null;
    const parts = ASSESS_KINDS.map(([kind, , one]) => {
      const n = list.filter((a) => a.kind === kind).length;
      return n ? `${n} ${one}${n === 1 ? "" : one.endsWith("z") ? "zes" : "s"}` : "";
    }).filter(Boolean);
    const n = tally(list);
    return h("span", { class: "cs-meta cs-assess-line" },
      parts.join(" · "),
      n.todo ? h("b", { class: "t-todo" }, ` · ${n.todo} to do`) : null,
      n.late ? h("b", { class: "t-late" }, ` · ${n.late} missed`) : null
    );
  }

  function skeleton(n) {
    return Array.from({ length: n }, () => h("div", { class: "cs-skel" }));
  }

  // Walk every course so search covers everything (what `sync` does in the
  // connector, minus the file sizes).
  async function indexAll(status) {
    let courses = (store.get("courses") || {}).list;
    try {
      if (!courses) courses = await state.lms.courses();
    } catch (err) {
      return failed(err) || toast(err.message);
    }
    let done = 0;
    status.textContent = `Loading 0 / ${courses.length}…`;
    try {
      await pool(courses, 2, async (c) => {
        await fetchCourse(c.id, c, null, () => {});
        status.textContent = `Loading ${++done} / ${courses.length}…`;
      });
      const items = courses.flatMap((c) => assessments((store.get(`course:${c.id}`) || {}).sections)).map((a) => a.it);
      let checked = 0;
      status.textContent = `Checking ${items.length} quizzes and assignments…`;
      await loadStatuses(items, false, () => (status.textContent = `Checking quizzes and assignments ${++checked} / ${items.length}…`));
      status.textContent = `All ${courses.length} courses up to date`;
      if (state.route && state.route.name === "home" && !state.query) drawCourses(main.querySelector(".cs-courses"), courses);
      else if (state.query) renderSearch();
    } catch (err) {
      status.textContent = "";
      if (!failed(err)) toast(err.message);
    }
  }

  // ----------------------------------------------------------------- course

  // Load a course's sections and their activities, calling onSection as each
  // one arrives. Saves the finished tree to the cache.
  async function fetchCourse(id, meta, prefill, onSection) {
    let sections, pre, flat, title;
    if (prefill && prefill.id === id) {
      ({ sections, items: pre, flat, title } = prefill);
    } else {
      const { doc } = await state.lms.courseHtml(id);
      sections = P.sections(doc);
      pre = prefilledItems(doc);
      flat = sections.length ? [] : P.activities(doc);
      title = courseTitleFrom(doc);
    }
    if (meta) title = { title: meta.title, code: meta.code, isCont: meta.isCont };

    if (!sections.length) {
      // No section structure at all: list whatever the page shows.
      sections = [{ number: 0, name: "Course", level: 0, items: flat }];
      onSection(sections, 0);
    } else {
      sections = sections.map((s) => ({ ...s, items: pre.has(s.number) ? pre.get(s.number) : null }));
      sections.forEach((s, i) => s.items && onSection(sections, i));
      const todo = sections.map((s, i) => i).filter((i) => !sections[i].items);
      let expired = null;
      await pool(todo, PARALLEL, async (i) => {
        if (expired) return;
        try {
          const { doc: d } = await state.lms.courseHtml(id, sections[i].number);
          sections[i].items = P.activities(d, sections[i].number);
        } catch (err) {
          if (err instanceof CULMS.SessionExpired) expired = err;
          sections[i].items = [];
          sections[i].error = err.message;
        }
        onSection(sections, i);
      });
      if (expired) throw expired;
    }
    const tree = { at: Date.now(), ...title, sections: sections.map(({ number, name, level, items }) => ({ number, name, level, items })) };
    store.set(`course:${id}`, tree);
    return tree;
  }

  async function renderCourse(route, token, prefill) {
    const id = route.id;
    let list = (store.get("courses") || {}).list;
    if (!list) {
      // Opened straight from a link: the course list says which other course
      // belongs to the same subject. Without it, show this course alone.
      try {
        list = await state.lms.courses();
        store.set("courses", { at: Date.now(), list });
      } catch {
        list = [];
      }
      if (token !== renderToken) return;
    }
    const group = subjectOf(id, list);
    const meta = group.find((c) => c.id === id) || null;
    const merged = group.length > 1;
    const cached = store.get(`course:${id}`);
    const t = meta || cached || (prefill && prefill.title) || { title: `Course ${id}`, code: "" };
    document.title = `${t.title} · CULMS`;

    const filesOnly = store.pref("filesOnly", false);
    const status = h("span", { class: "cs-muted" });
    const toggle = h("input", { type: "checkbox", checked: filesOnly || null, onchange: () => {
      store.setPref("filesOnly", toggle.checked);
      html.classList.toggle("files-only", toggle.checked);
    } });
    html.classList.toggle("files-only", filesOnly);

    const assess = h("section", { class: "cs-card cs-assess", hidden: true });
    // Parts draw from the cache as they are built, before `parts` is complete.
    let parts = [];
    const drawAssess = () => token === renderToken && drawAssessments(assess, parts.flatMap((p) => assessments(p.sections())));
    parts = (group.length ? group : [{ id }]).map((c) => coursePart(c, merged, token, prefill, status, drawAssess));
    const checkStatuses = async (force) => {
      const items = parts.flatMap((p) => assessments(p.sections())).map((a) => a.it);
      try {
        await loadStatuses(items, force, drawAssess);
      } catch (err) {
        if (!failed(err)) toast(`Could not check quizzes and assignments: ${err.message}`);
      }
    };
    const refresh = h("button", { class: "cs-btn", onclick: async () => {
      refresh.disabled = true;
      await Promise.all(parts.map((p) => p.load(true)));
      await checkStatuses(true);
      refresh.disabled = false;
    } }, icon("refresh"), "Refresh");
    const zipAll = h("button", { class: "cs-btn", title: "Download every file in this course as one .zip", onclick: () =>
      downloadZip(t.title, parts.map((p) => ({ label: merged ? p.label : "", sections: p.sections() })), zipAll)
    }, icon("download"), "Download all");
    main.replaceChildren(
      h("a", { class: "cs-back", href: "/my/", onclick: nav }, icon("back"), "All courses"),
      h("div", { class: "cs-head" },
        h("div", null,
          h("h1", null, t.title, t.isCont && !merged ? h("span", { class: "cs-chip" }, "CONT") : null),
          h("div", { class: "cs-meta" }, t.code ? CULMS.subjectKey(t.code) : "")
        ),
        h("div", { class: "cs-actions" },
          merged ? null : status,
          h("label", { class: "cs-switch" }, toggle, "Material only"),
          zipAll,
          refresh,
          h("a", { class: "cs-btn ghost", href: `/course/view.php?id=${id}#original`, title: "Open this course on the original site" }, icon("external"), "Original")
        )
      ),
      assess,
      ...parts.map((p) => p.el)
    );
    drawAssess();

    refresh.disabled = true;
    await Promise.all(parts.filter((p) => p.stale()).map((p) => p.load(false)));
    refresh.disabled = false;
    if (token === renderToken) await checkStatuses(false);
    if (route.section !== null && route.section !== undefined && token === renderToken) {
      const el = document.getElementById(`cs-sec-${id}-${route.section}`);
      if (el) el.scrollIntoView({ block: "start" });
    }
  }

  // One Moodle course of a subject, with its own unit bar, loaded on its own.
  // `status` is the page's status line when the course is shown alone.
  function coursePart(course, merged, token, prefill, status, onDraw) {
    const id = course.id;
    const label = course.isCont ? "Content" : "Class";
    const cached = store.get(`course:${id}`);
    const body = h("div", { class: "cs-units" });
    const jump = h("nav", { class: "cs-jump", "aria-label": "Units", hidden: true });
    const own = merged ? h("span", { class: "cs-muted" }) : status;
    const el = h("section", { class: "cs-part" },
      merged
        ? h("div", { class: "cs-part-head" },
            h("h2", { class: "cs-h2" }, label),
            own,
            h("a", { class: "cs-part-orig", href: `/course/view.php?id=${id}#original`, title: `Open the ${label.toLowerCase()} course on the original site` }, "Original"))
        : null,
      jump,
      body
    );

    let units = null;
    let current = null;
    const draw = (sections) => {
      if (token !== renderToken) return;
      current = sections;
      if (!units) units = drawUnits(body, sections, jump, id);
      else units.update(sections);
      // Of a subject's two courses, one is often bare: leave it out.
      if (merged) el.hidden = sections.every((s) => s.items && !s.items.length);
      onDraw();
    };

    if (cached) {
      draw(cached.sections);
      own.textContent = `Updated ${ago(cached.at)}`;
    } else {
      body.replaceChildren(...skeleton(merged ? 2 : 4));
    }

    const load = async (force) => {
      own.textContent = "Loading…";
      try {
        await fetchCourse(id, course.title ? course : null, force ? null : prefill, (sections) => {
          draw(sections);
          const done = sections.filter((s) => s.items).length;
          if (token === renderToken && done < sections.length) own.textContent = `Loading ${done} / ${sections.length}…`;
        });
        if (token === renderToken) own.textContent = "Up to date";
      } catch (err) {
        if (token !== renderToken) return;
        own.textContent = "";
        if (!failed(err)) toast(`Could not load this course: ${err.message}`);
      }
    };

    return {
      el,
      label,
      load,
      sections: () => current,
      stale: () => !cached || (prefill && prefill.id === id) || Date.now() - cached.at > STALE_MS,
    };
  }

  // Group sections into units: a level-0 section and the deeper ones after it.
  function groupUnits(sections) {
    const units = [];
    for (const s of sections) {
      if (s.level === 0 || !units.length) units.push({ head: s, chapters: [] });
      else units[units.length - 1].chapters.push(s);
    }
    return units;
  }

  function drawUnits(body, sections, jump, courseId) {
    const boxes = new Map();
    let shape = "";
    const secId = (n) => `cs-sec-${courseId}-${n}`;
    const build = (secs) => {
      boxes.clear();
      shape = secs.map((s) => `${s.number}:${s.level}`).join(",");
      const units = groupUnits(secs);
      // Chips to jump between units; only worth it when there are several.
      jump.hidden = units.length < 3;
      jump.replaceChildren(
        ...units.map((u) =>
          h("a", { href: `#${secId(u.head.number)}`, onclick: (e) => {
            e.preventDefault();
            document.getElementById(secId(u.head.number)).scrollIntoView({ behavior: "smooth", block: "start" });
          } }, u.head.name)
        )
      );
      body.replaceChildren(
        ...units.map((u) => {
          const latest = () => [u.head, ...u.chapters].map((s) => boxes.get(s.number).sec);
          const zip = h("button", { class: "cs-icon-btn cs-unit-zip", title: "Download this unit as a .zip", "aria-label": `Download ${u.head.name}`, onclick: () =>
            downloadZip(`${document.title.replace(/ · CULMS$/, "")} - ${u.head.name}`, [{ label: "", sections: latest() }], zip)
          }, icon("download"));
          const card = h("section", { class: "cs-card cs-unit", id: secId(u.head.number) },
            h("h2", { class: "cs-unit-title" }, u.head.name, h("span", { class: "cs-unit-side" }, h("span", { class: "cs-unit-count" }), zip))
          );
          const own = h("div", { class: "cs-sec" });
          boxes.set(u.head.number, { box: own, sec: u.head, card });
          card.append(own);
          for (const ch of u.chapters) {
            const wrap = h("div", { class: "cs-chapter", id: secId(ch.number) }, h("h3", null, ch.name));
            const box = h("div", { class: "cs-sec" });
            wrap.append(box);
            card.append(wrap);
            boxes.set(ch.number, { box, sec: ch, wrap, card });
          }
          return card;
        })
      );
    };
    const fill = (secs) => {
      for (const s of secs) {
        const b = boxes.get(s.number);
        // Redraw only what changed, so a download or an open folder in one
        // section is not reset while another section is still loading.
        if (!b || (b.items === s.items && b.error === s.error && s.items)) continue;
        b.sec = s;
        b.items = s.items;
        b.error = s.error;
        if (s.items === null || s.items === undefined) {
          b.box.replaceChildren(h("div", { class: "cs-skel small" }));
        } else {
          b.box.replaceChildren(...drawItems(s.items, s));
          const empty = !s.items.length;
          if (b.wrap) b.wrap.classList.toggle("is-empty", empty);
          b.box.classList.toggle("is-empty", empty);
          b.box.classList.toggle("no-material", !s.items.some(isMaterial));
        }
      }
      // A unit whose own section and every chapter are empty says so once.
      for (const card of body.querySelectorAll(".cs-unit")) {
        const secs = Array.from(card.querySelectorAll(".cs-sec"));
        const done = secs.every((x) => !x.querySelector(".cs-skel"));
        const empty = done && secs.every((x) => x.classList.contains("is-empty"));
        const files = Array.from(card.querySelectorAll(".cs-item")).filter((x) => x.dataset.file).length;
        card.querySelector(".cs-unit-count").textContent = files ? `${files} file${files === 1 ? "" : "s"}` : "";
        card.querySelector(".cs-unit-zip").hidden = !done || !card.querySelector(".cs-item[data-file], .cs-item-wrap");
        let note = card.querySelector(":scope > .cs-empty");
        if (empty && !note) card.append(h("p", { class: "cs-empty" }, "Nothing has been posted here yet."));
        else if (!empty && note) note.remove();
      }
    };
    build(sections);
    fill(sections);
    return {
      update(secs) {
        if (secs.map((s) => `${s.number}:${s.level}`).join(",") !== shape) build(secs);
        fill(secs);
      },
    };
  }

  function drawItems(items, sec) {
    if (sec && sec.error) return [h("p", { class: "cs-empty" }, `Could not load this section (${sec.error}).`)];
    return items.map((it) => itemRow(it));
  }

  // The course's quizzes, assignments and surprise tests in one place, each
  // with its deadline and where the student stands, soonest deadline first.
  function drawAssessments(box, list) {
    box.hidden = !list.length;
    if (!list.length) return;
    const n = tally(list);
    const when = (a) => {
      const d = deadline(a.it);
      return d ? d.time : Number.MAX_SAFE_INTEGER;
    };
    box.replaceChildren(
      h("h2", { class: "cs-h2" }, icon("quiz"), "Assessments",
        h("span", { class: "cs-assess-sum" },
          n.todo ? h("b", { class: "t-todo" }, `${n.todo} to do`) : null,
          n.late ? h("b", { class: "t-late" }, `${n.late} missed`) : null
        )
      ),
      ...ASSESS_KINDS.map(([kind, title]) => {
        const rows = list.filter((a) => a.kind === kind).sort((a, b) => when(a) - when(b));
        if (!rows.length) return null;
        return h("div", { class: "cs-assess-group", "data-kind": kind },
          h("h3", null, title, h("span", { class: "cs-unit-count" }, rows.length)),
          // The section name, unless it only repeats the kind or the name.
          rows.map((a) => itemRow(a.it, [kindLabel(a.it), a.it.name].includes(a.sec.name) ? "" : a.sec.name))
        );
      }).filter(Boolean)
    );
  }

  function itemRow(it, context) {
    if (it.modname === "label") {
      return h("div", { class: "cs-label" },
        it.name ? h("p", null, it.name) : null,
        (it.links || []).map((l) => h("a", { href: l.url, target: "_blank", rel: "noopener" }, icon("url"), l.name))
      );
    }
    const file = isFile(it);
    const href = file || it.modname === "url" ? CULMS.withParam(it.url, "redirect", "1") : it.url;
    const meta = h("span", { class: "cs-meta" }, kindLabel(it));
    const res = state.resolved.get(it.cmid);
    if (res && res.size) meta.append(` · ${fmtSize(res.size)}`);
    if (context) meta.append(` · ${context}`);
    const when = dateLine(it);
    if (when) meta.append(` · ${when}`);
    if (it.restricted) meta.append(h("span", { class: "cs-lock" }, icon("lock"), "restricted"));

    const row = h("div", { class: "cs-item" + (isMaterial(it) ? " is-material" : " is-activity"), "data-file": file ? "1" : null },
      kindTile(it),
      h("div", { class: "cs-item-main" },
        h("a", { class: "cs-name", href, target: file || it.modname === "url" ? "_blank" : null, rel: "noopener" }, it.name),
        meta
      )
    );
    if (it.modname === "quiz" || it.modname === "assign") row.append(statusChip(it));
    if (file) {
      const btn = h("button", { class: "cs-icon-btn", title: "Download", "aria-label": `Download ${it.name}`, onclick: () => download(it, btn, meta) }, icon("download"));
      row.append(btn);
    } else if (it.modname === "folder") {
      const list = h("div", { class: "cs-folder", hidden: !state.expanded.has(it.cmid) });
      const btn = h("button", { class: "cs-icon-btn", title: "Show files", "aria-expanded": String(state.expanded.has(it.cmid)), onclick: () => toggleFolder(it, list, btn) }, icon("chevron"));
      row.append(btn);
      if (state.expanded.has(it.cmid)) fillFolder(it, list);
      return h("div", { class: "cs-item-wrap" }, row, list);
    }
    return row;
  }

  async function download(it, btn, meta) {
    btn.disabled = true;
    btn.classList.add("busy");
    try {
      const f = state.resolved.get(it.cmid) || (await state.lms.resolveFile(it.cmid));
      state.resolved.set(it.cmid, f);
      if (f.size && !meta.textContent.includes(fmtSize(f.size))) {
        meta.firstChild.after(` · ${fmtSize(f.size)}`);
      }
      const a = h("a", { href: CULMS.withParam(f.url, "forcedownload", "1"), download: f.filename, hidden: true });
      root.append(a);
      a.click();
      a.remove();
    } catch (err) {
      if (!failed(err)) toast(`Could not download “${it.name}”: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.classList.remove("busy");
    }
  }

  function toggleFolder(it, list, btn) {
    const open = list.hidden;
    list.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    if (open) {
      state.expanded.add(it.cmid);
      fillFolder(it, list);
    } else {
      state.expanded.delete(it.cmid);
    }
  }

  async function fillFolder(it, list) {
    if (state.folders.has(it.cmid)) return drawFolder(list, state.folders.get(it.cmid));
    list.replaceChildren(h("div", { class: "cs-skel small" }));
    try {
      const files = await state.lms.folder(it.cmid);
      state.folders.set(it.cmid, files);
      drawFolder(list, files);
    } catch (err) {
      if (!failed(err)) list.replaceChildren(h("p", { class: "cs-empty" }, `Could not open the folder: ${err.message}`));
    }
  }

  function drawFolder(list, files) {
    if (!files.length) return list.replaceChildren(h("p", { class: "cs-empty" }, "This folder is empty."));
    list.replaceChildren(
      ...files.map((f) =>
        h("div", { class: "cs-subfile" },
          h("a", { href: f.url, target: "_blank", rel: "noopener" }, f.name),
          h("a", { class: "cs-icon-btn", href: CULMS.withParam(f.url, "forcedownload", "1"), download: f.name, title: "Download" }, icon("download"))
        )
      )
    );
  }

  // --------------------------------------------------------------- download

  const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  // A store-only zip: course files are PDFs and Office documents, already
  // compressed, so deflating them again gains next to nothing.
  function zipBlob(entries) {
    const enc = new TextEncoder();
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const local = [];
    const central = [];
    let offset = 0;
    for (const { path, data } of entries) {
      const name = enc.encode(path);
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true); // names are UTF-8
      lh.setUint16(10, time, true);
      lh.setUint16(12, date, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true);
      local.push(lh, name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(12, time, true);
      ch.setUint16(14, date, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true);
      ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(ch, name);
      offset += 30 + name.length + data.length;
    }
    const size = central.reduce((n, x) => n + x.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, size, true);
    end.setUint32(16, offset, true);
    return new Blob([...local, ...central, end], { type: "application/zip" });
  }

  const safeName = (s) => s.replace(/[\\/:*?"<>|\x00-\x1f]+/g, "_").replace(/[. ]+$/, "").trim().slice(0, 120) || "untitled";

  // Every file under the given sections (folders included), packed into one
  // .zip with a directory per unit and chapter, plus an index.md of the whole
  // tree with its notes and links, so the lot can be handed to an AI as is.
  // parts: [{ label, sections }], label being "" or "Content" / "Class".
  async function downloadZip(title, parts, btn) {
    const jobs = [];
    const index = [`# ${title}`, ""];
    for (const p of parts) {
      if (!p.sections || p.sections.some((s) => !s.items)) return toast("Still loading this course. Try again in a moment.");
      if (p.label) index.push(`## ${p.label}`, "");
      for (const u of groupUnits(p.sections)) {
        for (const s of [u.head, ...u.chapters]) {
          if (!s.items.length) continue;
          const dir = [p.label, u.head.name, s === u.head ? "" : s.name].filter(Boolean).map(safeName).join("/");
          index.push(`${s === u.head ? "###" : "####"} ${s.name}`, "");
          for (const it of s.items) {
            if (it.modname === "label") {
              index.push(it.name, ...(it.links || []).map((l) => `- [${l.name}](${l.url})`), "");
              continue;
            }
            const where = isFile(it) || it.modname === "folder" || isText(it) ? ` → ${dir}/` : "";
            const st = assessKind(it, s) ? standing(it) : null;
            const facts = [dateLine(it), st && st.text].filter(Boolean).join(", ");
            index.push(`- ${kindLabel(it)}: [${it.name}](${it.url})${facts ? ` (${facts})` : ""}${where}`);
            if (isFile(it) || it.modname === "folder" || isText(it)) jobs.push({ dir, it });
          }
          index.push("");
        }
      }
    }
    if (!jobs.length) return toast("There are no files here to download.");

    btn.disabled = true;
    btn.classList.add("busy");
    const entries = [];
    const taken = new Set();
    const add = (path, data) => {
      let p = path;
      for (let n = 2; taken.has(p.toLowerCase()); n++) p = path.replace(/(\.[^./]*)?$/, ` (${n})$1`);
      taken.add(p.toLowerCase());
      entries.push({ path: p, data });
    };
    const missed = [];
    let done = 0;
    toast(`Downloading 0 / ${jobs.length} items…`);
    try {
      await pool(jobs, PARALLEL, async ({ dir, it }) => {
        try {
          if (isText(it)) {
            add(`${dir}/${safeName(it.name)}.md`, new TextEncoder().encode(`# ${it.name}\n\n${await state.lms.content(it)}`));
          } else if (isFile(it)) {
            const f = state.resolved.get(it.cmid) || (await state.lms.resolveFile(it.cmid));
            state.resolved.set(it.cmid, f);
            add(`${dir}/${safeName(f.filename)}`, await state.lms.bytes(f.url));
          } else {
            const files = state.folders.get(it.cmid) || (await state.lms.folder(it.cmid));
            state.folders.set(it.cmid, files);
            for (const f of files) add(`${dir}/${safeName(it.name)}/${safeName(f.name)}`, await state.lms.bytes(f.url));
          }
        } catch (err) {
          if (err instanceof CULMS.SessionExpired) throw err;
          missed.push(it.name);
        }
        toast(`Downloading ${++done} / ${jobs.length} items…`);
      });
      if (missed.length) index.push("## Not downloaded", "", ...missed.map((m) => `- ${m}`), "");
      add("index.md", new TextEncoder().encode(index.join("\n")));
      const url = URL.createObjectURL(zipBlob(entries));
      const a = h("a", { href: url, download: `${safeName(title)}.zip`, hidden: true });
      root.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast(`Saved ${entries.length - 1} files${missed.length ? `; ${missed.length} could not be fetched (listed in index.md)` : ""}.`);
    } catch (err) {
      if (!failed(err)) toast(`Could not download: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.classList.remove("busy");
    }
  }

  // --------------------------------------------------------------- calendar

  const monthHref = (year, month) =>
    `/calendar/view.php?view=month&time=${Math.floor(new Date(year, month - 1, 1).getTime() / 1000)}`;

  async function renderCalendar(route, token) {
    const at = route.time ? new Date(route.time * 1000) : new Date();
    const year = at.getFullYear();
    const month = at.getMonth() + 1;
    const title = at.toLocaleString("en-IN", { month: "long", year: "numeric" });
    document.title = `${title} · Calendar · CULMS`;
    const grid = h("div", { class: "cs-cal" }, skeleton(1));
    const agenda = h("section", { class: "cs-card cs-agenda", hidden: true });
    main.replaceChildren(
      h("a", { class: "cs-back", href: "/my/", onclick: nav }, icon("back"), "All courses"),
      h("div", { class: "cs-head" },
        h("h1", null, title),
        h("div", { class: "cs-actions" },
          h("a", { class: "cs-btn", href: monthHref(year, month - 1), onclick: nav, title: "Previous month", "aria-label": "Previous month" }, icon("back")),
          h("a", { class: "cs-btn", href: "/calendar/view.php?view=month", onclick: nav }, "Today"),
          h("a", { class: "cs-btn", href: monthHref(year, month + 1), onclick: nav, title: "Next month", "aria-label": "Next month" }, icon("chevron")),
          h("a", { class: "cs-btn ghost", href: `${monthHref(year, month)}#original`, title: "Open the calendar on the original site" }, icon("external"), "Original")
        )
      ),
      grid,
      agenda
    );
    try {
      const m = await state.lms.month(year, month);
      if (token === renderToken) drawMonth(grid, agenda, m);
    } catch (err) {
      if (!failed(err) && token === renderToken) grid.replaceChildren(h("p", { class: "cs-empty" }, `Could not load the calendar: ${err.message}`));
    }
  }

  function drawMonth(grid, agenda, m) {
    const now = Date.now();
    const toDay = (e) => {
      e.preventDefault();
      document.getElementById(e.currentTarget.getAttribute("href").slice(1)).scrollIntoView({ behavior: "smooth", block: "center" });
    };
    const pad = (n) => Array.from({ length: n }, () => h("div", { class: "cs-day pad" }));
    const cells = m.weeks.flatMap((w) => [
      ...pad(w.pre),
      ...w.days.map((d) => {
        const anchor = `#cs-day-${d.mday}`;
        const cls = ["cs-day", d.today && "today", d.weekend && "weekend", d.time + 86400000 <= now && "past"].filter(Boolean).join(" ");
        return h("div", { class: cls },
          d.events.length ? h("a", { class: "cs-mday", href: anchor, onclick: toDay }, d.mday) : h("span", { class: "cs-mday" }, d.mday),
          d.events.slice(0, 3).map((e) => h("a", { class: `cs-ev t-${e.type}`, href: e.url, title: [e.name, e.course].filter(Boolean).join(" · ") }, e.name)),
          d.events.length > 3 ? h("a", { class: "cs-more", href: anchor, onclick: toDay }, `+${d.events.length - 3} more`) : null
        );
      }),
      ...pad(w.post),
    ]);
    grid.replaceChildren(...m.daynames.map((n) => h("div", { class: "cs-dow" }, n)), ...cells);

    const days = m.weeks.flatMap((w) => w.days).filter((d) => d.events.length);
    agenda.hidden = false;
    agenda.replaceChildren(
      h("h2", { class: "cs-h2" }, icon("clock"), "This month"),
      days.length
        ? h("ul", { class: "cs-list" },
            days.flatMap((d) =>
              d.events.map((e, i) =>
                h("li", { class: "cs-row" + (e.time < now ? " past" : ""), id: i === 0 ? `cs-day-${d.mday}` : null },
                  h("span", { class: "cs-date" }, fmtWhen(e.time)),
                  h("a", { class: "cs-name", href: e.url }, e.name),
                  h("span", { class: "cs-meta" }, [e.what, e.course].filter(Boolean).join(" · "))
                )
              )
            )
          )
        : h("p", { class: "cs-empty" }, "Nothing on the calendar this month.")
    );
  }

  // ----------------------------------------------------------------- search

  function onSearch() {
    state.query = searchInput.value.trim();
    if (state.query) renderSearch();
    else render(state.route);
  }

  function renderSearch() {
    renderToken++;
    const terms = state.query.toLowerCase().split(/\s+/).filter(Boolean);
    const courses = ((store.get("courses") || {}).list || []);
    const results = [];
    let indexed = 0;
    for (const sub of subjects(courses)) {
      if (terms.every((t) => `${sub.title} ${sub.code}`.toLowerCase().includes(t))) results.push({ course: sub.main });
    }
    for (const c of courses) {
      const tree = store.get(`course:${c.id}`);
      if (!tree) continue;
      indexed++;
      for (const s of tree.sections) {
        for (const it of s.items || []) {
          if (it.modname === "label") continue;
          const kind = ASSESS_KINDS.find(([k]) => k === assessKind(it, s));
          const hay = `${it.name} ${s.name} ${c.title} ${kindLabel(it)} ${kind ? kind[2] : ""}`.toLowerCase();
          if (terms.every((t) => hay.includes(t))) results.push({ course: c, section: s, item: it });
        }
      }
    }
    document.title = `“${state.query}” · CULMS`;
    const status = h("span", { class: "cs-muted" });
    const top = results.slice(0, 300);
    main.replaceChildren(
      h("div", { class: "cs-head" },
        h("h1", null, `Results for “${state.query}”`),
        h("div", { class: "cs-actions" },
          status,
          indexed < courses.length
            ? h("button", { class: "cs-btn", onclick: () => indexAll(status) }, icon("refresh"), `Search all ${courses.length} courses`)
            : null
        )
      ),
      indexed < courses.length
        ? h("p", { class: "cs-muted" }, `Searching ${indexed} of ${courses.length} courses — the rest have not been opened yet.`)
        : "", // replaceChildren would print a null as "null"
      top.length
        ? h("div", { class: "cs-card cs-results" },
            top.map((r) =>
              r.item
                ? itemRow(r.item, `${r.course.title}${r.course.isCont ? " (CONT)" : ""} › ${r.section.name}`)
                : h("a", { class: "cs-course", href: `/course/view.php?id=${r.course.id}`, onclick: nav },
                    h("span", { class: "cs-course-title" }, r.course.title, r.course.isCont ? h("span", { class: "cs-chip" }, "CONT") : null),
                    h("span", { class: "cs-meta" }, "Course"),
                    icon("chevron", "cs-go"))
            )
          )
        : h("p", { class: "cs-empty" }, "Nothing matches.")
    );
  }

  start().catch((err) => {
    console.error("[CULMS Simple]", err);
    html.classList.remove("culms-pending");
  });
})();
