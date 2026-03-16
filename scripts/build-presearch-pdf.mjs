import fs from 'fs/promises';
import path from 'path';
import { chromium } from '@playwright/test';

const ROOT = process.cwd();
const INPUT = path.join(ROOT, 'PRESEARCH.md');
const OUTPUT = path.join(ROOT, 'PRESEARCH.pdf');

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderInline(text) {
  let out = escapeHtml(text);

  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  return out;
}

function isTableSeparator(line) {
  return /^\|?(?:\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/.test(line.trim());
}

function parseTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim());
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let i = 0;
  let inCode = false;
  let codeLang = '';
  let paragraph = [];
  let listType = null;

  function flushParagraph() {
    if (paragraph.length === 0) return;
    html.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
    paragraph = [];
  }

  function closeList() {
    if (!listType) return;
    html.push(listType === 'ul' ? '</ul>' : '</ol>');
    listType = null;
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (inCode) {
      if (trimmed.startsWith('```')) {
        html.push('</code></pre>');
        inCode = false;
        codeLang = '';
      } else {
        html.push(`${escapeHtml(line)}\n`);
      }
      i += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      flushParagraph();
      closeList();
      codeLang = trimmed.slice(3).trim();
      html.push(`<pre><code class="${escapeHtml(codeLang)}">`);
      inCode = true;
      i += 1;
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      closeList();
      i += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    const tableHeader = i + 1 < lines.length && trimmed.includes('|') && isTableSeparator(lines[i + 1]);
    if (tableHeader) {
      flushParagraph();
      closeList();
      const headers = parseTableRow(line);
      html.push('<table><thead><tr>');
      for (const header of headers) {
        html.push(`<th>${renderInline(header)}</th>`);
      }
      html.push('</tr></thead><tbody>');
      i += 2;
      while (i < lines.length && lines[i].trim().includes('|') && !isTableSeparator(lines[i])) {
        const cells = parseTableRow(lines[i]);
        html.push('<tr>');
        for (const cell of cells) {
          html.push(`<td>${renderInline(cell)}</td>`);
        }
        html.push('</tr>');
        i += 1;
      }
      html.push('</tbody></table>');
      continue;
    }

    const ulItem = trimmed.match(/^-\s+(.*)$/);
    if (ulItem) {
      flushParagraph();
      if (listType && listType !== 'ul') closeList();
      if (!listType) {
        html.push('<ul>');
        listType = 'ul';
      }
      html.push(`<li>${renderInline(ulItem[1])}</li>`);
      i += 1;
      continue;
    }

    const olItem = trimmed.match(/^\d+\.\s+(.*)$/);
    if (olItem) {
      flushParagraph();
      if (listType && listType !== 'ol') closeList();
      if (!listType) {
        html.push('<ol>');
        listType = 'ol';
      }
      html.push(`<li>${renderInline(olItem[1])}</li>`);
      i += 1;
      continue;
    }

    const blockquote = trimmed.match(/^>\s?(.*)$/);
    if (blockquote) {
      flushParagraph();
      closeList();
      html.push(`<blockquote>${renderInline(blockquote[1])}</blockquote>`);
      i += 1;
      continue;
    }

    if (listType) closeList();
    paragraph.push(trimmed);
    i += 1;
  }

  flushParagraph();
  closeList();

  return html.join('\n');
}

function buildHtml(bodyHtml) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>FleetGraph Pre-Search</title>
    <style>
      :root {
        color-scheme: light;
        --text: #18212f;
        --muted: #5a6472;
        --border: #d7dee8;
        --surface: #ffffff;
        --surface-alt: #f4f7fb;
        --accent: #0f4c81;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
        color: var(--text);
        background: var(--surface);
        line-height: 1.5;
        font-size: 11pt;
      }
      main {
        max-width: 8.5in;
        margin: 0 auto;
        padding: 0.55in;
      }
      h1, h2, h3, h4, h5, h6 {
        color: #0c2d48;
        margin: 1.1em 0 0.4em;
        line-height: 1.2;
        page-break-after: avoid;
      }
      h1 {
        font-size: 24pt;
        border-bottom: 2px solid var(--border);
        padding-bottom: 0.14in;
        margin-top: 0;
      }
      h2 { font-size: 18pt; }
      h3 { font-size: 14pt; }
      h4 { font-size: 12pt; }
      p, ul, ol, table, pre, blockquote {
        margin: 0 0 0.14in;
      }
      ul, ol {
        padding-left: 0.24in;
      }
      li { margin: 0.04in 0; }
      a {
        color: var(--accent);
        text-decoration: none;
      }
      code {
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 0.95em;
        background: var(--surface-alt);
        padding: 0.02in 0.04in;
        border-radius: 4px;
      }
      pre {
        overflow: hidden;
        white-space: pre-wrap;
        word-break: break-word;
        background: var(--surface-alt);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 0.14in;
      }
      pre code {
        background: transparent;
        padding: 0;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        page-break-inside: avoid;
      }
      th, td {
        border: 1px solid var(--border);
        padding: 0.08in;
        vertical-align: top;
        word-break: break-word;
      }
      th {
        background: #e9f0f7;
        text-align: left;
      }
      blockquote {
        border-left: 4px solid var(--border);
        margin-left: 0;
        padding-left: 0.14in;
        color: var(--muted);
      }
      strong { color: #0f1723; }
      @page {
        size: Letter;
        margin: 0.45in;
      }
    </style>
  </head>
  <body>
    <main>
      ${bodyHtml}
    </main>
  </body>
</html>`;
}

async function main() {
  const markdown = await fs.readFile(INPUT, 'utf8');
  const bodyHtml = markdownToHtml(markdown);
  const html = buildHtml(bodyHtml);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.setContent(html, { waitUntil: 'load' });
  await page.pdf({
    path: OUTPUT,
    format: 'Letter',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate:
      '<div style="width:100%;font-size:8px;padding:0 24px;color:#667085;display:flex;justify-content:flex-end;"><span class="pageNumber"></span>/<span class="totalPages"></span></div>',
    margin: {
      top: '0.45in',
      right: '0.45in',
      bottom: '0.55in',
      left: '0.45in',
    },
  });

  await browser.close();
  const stats = await fs.stat(OUTPUT);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT)} (${stats.size} bytes)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
