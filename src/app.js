import {
  buildPattern,
  extractTextPerPage,
  detectRuns,
  mergeByKey,
  splitAndDownload,
  exportCsv,
} from './core.js';

// helpers curtinhos para pegar elementos
const id  = (s, r = document) => r.getElementById(s);
const all = (s, r = document) => r.querySelectorAll(s);

// UI agrupada
const UI = {
  html: document.documentElement,
  theme: {
    toggle: id('themeToggle'),
    sun:    id('sunIcon'),
    moon:   id('moonIcon'),
  },
  file: {
    input:    id('pdfFile'),
    dropZone: id('dropZone'),
    name:     id('fileNameDisplay'),
  },
  inputs: {
    labels:     id('labels'),
    namePrefix: id('namePrefix'),
    nameMode:   all('input[name="nameMode"]'),
  },
  toggles: {
    headerOnly: id('headerOnly'),
    ocr:        id('ocrToggle'),
    autoZip:    id('autoZipToggle'),
    selectAll:  id('selectAllToggle'),
  },
  buttons: {
    process:     id('processBtn'),
    downloadZip: id('downloadZipBtn'),
    downloadPdf: id('downloadPdfsBtn'),
    exportCsv:   id('exportCsvBtn'),
  },
  preview: {
    section: id('previewSection'),
    body:    id('previewBody'),
  },
  status: {
    log:    id('log'),
    loader: id('loader'),
    progress: {
      bar:  id('progressBar'),
      text: id('progressText'),
    },
  },
};

// estado
let mergedRunsGlobal = new Map();
let selectedKeys = new Set();

// helpers de UI
function setProgress(pct, text='') {
  const bar = UI.status.progress.bar;
  const now = Number(bar.getAttribute('aria-valuenow')) || 0;
  pct = Math.max(0, Math.min(100, pct || now));
  bar.style.width = `${pct}%`;
  bar.setAttribute('aria-valuenow', String(pct));
  if (text) UI.status.progress.text.textContent = text;
}
function onLogAppend(msg) {
  UI.status.log.textContent += (msg.startsWith('\n') ? '' : '\n') + msg;
}
function updateThemeIcon(isDark) {
  UI.theme.toggle.setAttribute('aria-pressed', String(isDark));
  if (isDark) { UI.theme.moon.classList.remove('hidden'); UI.theme.sun.classList.add('hidden'); }
  else { UI.theme.sun.classList.remove('hidden'); UI.theme.moon.classList.add('hidden'); }
}
function toggleTheme() {
  const willDark = !UI.html.classList.contains('dark');
  UI.html.classList.toggle('dark', willDark);
  localStorage.setItem('theme', willDark ? 'dark' : 'light');
  updateThemeIcon(willDark);
}
function getSelectedNameMode() {
  const el = document.querySelector('input[name="nameMode"]:checked');
  return el ? el.value : 'orig';
}
function updatePrefixState() {
  const on = getSelectedNameMode() === 'prefix';
  UI.inputs.namePrefix.disabled = !on; // tailwind já aplica disabled:opacity-50
}
function fileLooksPdf(file) {
  if (!file) return false;
  if (file.type === 'application/pdf') return true;
  return /\.pdf$/i.test(file.name || '');
}
function refreshSelectAllState() {
  const total = UI.preview.body.querySelectorAll('input[type=checkbox][data-key]').length;
  const selected = UI.preview.body.querySelectorAll('input[type=checkbox][data-key]:checked').length;
  UI.toggles.selectAll.indeterminate = selected > 0 && selected < total;
  UI.toggles.selectAll.checked = selected === total && total > 0;
}

// preview
function renderPreview(mergedRuns) {
  UI.preview.body.innerHTML = '';
  selectedKeys = new Set();

  const frag = document.createDocumentFragment();

  mergedRuns.forEach((pages, key) => {
    const tr = document.createElement('tr');

    const tdSel = document.createElement('td');
    tdSel.className = 'px-4 py-2';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = 'with-svg';
    cb.checked = true;
    cb.dataset.key = key;
    cb.addEventListener('change', () => {
      if (cb.checked) selectedKeys.add(key); else selectedKeys.delete(key);
      refreshSelectAllState();
    });
    tdSel.appendChild(cb);

    const tdNome = document.createElement('td');
    tdNome.className = 'px-4 py-2';
    tdNome.textContent = key || '(sem nome)';

    const tdPag = document.createElement('td');
    tdPag.className = 'px-4 py-2 text-slate-600 dark:text-slate-400 text-sm';
    tdPag.textContent = pages.join(', ');

    const tdCount = document.createElement('td');
    tdCount.className = 'px-4 py-2';
    tdCount.textContent = pages.length;

    tr.appendChild(tdSel); tr.appendChild(tdNome); tr.appendChild(tdPag); tr.appendChild(tdCount);
    frag.appendChild(tr);

    selectedKeys.add(key);
  });

  UI.preview.body.appendChild(frag);

  refreshSelectAllState();
  UI.preview.section.classList.remove('hidden');
  const hasAny = mergedRuns.size > 0;
  UI.buttons.downloadPdf.disabled = !hasAny;
  UI.buttons.downloadZip.disabled = !hasAny;
  UI.buttons.exportCsv.disabled   = !hasAny;
}

// eventos base
document.addEventListener('DOMContentLoaded', () => {
  updateThemeIcon(UI.html.classList.contains('dark'));

  // preferências
  const lsLabels = localStorage.getItem('labels'); if (lsLabels) UI.inputs.labels.value = lsLabels;
  const lsHeader = localStorage.getItem('headerOnly'); if (lsHeader !== null) UI.toggles.headerOnly.checked = lsHeader === 'true';
  const lsOcr = localStorage.getItem('ocrToggle'); if (lsOcr !== null) UI.toggles.ocr.checked = lsOcr === 'true';
  const lsAutoZip = localStorage.getItem('autoZipToggle'); if (lsAutoZip !== null) UI.toggles.autoZip.checked = lsAutoZip === 'true';

  const lsMode = localStorage.getItem('fileNameMode');
  if (lsMode) {
    const m = document.querySelector(`input[name="nameMode"][value="${lsMode}"]`);
    if (m) m.checked = true;
  }
  const lsPrefix = localStorage.getItem('fileNamePrefix');
  if (lsPrefix) UI.inputs.namePrefix.value = lsPrefix;
  updatePrefixState();
});

UI.theme.toggle.addEventListener('click', toggleTheme);

UI.inputs.labels.addEventListener('input', () => localStorage.setItem('labels', UI.inputs.labels.value));
UI.toggles.headerOnly.addEventListener('change', () => localStorage.setItem('headerOnly', String(UI.toggles.headerOnly.checked)));
UI.toggles.ocr.addEventListener('change',        () => localStorage.setItem('ocrToggle',   String(UI.toggles.ocr.checked)));
UI.toggles.autoZip.addEventListener('change',    () => localStorage.setItem('autoZipToggle', String(UI.toggles.autoZip.checked)));

UI.inputs.nameMode.forEach(el => {
  el.addEventListener('change', () => {
    localStorage.setItem('fileNameMode', getSelectedNameMode());
    updatePrefixState();
  });
});
UI.inputs.namePrefix.addEventListener('input', () => {
  localStorage.setItem('fileNamePrefix', UI.inputs.namePrefix.value);
});

// drag & drop + teclado
UI.file.dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  UI.file.dropZone.classList.add('dropzone-active');
});
UI.file.dropZone.addEventListener('dragleave', () => {
  UI.file.dropZone.classList.remove('dropzone-active');
});
UI.file.dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  UI.file.dropZone.classList.remove('dropzone-active');

  const files = e.dataTransfer.files;
  if (files.length > 0 && fileLooksPdf(files[0])) {
    const dt = new DataTransfer();
    dt.items.add(files[0]);
    UI.file.input.files = dt.files;
    UI.file.name.textContent = `Arquivo selecionado: ${files[0].name}`;
  } else {
    alert('Por favor, solte um arquivo PDF válido.');
    UI.file.name.textContent = ''; UI.file.input.value = '';
  }
});
UI.file.dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    UI.file.input.click();
  }
});
UI.file.input.addEventListener('change', (e) => {
  if (e.target.files.length > 0) UI.file.name.textContent = `Arquivo selecionado: ${e.target.files[0].name}`;
  else UI.file.name.textContent = '';
});

// pipeline principal
UI.buttons.process.addEventListener('click', async () => {
  const file = UI.file.input.files[0];
  const labelsString = (UI.inputs.labels.value || '').trim();
  if (!file || !labelsString) { alert('Por favor, selecione um arquivo PDF e insira os rótulos.'); return; }

  UI.status.loader.classList.remove('hidden');
  UI.buttons.process.disabled   = true;
  UI.buttons.downloadPdf.disabled = true;
  UI.buttons.downloadZip.disabled = true;
  UI.buttons.exportCsv.disabled   = true;
  UI.preview.section.classList.add('hidden');
  UI.status.log.textContent = 'Iniciando processamento...';
  setProgress(0, 'Preparando...');

  try {
    const { regex, labels } = buildPattern(labelsString);
    onLogAppend(`\nRótulos de busca: ${labels.join(', ')}`);

    const pagesText = await extractTextPerPage(
      file,
      UI.toggles.headerOnly.checked,
      UI.toggles.ocr.checked,
      {
        onLog: (m) => onLogAppend(m),
        onProgress: (pct, text) => setProgress(pct, text),
        pattern: regex // importante para OCR condicional
      }
    );

    const runs = detectRuns(pagesText, regex, (m) => onLogAppend(m));

    if (runs.length === 0) {
      onLogAppend('\n\nNenhum rótulo/nome encontrado no documento.');
      setProgress(100, 'Concluído (sem ocorrências)');
      return;
    }

    onLogAppend('\n\n--- Ocorrências Detectadas ---');
    runs.forEach(run => { onLogAppend(`Nome: "${run.key}", Páginas: ${run.start}-${run.end}`); });

    const mergedRuns = mergeByKey(runs);
    mergedRunsGlobal = mergedRuns;

    onLogAppend('\n\n--- Nomes Agrupados para Exportação ---');
    mergedRuns.forEach((pages, key) => { onLogAppend(`${key} (Total de ${pages.length} páginas)`); });

    renderPreview(mergedRuns);
    setProgress(60, 'Pronto para exportar');
  } catch (error) {
    console.error('Erro durante o processamento:', error);
    onLogAppend(`\n\nERRO: ${error.message}`);
    setProgress(0, 'Erro');
  } finally {
    UI.status.loader.classList.add('hidden');
    UI.buttons.process.disabled = false;
  }
});

// downloads
UI.buttons.downloadPdf.addEventListener('click', async () => {
  if (!UI.file.input.files[0]) return;
  const keys = Array.from(selectedKeys);
  if (keys.length === 0) { alert('Selecione pelo menos um grupo.'); return; }
  setProgress(65, 'Gerando PDFs...');
  await splitAndDownload(
    UI.file.input.files[0],
    mergedRunsGlobal,
    { forceZip:false, autoZip:UI.toggles.autoZip.checked, zipThreshold:8, onlyKeys:keys },
    {
      onProgress: (pct, text) => setProgress(pct, text),
      onLog: (m) => onLogAppend(m),
      getNameMode: () => document.querySelector('input[name="nameMode"]:checked')?.value || 'orig',
      getPrefix: () => UI.inputs.namePrefix.value || ''
    }
  );
});

UI.buttons.downloadZip.addEventListener('click', async () => {
  if (!UI.file.input.files[0]) return;
  const keys = Array.from(selectedKeys);
  if (keys.length === 0) { alert('Selecione pelo menos um grupo.'); return; }
  setProgress(65, 'Gerando ZIP...');
  await splitAndDownload(
    UI.file.input.files[0],
    mergedRunsGlobal,
    { forceZip:true, autoZip:true, zipThreshold:1, onlyKeys:keys },
    {
      onProgress: (pct, text) => setProgress(pct, text),
      onLog: (m) => onLogAppend(m),
      getNameMode: () => document.querySelector('input[name="nameMode"]:checked')?.value || 'orig',
      getPrefix: () => UI.inputs.namePrefix.value || ''
    }
  );
});

UI.buttons.exportCsv.addEventListener('click', () => {
  if (!UI.file.input.files[0]) return;
  const keys = Array.from(selectedKeys);
  if (keys.length === 0) { alert('Selecione pelo menos um grupo.'); return; }
  exportCsv(mergedRunsGlobal, UI.file.input.files[0], { onlyKeys:keys }, (m) => onLogAppend(m));
  setProgress(100, 'Concluído');
});

// selecionar todos
UI.toggles.selectAll.addEventListener('change', () => {
  const check = UI.toggles.selectAll.checked;
  UI.preview.body.querySelectorAll('input[type=checkbox][data-key]').forEach(cb => {
    cb.checked = check;
    const key = cb.dataset.key;
    if (check) selectedKeys.add(key); else selectedKeys.delete(key);
  });
  refreshSelectAllState();
});
