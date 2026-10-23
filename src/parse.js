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
      });
    }
    return out;
  }

  // CU's Office viewer (local/officeviewer) keeps the real pluginfile URL only
  // on its "Download original file" button; the iframe is a converted PDF.
  function viewerDownloadUrl(doc) {
    const a = doc.querySelector("a[href][download]");
    return a ? a.href : null;
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

  CULMS.parse = { toDoc, config, userName, sections, activities, viewerDownloadUrl, folderFiles, isLoginPage, squash };
})();
