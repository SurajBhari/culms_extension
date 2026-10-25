// HTML parsers for CULMS (Moodle 5.0, onetopic course format). Ported from
// culms-connector's lms/parse.py so both read the site the same way; every
// function takes a Document, either the live page or one built by DOMParser.
(() => {
  const CULMS = (globalThis.CULMS = globalThis.CULMS || {});

  const SESSKEY = /"sesskey":"([^"]+)"/;
  const USER_ID = /"userId":(\d+)/;
  const MOD_URL = /\/mod\/(\w+)\/view\.php\?id=(\d+)/;
  const SECTION_URL = /[?&]section=(\d+)/;
  const FILE_ICON = /\/f\/([\w-]+)/;
  const NBSP_INDENT = /^[ \s]*/;

  const GRADE = /(\d+(?:\.\d+)?)\s*(?:\/|out of)\s*(\d+(?:\.\d+)?)/i;

  const squash = (s) => (s || "").replace(/\s+/g, " ").trim();

  const toDoc = (html) => new DOMParser().parseFromString(html, "text/html");

  function scriptText(doc) {
    return Array.from(doc.querySelectorAll("script:not([src])"), (s) => s.textContent).join("\n");
  }

  // M.cfg lives in an inline script. A content script cannot read the page's
  // JS globals, so it is read out of the markup, exactly as the connector does.
  function config(doc) {
    const text = scriptText(doc);
    const key = SESSKEY.exec(text) || SESSKEY.exec(doc.documentElement.innerHTML);
    const input = doc.querySelector('input[name="sesskey"]');
    const uid = USER_ID.exec(text);
    const loggedIn =
      (uid && Number(uid[1]) > 1) || !!doc.querySelector('a[href*="/login/logout.php"]');
    return {
      sesskey: key ? key[1] : input ? input.value : null,
      userId: uid ? Number(uid[1]) : null,
      loggedIn: !!loggedIn,
    };
  }

  function userName(doc) {
    // Moodle 5 keeps the full name only in the avatar's title in the user menu.
    const avatar = doc.querySelector(
      "#user-menu-toggle .userinitials[title], #user-menu-toggle img[title], .usermenu .userinitials[title]"
    );
    let name = avatar ? avatar.getAttribute("title") : "";
    if (!name) {
      const el = doc.querySelector(".usermenu .usertext, .logininfo a[href*='/user/profile.php']");
      name = el ? el.textContent : "";
    }
    return squash(name.replace(/^Picture of /i, "")).replace(/\s*\.$/, "");
  }

  // Section list. The jump menu holds every section with chapters indented by
  // four &nbsp; per level; the tab strip only holds the current unit's
  // chapters, so it is the fallback. Section numbers are not contiguous.
  function sections(doc) {
    const out = [];
    const seen = new Set();
    const add = (number, name, level) => {
      if (seen.has(number) || !name) return;
      seen.add(number);
      out.push({ number, name, level });
    };

    for (const opt of doc.querySelectorAll("select.jumpmenu option, #sectionmenu option")) {
      const m = SECTION_URL.exec(opt.value || "");
      if (!m) continue;
      const indent = NBSP_INDENT.exec(opt.textContent)[0].replace(/[^ ]/g, "").length;
      add(Number(m[1]), squash(opt.textContent), Math.floor(indent / 4));
    }
    if (out.length) return out;

    for (const a of doc.querySelectorAll(".format_onetopic-tabs a[href]")) {
      const m = SECTION_URL.exec(a.getAttribute("href"));
      if (!m) continue;
      const li = a.closest("li");
      const lvl = li && /tab_level_(\d+)/.exec(li.className);
      add(Number(m[1]), squash(a.textContent), lvl ? Number(lvl[1]) : 0);
    }
    if (out.length) return out.sort((a, b) => a.number - b.number);

    // Formats that render every section on one page (topics, weeks).
    for (const li of doc.querySelectorAll("li.section[data-number]")) {
      const title = li.querySelector(".sectionname, h3, [data-for='section_title']");
      const n = Number(li.dataset.number);
      add(n, squash(title && title.textContent) || (n === 0 ? "General" : `Section ${n}`), 0);
    }
    return out;
  }

  function activityName(li, a) {
    const inst = (a && a.querySelector(".instancename")) || li.querySelector(".instancename");
    if (inst) {
      // Moodle appends the module type (" File", " Forum") in a visually
      // hidden span; drop it rather than strip trailing words by regex.
      const clone = inst.cloneNode(true);
      clone.querySelectorAll(".accesshide, .visually-hidden, .sr-only").forEach((n) => n.remove());
      const name = squash(clone.textContent);
      if (name) return name;
    }
    const card = li.querySelector("[data-activityname]");
    return card ? squash(card.dataset.activityname) : "";
  }

  // "Saturday, 12 September 2026, 11:47 AM" -> ms, or null.
  function moodleDate(text) {
    const parts = squash(text).split(", ");
    const t = Date.parse((parts.length > 2 ? parts.slice(1) : parts).join(" "));
    return Number.isNaN(t) ? null : t;
  }

  // The "Opened: ... / Due: ..." lines under a quiz or assignment.
  function activityDates(li) {
    const out = [];
    for (const row of li.querySelectorAll('[data-region="activity-dates"] > div')) {
      const strong = row.querySelector("strong");
      if (!strong) continue;
      const label = squash(strong.textContent).replace(/:$/, "");
      const time = moodleDate(row.textContent.replace(strong.textContent, ""));
      if (label && time) out.push({ label, time });
    }
    return out;
  }

  // Completion as the course page shows it: true (Done), false (To do), or
  // null when the activity does not track completion.
  function activityDone(li) {
    const manual = li.querySelector('[data-action="toggle-manual-completion"]');
    if (manual) return /undo/.test(manual.dataset.toggletype || "");
    const auto = li.querySelector('[data-region="completionrequirements"] .dropdown-toggle, [data-region="completion-info"] .dropdown-toggle');
    if (!auto) return null;
    const t = squash(auto.textContent).toLowerCase();
    return t === "done" ? true : t === "to do" ? false : null;
  }

  // Activities of one section. When the page carries the section's own <li>
  // only its activities count, so a format that also renders neighbouring
  // sections does not leak them in.
  function activities(doc, number) {
    let scope = doc;
    if (number !== undefined && number !== null) {
      const sec = doc.querySelector(`li.section[data-number="${number}"], #section-${number}`);
      if (sec) scope = sec;
    }
    const out = [];
    const seen = new Set();
    for (const li of scope.querySelectorAll("li.activity")) {
      const typeMatch = /modtype_(\w+)/.exec(li.className);
      const modname = typeMatch ? typeMatch[1] : "";
      const a =
        li.querySelector(".activityname a[href], .activitytitle a[href]") ||
        Array.from(li.querySelectorAll("a[href]")).find((x) => MOD_URL.test(x.getAttribute("href")));
      const href = a ? a.getAttribute("href") : "";
      const m = MOD_URL.exec(href);
      // The <li> names its own module; a link inside it may point at another
      // one (a label linking to a file), so it only stands in when needed.
      const cmid = Number(li.dataset.id || (li.id || "").replace("module-", "")) || (m ? Number(m[2]) : 0);
      if (!cmid || seen.has(cmid)) continue;

      if (modname === "label") {
        const body = li.querySelector(".activity-altcontent, .contentwithoutlink, .no-overflow") || li;
        const text = squash(body.textContent);
        const links = Array.from(body.querySelectorAll("a[href]"))
          .map((x) => ({ url: x.href, name: squash(x.textContent) || x.href }))
          .filter((x) => /^https?:/.test(x.url));
        if (!text && !links.length) continue;
        seen.add(cmid);
        out.push({ cmid, modname, name: text.slice(0, 300), url: "", links });
        continue;
      }

      const name = activityName(li, a);
      if (!name) continue;
      seen.add(cmid);
      const icon = li.querySelector("img.activityicon, .activityiconcontainer img");
      const ft = icon ? FILE_ICON.exec(icon.getAttribute("src") || "") : null;
      out.push({
        cmid,
        modname: modname || (m ? m[1] : ""),
        name,
        url: a ? a.href : "",
        filetype: ft ? ft[1] : "",
        restricted: !!li.querySelector(".availabilityinfo, .isrestricted"),
        dates: activityDates(li),
        done: activityDone(li),
      });
    }
    return out;
  }

  // CU's Office viewer (local/officeviewer) keeps the real pluginfile URL only
  // on its "Download original file" button; the iframe is a converted PDF.
  // A file Moodle shows embedded (video, image) or behind a "click to open"
  // page has its pluginfile URL on the player or the link instead.
  function viewerDownloadUrl(doc) {
    const a = doc.querySelector("a[href][download]");
    if (a) return a.href;
    const main = doc.querySelector('[role="main"]') || doc;
    const link = main.querySelector('a[href*="/pluginfile.php/"]');
    if (link) return link.href;
    const media = main.querySelector('video source[src*="/pluginfile.php/"], audio source[src*="/pluginfile.php/"], video[src*="/pluginfile.php/"], img[src*="/pluginfile.php/"], object[data*="/pluginfile.php/"], embed[src*="/pluginfile.php/"]');
    if (!media) return null;
    return new URL(media.getAttribute("src") || media.getAttribute("data"), location.href).href;
  }

  // An assignment's own page: "Submission status", "Grading status" and the
  // grade, read off its status and feedback tables.
  function assignStatus(doc) {
    const rows = {};
    for (const tr of doc.querySelectorAll('[role="main"] table tr')) {
      const th = tr.querySelector("th");
      const td = tr.querySelector("td");
      if (th && td) rows[squash(th.textContent).toLowerCase()] = squash(td.textContent);
    }
    const grade = GRADE.exec(rows.grade || "");
    return {
      kind: "assign",
      submission: rows["submission status"] || "",
      grading: rows["grading status"] || "",
      grade: grade ? `${Number(grade[1])}/${Number(grade[2])}` : "",
    };
  }

  // A quiz's own page: the attempts so far (CU's theme draws them as cards,
  // stock Moodle as a table) and the grade once it is released.
  function quizStatus(doc) {
    const main = doc.querySelector('[role="main"]') || doc;
    const states = [];
    for (const box of main.querySelectorAll(".moove-infobox")) {
      const title = box.querySelector(".moove-infobox-title");
      if (title && /^(status|state)$/i.test(squash(title.textContent))) {
        states.push(squash(box.textContent.replace(title.textContent, "")));
      }
    }
    if (!states.length) {
      for (const table of main.querySelectorAll("table.quizattemptsummary")) {
        const head = Array.from(table.querySelectorAll("thead th"), (th) => squash(th.textContent).toLowerCase());
        const col = head.findIndex((x) => x === "status" || x === "state");
        if (col < 0) continue;
        for (const tr of table.querySelectorAll("tbody tr")) {
          const cell = tr.children[col];
          if (cell) states.push(squash(cell.textContent));
        }
      }
    }
    const feedback = main.querySelector("#feedback");
    const grade = feedback ? GRADE.exec(feedback.textContent) : null;
    return {
      kind: "quiz",
      attempts: states.length,
      finished: states.filter((x) => /finished|submitted/i.test(x)).length,
      inProgress: states.some((x) => /in progress/i.test(x)),
      grade: grade ? `${Number(grade[1])}/${Number(grade[2])}` : "",
    };
  }

  const contentRoot = (doc) =>
    doc.querySelector('[role="main"] .box.generalbox') || doc.querySelector('[role="main"]') || doc.body;

  const PLUGINFILE = ["a[href", "img[src", "video[src", "audio[src", "source[src", "embed[src", "object[data"]
    .map((x) => `${x}*="/pluginfile.php/"]`)
    .join(", ");

  // Files a Page or Book carries in its text: attachments it links to and
  // images or media it embeds, all served from pluginfile.php.
  function contentFiles(doc) {
    const out = [];
    const seen = new Set();
    for (const el of contentRoot(doc).querySelectorAll(PLUGINFILE)) {
      const url = new URL(el.getAttribute("href") || el.getAttribute("src") || el.getAttribute("data"), location.href).href.split("#")[0];
      if (seen.has(url)) continue;
      seen.add(url);
      let name = new URL(url).pathname.split("/").pop();
      try {
        name = decodeURIComponent(name);
      } catch {}
      out.push({ name: name || "file", url });
    }
    return out;
  }

  // The readable body of a Page activity or a book's print view, as Markdown,
  // so it can go into a zip next to the files. Embedded videos become links.
  // `local` maps a pluginfile URL to where its copy sits next to the Markdown.
  function contentMarkdown(doc, local = {}) {
    const root = contentRoot(doc);
    const here = (raw) => {
      try {
        return local[new URL(raw, location.href).href.split("#")[0]];
      } catch {
        return undefined;
      }
    };
    const walk = (node) => {
      if (node.nodeType === 3) return node.textContent.replace(/\s+/g, " ");
      if (node.nodeType !== 1) return "";
      const tag = node.tagName.toLowerCase();
      if (/^(script|style|noscript|button|form|nav)$/.test(tag)) return "";
      const inner = () => Array.from(node.childNodes, walk).join("");
      if (/^h[1-6]$/.test(tag)) return `\n\n${"#".repeat(Number(tag[1]))} ${squash(inner())}\n\n`;
      if (tag === "br") return "\n";
      if (tag === "li") return `\n- ${squash(inner())}`;
      if (tag === "a") {
        const text = squash(inner());
        const href = node.href || "";
        const copy = here(node.getAttribute("href") || "");
        if (copy) return `[${text || copy}](<${copy}>)`;
        return /^https?:/.test(href) && text && text !== href ? `[${text}](${href})` : text || href;
      }
      if (tag === "iframe" || tag === "video" || tag === "audio" || tag === "embed" || tag === "object") {
        const src = node.getAttribute("src") || node.getAttribute("data") || (node.querySelector("source") || {}).src || "";
        const copy = src && here(src);
        if (copy) return `\n\n[${tag === "audio" ? "Audio" : tag === "video" ? "Video" : "File"}: ${copy}](<${copy}>)\n\n`;
        const yt = /youtube(?:-nocookie)?\.com\/embed\/([\w-]+)/.exec(src);
        return src ? `\n\nVideo: ${yt ? `https://www.youtube.com/watch?v=${yt[1]}` : src}\n\n` : "";
      }
      if (tag === "img") {
        const copy = here(node.getAttribute("src") || "");
        if (copy) return `![${squash(node.alt)}](<${copy}>)`;
        return node.alt ? `[image: ${squash(node.alt)}]` : "";
      }
      if (tag === "tr") return `\n| ${Array.from(node.children, (c) => squash(walk(c))).join(" | ")} |`;
      if (/^(p|div|section|article|table|ul|ol|blockquote|pre|figure)$/.test(tag)) return `\n\n${inner()}\n\n`;
      return inner();
    };
    return walk(root).replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  // Files inside a Folder activity.
  function folderFiles(doc) {
    const out = [];
    const seen = new Set();
    for (const a of doc.querySelectorAll('[role="main"] a[href*="/pluginfile.php/"], .foldertree a[href*="/pluginfile.php/"]')) {
      const url = a.href.split("#")[0];
      if (seen.has(url)) continue;
      seen.add(url);
      const name = squash(a.textContent) || decodeURIComponent(url.split("?")[0].split("/").pop());
      out.push({ name, url });
    }
    return out;
  }

  function isLoginPage(url) {
    return /\/login\/(index\.php)?/.test(new URL(url, location.href).pathname);
  }

  CULMS.parse = { toDoc, config, userName, sections, activities, viewerDownloadUrl, folderFiles, isLoginPage, squash, assignStatus, quizStatus, contentMarkdown, contentFiles, moodleDate };
})();
