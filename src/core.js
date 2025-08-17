import * as pdfjsLib from '../lib/pdf.mjs';

export const HEADER_BOTTOM_Y_PERCENT = 15;

// helpers
export function escapeRegex(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function cleanName(s) {
  return (s||'')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*[-–—•|].*$/, '')
    .replace(/\b(CPF|Matr(í|i)cula|Unidade|Ger(ê|e)ncia)\b.*$/i, '')
    .replace(/[.,;:]+$/, '')
    .trim();
}

// tolera espaços entre letras do rótulo e quebra de linha após o rótulo
export function buildPattern(labelsString) {
  const raw = labelsString.split(',').map(l => l.trim()).filter(Boolean);
  const labels = raw.map(l => l.replace(/:\s*$/, '')); // tira ":" do final, se houver

  // transforma "Gestor" em "G\s*e\s*s\s*t\s*o\s*r\s*" (tolerante a espaços/quebras)
  const fuzzy = (word) => word
    .split('')
    .map(ch => `${escapeRegex(ch)}\\s*`)
    .join('');

  const labelsFuzzy = labels.map(fuzzy).join('|');

  // ":" opcional, espaços, quebra de linha opcional; captura o nome até fim da linha/sep.
  const pattern = `(?:${labelsFuzzy})\\s*:?\\s*(?:\\r?\\n\\s*)?([^\\r\\n;|•\\-–—]+)`;

  return { regex: new RegExp(pattern, 'gi'), labels };
}

export function sanitizePart(s) {
  return (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .trim().replace(/\s+/g, '_')
    .slice(0, 80);
}

// loaders utilitários
const _scriptLoaders = new Map();
function loadScriptOnce(src) {
  if (_scriptLoaders.has(src)) return _scriptLoaders.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Falha ao carregar ' + src));
    document.head.appendChild(s);
  });
  _scriptLoaders.set(src, p);
  return p;
}
async function getJSZip() {
  if (window.JSZip) return window.JSZip;
  await loadScriptOnce('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
  if (!window.JSZip) throw new Error('JSZip não disponível após carregar o script.');
  return window.JSZip;
}
async function ensureTesseract(onLog) {
  if (window.Tesseract) return;
  onLog?.('[OCR] Carregando Tesseract.js...');
  await loadScriptOnce('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
  if (!window.Tesseract) throw new Error('Tesseract não disponível após carregar o script.');
}
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../lib/pdf.worker.mjs', import.meta.url).toString();

// extração
/**
 * @param {File} file
 * @param {boolean} headerOnly
 * @param {boolean} useOCR
 * @param {{onLog?:Function,onProgress?:Function,pattern?:RegExp}} opts
 */
export async function extractTextPerPage(file, headerOnly, useOCR, { onLog, onProgress, pattern } = {}) {
  const url = URL.createObjectURL(file);
  const pdf = await pdfjsLib.getDocument(url).promise;
  const numPages = pdf.numPages;
  const pagesText = [];
  onLog?.(`- Total de páginas detectadas: ${numPages}`);
  onProgress?.(0, 'Lendo páginas...');

  // cópia segura do original, para não bagunçar lastIndex
  const testRe = pattern ? new RegExp(pattern.source, pattern.flags) : null;

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    let allItems = textContent.items;

    if (headerOnly) {
      const headerBottom = viewport.height * (HEADER_BOTTOM_Y_PERCENT/100);
      allItems = allItems.filter(item => item.transform[5] >= (viewport.height - headerBottom));
    }

    // reconstrução com espaços entre itens na MESMA linha
    let fullText = '';
    if (allItems && allItems.length > 0) {
      allItems.sort((a, b) => {
        const dy = Math.abs(a.transform[5] - b.transform[5]);
        if (dy < 2) return a.transform[4] - b.transform[4];
        return b.transform[5] - a.transform[5];
      });
      let lastY = allItems[0].transform[5];
      for (const item of allItems) {
        const y = item.transform[5];
        if (Math.abs(y - lastY) > 5) {
          fullText += '\n';
        } else {
          if (fullText && !/\s$/.test(fullText)) fullText += ' ';
        }
        fullText += item.str;
        lastY = y;
      }
    }

    // OCR se a página estiver “vazia” OU se o regex não encontrou o rótulo
    const needsOCR = useOCR && (
      !fullText.trim() ||
      (testRe && !testRe.test(fullText))
    );

    if (needsOCR) {
      try {
        const scale = 1.8;
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = vp.width; canvas.height = vp.height;
        await page.render({ canvasContext: ctx, viewport: vp }).promise;

        let sourceCanvas = canvas;
        if (headerOnly) {
          const headerBottomPx = vp.height * (HEADER_BOTTOM_Y_PERCENT/100);
          const crop = document.createElement('canvas');
          crop.width = vp.width; crop.height = headerBottomPx;
          crop.getContext('2d').drawImage(canvas, 0, 0, vp.width, headerBottomPx, 0, 0, vp.width, headerBottomPx);
          sourceCanvas = crop;
        }

        await ensureTesseract(onLog);
        onLog?.(`[OCR] Rodando OCR na página ${i}...`);
        const { data } = await window.Tesseract.recognize(sourceCanvas, 'por+eng', {
          logger: m => (m.status && m.progress!=null) ? onProgress?.(undefined, `OCR página ${i}: ${m.status} ${(m.progress*100).toFixed(0)}%`) : null
        });
        const ocrText = (data && data.text) ? data.text : '';

        // se o texto original estava vazio, usa o OCR; senão, usa o OCR só se ele contiver o label
        if (!fullText.trim()) {
          fullText = ocrText;
        } else if (testRe && !testRe.test(fullText) && testRe.test(ocrText)) {
          fullText = ocrText;
        }
      } catch (e) {
        console.warn('Erro OCR página', i, e);
        onLog?.(`[OCR] Erro na página ${i}: ${e.message}`);
      }
    }

    pagesText.push(fullText || '');
    if (i % 5 === 0 || i === numPages) onLog?.(`- Extraídas ${i}/${numPages} páginas...`);
    onProgress?.(Math.round((i/numPages)*50), `Extraindo texto ${i}/${numPages}`);
  }

  try { pdf.cleanup?.(); pdf.destroy?.(); } catch {}
  URL.revokeObjectURL(url);
  return pagesText;
}

// runs/merge
export function detectRuns(pagesText, pattern, onLog) {
  const runs = [];
  let lastRun = null;

  pagesText.forEach((text, pageIndex) => {
    const matches = [...text.matchAll(pattern)]
      .map(m => cleanName(m[1]))
      .filter(Boolean);

    if (matches.length > 0) {
      // escolhe o primeiro nome encontrado (ordem de leitura)
      const key = matches[0];

      if (lastRun) lastRun.end = pageIndex; // termina o anterior
      lastRun = { key, start: pageIndex + 1, end: 0 };
      runs.push(lastRun);

      if (matches.length > 1) {
        onLog?.(`[aviso] ${matches.length} nomes na página ${pageIndex+1}. Mantido o primeiro: "${key}".`);
      }
    }
  });

  if (lastRun) lastRun.end = pagesText.length;
  for (let i = 0; i < runs.length - 1; i++) runs[i].end = runs[i+1].start - 1;
  return runs;
}


export function mergeByKey(runs) {
  const map = new Map(); // key -> Set(pages)
  for (const { key, start, end } of runs) {
    if (!map.has(key)) map.set(key, new Set());
    const set = map.get(key);
    for (let p = start; p <= end; p++) set.add(p);
  }
  const ordered = new Map();
  for (const [key, set] of map) ordered.set(key, [...set].sort((a,b)=>a-b));
  return ordered;
}

// geração
export async function splitAndDownload(
  originalPdfFile,
  mergedRuns,
  { forceZip=false, autoZip=true, zipThreshold=8, onlyKeys=null } = {},
  { onProgress, onLog, getNameMode, getPrefix } = {}
) {
  const { PDFDocument } = PDFLib; // global export da lib (pdf-lib)
  const originalPdfBytes = await originalPdfFile.arrayBuffer();
  const sourcePdfDoc = await PDFDocument.load(originalPdfBytes);

  const outputs = []; // { name, bytes }
  const total = onlyKeys ? onlyKeys.length : mergedRuns.size;
  let done = 0;

  onLog?.('\n\nIniciando geração dos PDFs...');
  for (const [key, pages] of mergedRuns.entries()) {
    if (onlyKeys && !onlyKeys.includes(key)) continue;

    const pdfDoc = await PDFDocument.create();
    const pageIndices = pages.map(p => p - 1);
    const copiedPages = await pdfDoc.copyPages(sourcePdfDoc, pageIndices);
    copiedPages.forEach(page => pdfDoc.addPage(page));
    const pdfBytes = await pdfDoc.save();

    const sanitizedKey = sanitizePart(key || 'sem_nome');
    const originalNameSan = sanitizePart(originalPdfFile.name.replace(/\.pdf$/i, ''));
    const prefixSan       = sanitizePart(getPrefix?.() || '');

    let baseName;
    switch (getNameMode?.() || 'orig') {
      case 'name_only':
        baseName = sanitizedKey; break;
      case 'prefix':
        baseName = (prefixSan ? (prefixSan + '_') : '') + sanitizedKey; break;
      case 'orig':
      default:
        baseName = originalNameSan + '_' + sanitizedKey; break;
    }
    const newFileName = `${baseName || 'arquivo'}.pdf`;

    outputs.push({ name: newFileName, bytes: pdfBytes });

    done++;
    onProgress?.(50 + Math.round((done/total)*40), `Preparando PDFs ${done}/${total}`);
    onLog?.(`\nPDF preparado: ${newFileName} (${pages.length} pág.)`);
  }

  const shouldZip = forceZip || (autoZip && outputs.length >= zipThreshold);

  if (shouldZip) {
    try {
      const JSZip = await getJSZip();
      const zip = new JSZip();
      for (const o of outputs) zip.file(o.name, o.bytes);
      const content = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });
      const zipName = originalPdfFile.name.replace(/\.pdf$/i, '') + '_agrupado.zip';
      saveBlob(content, zipName);
      onLog?.(`\n\nZIP gerado: ${zipName}`);
    } catch (e) {
      onLog?.(`\n[ZIP] Falhou (${e.message}). Baixando PDFs individualmente...`);
      for (const o of outputs) saveBlob(new Blob([o.bytes], { type: 'application/pdf' }), o.name);
    }
  } else {
    for (const o of outputs) saveBlob(new Blob([o.bytes], { type: 'application/pdf' }), o.name);
    onLog?.('\n\nDownloads concluídos!');
  }

  onProgress?.(100, 'Concluído');
}

export function exportCsv(mergedRuns, originalPdfFile, { onlyKeys=null } = {}, onLog) {
  const rows = [['nome','paginas','total_paginas']];
  mergedRuns.forEach((pages, key) => {
    if (onlyKeys && !onlyKeys.includes(key)) return;
    rows.push([key, pages.join(','), pages.length]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const name = originalPdfFile.name.replace(/\.pdf$/i, '') + '_mapa.csv';
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  onLog?.(`\nCSV gerado: ${name}`);
}
