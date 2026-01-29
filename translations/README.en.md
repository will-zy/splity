# splity

<p align="center">
  <a href="https://will-zy.github.io/splity/">
    <img src="https://img.shields.io/badge/launch-tool-blue?style=flat-square" alt="launch">
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/security-pdf_local_only-green?style=flat-square" alt="security">
  <img src="https://img.shields.io/badge/runtime-100%25_browser-orange?style=flat-square" alt="runtime">
  <img src="https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square" alt="license">
</p>

<p align="center">
  <a href="README.md">português</a> • 
  <a href="README.en.md">english</a> • 
  <a href="README.es.md">español</a> •
  <a href="README.de.md">deutsch</a>
</p>

### what is it?
**`splity`** is a tool for splitting PDFs based on dynamic labels (e.g., names, registration numbers, IDs), with **100% browser-based** processing.

### how to use
1. open the tool: [splity](https://will-zy.github.io/splity/)
2. upload the pdf (drag/drop or select).
3. define the label pattern and view the preview.
4. select groups and export:
   - **separate pdfs**
   - **zip**
   - **csv** (index/report)

---

### known limitations
- very large pdfs may consume significant browser memory.
- password-protected/restricted documents may fail depending on the file.
- if the “label” appears multiple times on the same page, splitting may require a more specific label.

---

### privacy
- **no backend**: github pages only hosts static files (html/css/js).
- **the pdf stays local**: reading via file api and in-memory processing on your device.
- **settings may be saved in `localStorage`** (interface preferences only; does not store the pdf).

> note: the page may make requests only to load its own static files (and libraries via cdn if enabled in the current build). in no case is the **pdf content** sent.

---

### how to audit (devtools → network)
1. open the app and press **f12** (devtools).
2. go to **network** and check “preserve log”.
3. upload a pdf and perform an export.
4. verify:
   - no **POST/PUT** requests exist.
   - no file uploads occur.
   - only app asset downloads (js/css/worker/etc).

---

### development (run locally)
```bash
git clone [https://github.com/will-zy/splity.git](https://github.com/will-zy/splity.git)
cd splity

# serve the folder (recommended due to workers/modules)
python -m http.server 8000
# then open: http://localhost:8000
```

---
### license
distributed under the MIT license. see [LICENSE](https://github.com/will-zy/splity/blob/main/LICENSE_MIT) for more information.
