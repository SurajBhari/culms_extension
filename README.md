# CULMS Simple

A Chrome extension that turns [lms.cuchd.in](https://lms.cuchd.in/my/) into a
plain list: **your courses → units → chapters → files**. It shows the same tree
that [culms-connector](https://github.com/SurajBhari/culms-connector) serves
over SFTP, but inside the browser and with no server of any kind. It only talks
to lms.cuchd.in, using the session you already logged in with.

## Install

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick this folder (the one with `manifest.json`).
4. Log in to CUIMS as usual and open the LMS. The dashboard now shows the
   simple view.

It works in any Chromium browser: Chrome, Edge, Brave, Opera.

## What it does

When a page finishes loading, the extension reads what it needs out of it (the
session key, your name, the course's list of sections), clears the Moodle page,
and draws its own in its place.

- **Dashboard** (`/my/`, `/my/courses.php`, `/`): what is due in the next 30
  days, with overdue work in red, then every course you are enrolled in.
  `CONT_` content courses are tagged **CONT**, as the connector does.
- **Course** (`/course/view.php?id=…`): every unit with its chapters on one
  page, instead of one tab at a time. Chips at the top jump to a unit, and each
  unit shows how many files it has. Empty chapters are hidden.
  - **Files** open in a new tab. The download button goes past CU's Office
    viewer to the original `.pptx`/`.docx` and shows the file size.
  - **Folders** open in place to list their files.
  - **Links** go straight to the target. Forums, quizzes and assignments link to
    their Moodle page. Restricted items carry a lock.
  - **Material only** hides forums, quizzes and assignments, leaving files,
    folders, links and pages.
- **Search** (press `/`) covers every course you have opened. **Refresh all**
  on the dashboard loads all of them, so search covers everything.
- Every other page (a quiz, a forum thread, grades) stays as Moodle draws it,
  with a **Simple view** button in the corner that takes you back.

Course trees are cached in the browser's `localStorage` for lms.cuchd.in, so a
course you have opened before shows up straight away. It is refreshed when it is
more than an hour old, or when you press **Refresh**.

## Turning it off

- **Original site** in the header (or the footer link) switches the simple view
  off. A **Simple view** button then appears on the dashboard to switch it back
  on.
- To see one course the normal way, use the **Original** button on that course
  (it adds `#original` to the URL).
- Or disable the extension in `chrome://extensions`.

## Privacy

- It makes no network requests except same-origin ones to `lms.cuchd.in`. There
  is no analytics, no remote code and no other server.
- It never sees your password. It relies on the `MoodleSession` cookie the
  browser already has, which is HttpOnly, so the extension cannot read it
  either.
- It asks for no extension permissions. The only thing it touches outside the
  page is the cache in `localStorage`, which lives on your machine.
- It only reads. It never posts to a forum, submits work or changes anything on
  the LMS.

When your session expires, a banner asks you to log in again through CUIMS.
The captcha is still yours to solve.

## Development

```
src/early.js   runs at document_start: hides the page on routes it will replace
src/parse.js   HTML parsers, ported from culms-connector's lms/parse.py
src/lms.js     same-origin requests: AJAX service, course pages, file resolution
src/app.js     the simple view itself
src/simple.css styles, all scoped so Moodle's own pages are left alone
```

After editing, press the reload button on the extension's card in
`chrome://extensions`, then reload the LMS tab.

### Tests

```bash
npm install
npx playwright install chromium
npm test
```

The test loads the unpacked extension into Chromium and points
`lms.cuchd.in` at a local HTTPS mock built from pages captured off the live
site (`test/fixtures/`, borrowed from culms-connector). It goes through the
dashboard, opening a course, downloads (including the Office viewer),
folders, search, session expiry, switching the view off and on, and a phone
width and dark-mode render. It also checks that the extension never requested
any host other than lms.cuchd.in. Screenshots go to `test/out/`.

The mock is only as good as the captures. The extension has not yet been run
against the live site, so if CU changes its theme or course format, the
parsers in `src/parse.js` are the place to look.
