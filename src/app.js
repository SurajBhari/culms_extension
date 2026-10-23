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

  // Moodle's file icon name -> short label and colour class.
  const FILE_KINDS = {
    pdf: ["PDF", "k-pdf"],
    powerpoint: ["PPT", "k-ppt"],
    document: ["DOC", "k-doc"],
    spreadsheet: ["XLS", "k-xls"],
    archive: ["ZIP", "k-zip"],
    image: ["IMG", "k-img"],
    mpeg: ["VID", "k-vid"],
    video: ["VID", "k-vid"],
    audio: ["AUD", "k-vid"],
    text: ["TXT", "k-txt"],
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
    attendance: ["assign", "Attendance"],
    feedback: ["quiz", "Feedback"],
    choice: ["quiz", "Poll"],
    lesson: ["book", "Lesson"],
  };
  const isFile = (it) => it.modname === "resource";
  const isMaterial = (it) => it.modname === "resource" || it.modname === "folder" || it.modname === "url" || it.modname === "page" || it.modname === "book";

  function kindTile(it) {
    if (isFile(it)) {
      const [label, cls] = FILE_KINDS[it.filetype] || ["FILE", "k-file"];
      return h("span", { class: `cs-tile ${cls}` }, label);
    }
    const [ic] = MOD_KINDS[it.modname] || ["other"];
    return h("span", { class: "cs-tile k-mod" }, icon(ic));
  }

  function kindLabel(it) {
    if (isFile(it)) return (FILE_KINDS[it.filetype] || ["File"])[0] === "FILE" ? "File" : FILE_KINDS[it.filetype][0];
    return (MOD_KINDS[it.modname] || [null, it.modname ? it.modname[0].toUpperCase() + it.modname.slice(1) : "Activity"])[1];
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
        h("a", { href: "/calendar/view.php?view=upcoming" }, "Calendar"),
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
      h("h2", { class: "cs-h2" }, icon("clock"), "Due soon"),
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

  function drawCourses(list, courses) {
    if (!courses.length) {
      list.replaceChildren(h("p", { class: "cs-empty" }, "You are not enrolled in any courses."));
      return;
    }
    const sorted = [...courses].sort((a, b) => a.title.localeCompare(b.title) || Number(a.isCont) - Number(b.isCont));
    list.replaceChildren(
      ...sorted.map((c) => {
        const st = courseStats(c.id);
        return h("a", { class: "cs-course", href: `/course/view.php?id=${c.id}`, onclick: nav },
          h("span", { class: "cs-course-title" }, c.title, c.isCont ? h("span", { class: "cs-chip" }, "CONT") : null),
          h("span", { class: "cs-meta" },
            c.code.replace(/^CONT_/i, ""),
            st ? ` · ${st.files} file${st.files === 1 ? "" : "s"}, ${st.items} item${st.items === 1 ? "" : "s"}` : ""
          ),
          icon("chevron", "cs-go")
        );
      })
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
      status.textContent = `All ${courses.length} courses up to date`;
      if (state.route && state.route.name === "home" && !state.query) drawCourses(main.querySelector(".cs-courses"), courses);
      else if (state.query) renderSearch();
    } catch (err) {
      status.textContent = "";
      if (!failed(err)) toast(err.message);
    }
  }

  // ----------------------------------------------------------------- course

  function courseMeta(id) {
    const list = (store.get("courses") || {}).list || [];
    return list.find((c) => c.id === id) || null;
  }

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
    const meta = courseMeta(id);
    const cached = store.get(`course:${id}`);
    const t = meta || cached || (prefill && prefill.title) || { title: `Course ${id}`, code: "" };
    document.title = `${t.title} · CULMS`;

    const filesOnly = store.pref("filesOnly", false);
    const body = h("div", { class: "cs-units" });
    const jump = h("nav", { class: "cs-jump", "aria-label": "Units", hidden: true });
    const status = h("span", { class: "cs-muted" });
    const toggle = h("input", { type: "checkbox", checked: filesOnly || null, onchange: () => {
      store.setPref("filesOnly", toggle.checked);
      html.classList.toggle("files-only", toggle.checked);
    } });
    html.classList.toggle("files-only", filesOnly);

    const refresh = h("button", { class: "cs-btn", onclick: () => load(true) }, icon("refresh"), "Refresh");
    main.replaceChildren(
      h("a", { class: "cs-back", href: "/my/", onclick: nav }, icon("back"), "All courses"),
      h("div", { class: "cs-head" },
        h("div", null,
          h("h1", null, t.title, t.isCont ? h("span", { class: "cs-chip" }, "CONT") : null),
          h("div", { class: "cs-meta" }, (t.code || "").replace(/^CONT_/i, ""))
        ),
        h("div", { class: "cs-actions" },
          status,
          h("label", { class: "cs-switch" }, toggle, "Material only"),
          refresh,
          h("a", { class: "cs-btn ghost", href: `/course/view.php?id=${id}#original`, title: "Open this course on the original site" }, icon("external"), "Original")
        )
      ),
      jump,
      body
    );

    let units = null;
    const draw = (sections) => {
      if (token !== renderToken) return;
      if (!units) units = drawUnits(body, sections, jump);
      else units.update(sections);
    };

    if (cached) {
      draw(cached.sections);
      status.textContent = `Updated ${ago(cached.at)}`;
    } else {
      body.replaceChildren(...skeleton(4));
    }

    const load = async (force) => {
      refresh.disabled = true;
      status.textContent = "Loading…";
      try {
        await fetchCourse(id, meta, force ? null : prefill, (sections) => {
          draw(sections);
          const done = sections.filter((s) => s.items).length;
          if (token === renderToken && done < sections.length) status.textContent = `Loading ${done} / ${sections.length}…`;
        });
        if (token === renderToken) status.textContent = "Up to date";
      } catch (err) {
        if (token !== renderToken) return;
        status.textContent = "";
        if (!failed(err)) toast(`Could not load this course: ${err.message}`);
      } finally {
        refresh.disabled = false;
      }
    };

    if (!cached || prefill || Date.now() - cached.at > STALE_MS) await load(false);
    if (route.section !== null && route.section !== undefined && token === renderToken) {
      const el = document.getElementById(`cs-sec-${route.section}`);
      if (el) el.scrollIntoView({ block: "start" });
    }
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

  function drawUnits(body, sections, jump) {
    const boxes = new Map();
    let shape = "";
    const build = (secs) => {
      boxes.clear();
      shape = secs.map((s) => `${s.number}:${s.level}`).join(",");
      const units = groupUnits(secs);
      // Chips to jump between units; only worth it when there are several.
      jump.hidden = units.length < 3;
      jump.replaceChildren(
        ...units.map((u) =>
          h("a", { href: `#cs-sec-${u.head.number}`, onclick: (e) => {
            e.preventDefault();
            document.getElementById(`cs-sec-${u.head.number}`).scrollIntoView({ behavior: "smooth", block: "start" });
          } }, u.head.name)
        )
      );
      body.replaceChildren(
        ...units.map((u) => {
          const card = h("section", { class: "cs-card cs-unit", id: `cs-sec-${u.head.number}` },
            h("h2", { class: "cs-unit-title" }, u.head.name, h("span", { class: "cs-unit-count" }))
          );
          const own = h("div", { class: "cs-sec" });
          boxes.set(u.head.number, { box: own, sec: u.head, card });
          card.append(own);
          for (const ch of u.chapters) {
            const wrap = h("div", { class: "cs-chapter", id: `cs-sec-${ch.number}` }, h("h3", null, ch.name));
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
    if (it.restricted) meta.append(h("span", { class: "cs-lock" }, icon("lock"), "restricted"));

    const row = h("div", { class: "cs-item" + (isMaterial(it) ? " is-material" : " is-activity"), "data-file": file ? "1" : null },
      kindTile(it),
      h("div", { class: "cs-item-main" },
        h("a", { class: "cs-name", href, target: file || it.modname === "url" ? "_blank" : null, rel: "noopener" }, it.name),
        meta
      )
    );
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
    for (const c of courses) {
      const tree = store.get(`course:${c.id}`);
      const courseHit = terms.every((t) => `${c.title} ${c.code}`.toLowerCase().includes(t));
      if (courseHit) results.push({ course: c });
      if (!tree) continue;
      indexed++;
      for (const s of tree.sections) {
        for (const it of s.items || []) {
          if (it.modname === "label") continue;
          const hay = `${it.name} ${s.name} ${c.title} ${kindLabel(it)}`.toLowerCase();
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
        : null,
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
