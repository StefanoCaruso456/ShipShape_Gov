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

function parseMermaidNode(token) {
  const rectMatch = token.match(/^([A-Za-z0-9_]+)\["([^"]+)"\]$/);
  if (rectMatch) {
    return { id: rectMatch[1], label: rectMatch[2], shape: 'rect' };
  }

  const diamondMatch = token.match(/^([A-Za-z0-9_]+)\{"([^"]+)"\}$/);
  if (diamondMatch) {
    return { id: diamondMatch[1], label: diamondMatch[2], shape: 'diamond' };
  }

  const bareMatch = token.match(/^([A-Za-z0-9_]+)$/);
  if (bareMatch) {
    return { id: bareMatch[1], label: bareMatch[1], shape: 'rect' };
  }

  return null;
}

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function wrapSvgText(text, maxChars) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines = [];
  let current = words[0];

  for (let i = 1; i < words.length; i += 1) {
    const next = `${current} ${words[i]}`;
    if (next.length <= maxChars) {
      current = next;
    } else {
      lines.push(current);
      current = words[i];
    }
  }

  lines.push(current);
  return lines;
}

function renderMermaidSvg(mermaidSource) {
  const lines = mermaidSource
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  if (!lines[0]?.startsWith('flowchart')) {
    return null;
  }

  const nodes = new Map();
  const edges = [];
  const discoveryOrder = [];

  function upsertNode(parsed) {
    if (!parsed) return;
    if (!nodes.has(parsed.id)) {
      nodes.set(parsed.id, parsed);
      discoveryOrder.push(parsed.id);
      return;
    }
    const current = nodes.get(parsed.id);
    if ((!current.label || current.label === current.id) && parsed.label) {
      current.label = parsed.label;
    }
    if (current.shape !== 'diamond' && parsed.shape === 'diamond') {
      current.shape = 'diamond';
    }
  }

  for (const line of lines.slice(1)) {
    const edgeMatch = line.match(/^(.+?)\s*-->\s*(?:\|"([^"]+)"\|\s*)?(.+)$/);
    if (!edgeMatch) continue;

    const fromNode = parseMermaidNode(edgeMatch[1].trim());
    const toNode = parseMermaidNode(edgeMatch[3].trim());
    if (!fromNode || !toNode) continue;

    upsertNode(fromNode);
    upsertNode(toNode);

    edges.push({
      from: fromNode.id,
      to: toNode.id,
      label: edgeMatch[2] || '',
    });
  }

  if (nodes.size === 0) return null;

  const incoming = new Map();
  const outgoing = new Map();
  for (const id of nodes.keys()) {
    incoming.set(id, 0);
    outgoing.set(id, []);
  }
  for (const edge of edges) {
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    outgoing.get(edge.from).push(edge);
  }

  const roots = discoveryOrder.filter(id => (incoming.get(id) || 0) === 0);
  const levels = new Map();
  const queue = roots.length > 0 ? [...roots] : [discoveryOrder[0]];
  for (const root of queue) levels.set(root, 0);

  while (queue.length > 0) {
    const current = queue.shift();
    const currentLevel = levels.get(current) || 0;
    for (const edge of outgoing.get(current) || []) {
      const nextLevel = currentLevel + 1;
      if (!levels.has(edge.to) || nextLevel > levels.get(edge.to)) {
        levels.set(edge.to, nextLevel);
      }
      if (!queue.includes(edge.to)) {
        queue.push(edge.to);
      }
    }
  }

  for (const id of discoveryOrder) {
    if (!levels.has(id)) levels.set(id, 0);
  }

  const levelGroups = new Map();
  for (const id of discoveryOrder) {
    const level = levels.get(id) || 0;
    if (!levelGroups.has(level)) levelGroups.set(level, []);
    levelGroups.get(level).push(id);
  }

  const nodeMetrics = new Map();
  for (const [id, node] of nodes.entries()) {
    const width = node.shape === 'diamond'
      ? Math.min(240, Math.max(170, node.label.length * 6.5 + 44))
      : Math.min(300, Math.max(180, node.label.length * 6.2 + 42));
    const textLines = wrapSvgText(node.label, Math.max(16, Math.floor((width - 30) / 7)));
    const height = node.shape === 'diamond'
      ? Math.max(90, textLines.length * 18 + 42)
      : Math.max(62, textLines.length * 18 + 24);
    nodeMetrics.set(id, { width, height, textLines });
  }

  const canvasWidth = 1100;
  const marginX = 70;
  const marginY = 60;
  const rowGap = 118;
  const colGap = 40;
  const positions = new Map();
  const maxLevel = Math.max(...levels.values());

  for (let level = 0; level <= maxLevel; level += 1) {
    const ids = levelGroups.get(level) || [];
    if (ids.length === 0) continue;

    const rowWidth = ids.reduce((sum, id) => sum + nodeMetrics.get(id).width, 0) + (ids.length - 1) * colGap;
    let x = Math.max(marginX, (canvasWidth - rowWidth) / 2);
    const y = marginY + level * rowGap;

    for (const id of ids) {
      const metric = nodeMetrics.get(id);
      positions.set(id, {
        x,
        y,
        cx: x + metric.width / 2,
        cy: y + metric.height / 2,
        ...metric,
      });
      x += metric.width + colGap;
    }
  }

  const canvasHeight = marginY * 2 + (maxLevel + 1) * rowGap + 80;
  const svg = [];
  svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}" role="img" aria-label="FleetGraph flowchart">`);
  svg.push('<defs>');
  svg.push('<marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">');
  svg.push('<path d="M0,0 L12,6 L0,12 z" fill="#5b6b82" />');
  svg.push('</marker>');
  svg.push('</defs>');
  svg.push('<rect width="100%" height="100%" rx="18" fill="#f4f7fb" />');

  for (const edge of edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) continue;

    const startX = from.cx;
    const startY = from.y + from.height;
    const endX = to.cx;
    const endY = to.y;
    const midY = startY + (endY - startY) / 2;

    svg.push(
      `<path d="M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}" fill="none" stroke="#5b6b82" stroke-width="2.5" marker-end="url(#arrow)" />`
    );

    if (edge.label) {
      const labelX = (startX + endX) / 2;
      const labelY = midY - 8;
      const labelWidth = Math.min(220, Math.max(84, edge.label.length * 7.1 + 18));
      svg.push(`<rect x="${labelX - labelWidth / 2}" y="${labelY - 14}" width="${labelWidth}" height="24" rx="12" fill="#ffffff" stroke="#d7dee8" />`);
      svg.push(`<text x="${labelX}" y="${labelY + 2}" font-family="Helvetica Neue, Arial, sans-serif" font-size="12" font-weight="600" fill="#223146" text-anchor="middle">${escapeXml(edge.label)}</text>`);
    }
  }

  for (const id of discoveryOrder) {
    const node = nodes.get(id);
    const pos = positions.get(id);
    if (!node || !pos) continue;

    if (node.shape === 'diamond') {
      const points = [
        `${pos.cx},${pos.y}`,
        `${pos.x + pos.width},${pos.cy}`,
        `${pos.cx},${pos.y + pos.height}`,
        `${pos.x},${pos.cy}`,
      ].join(' ');
      svg.push(`<polygon points="${points}" fill="#fff7ed" stroke="#d38a2d" stroke-width="2.5" />`);
    } else {
      svg.push(`<rect x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}" rx="16" fill="#ffffff" stroke="#9abce0" stroke-width="2.5" />`);
    }

    const lineHeight = 18;
    const textY = pos.cy - ((pos.textLines.length - 1) * lineHeight) / 2 + 5;
    svg.push(`<text x="${pos.cx}" y="${textY}" font-family="Helvetica Neue, Arial, sans-serif" font-size="15" font-weight="600" fill="#17314d" text-anchor="middle">`);
    pos.textLines.forEach((line, index) => {
      svg.push(`<tspan x="${pos.cx}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`);
    });
    svg.push('</text>');
  }

  svg.push('</svg>');
  return svg.join('');
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let i = 0;
  let inCode = false;
  let codeLang = '';
  let codeLines = [];
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
        if (codeLang === 'mermaid') {
          const diagram = renderMermaidSvg(codeLines.join('\n'));
          if (diagram) {
            html.push(`<figure class="diagram">${diagram}<figcaption>FleetGraph graph flow</figcaption></figure>`);
          } else {
            html.push(`<pre><code class="${escapeHtml(codeLang)}">${escapeHtml(codeLines.join('\n'))}</code></pre>`);
          }
        } else {
          html.push(`<pre><code class="${escapeHtml(codeLang)}">${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        }
        inCode = false;
        codeLang = '';
        codeLines = [];
      } else {
        codeLines.push(line);
      }
      i += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      flushParagraph();
      closeList();
      codeLang = trimmed.slice(3).trim();
      inCode = true;
      codeLines = [];
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
      figure.diagram {
        margin: 0 0 0.18in;
        padding: 0.1in;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--surface-alt);
        page-break-inside: avoid;
      }
      figure.diagram svg {
        display: block;
        width: 100%;
        height: auto;
      }
      figure.diagram figcaption {
        margin-top: 0.08in;
        font-size: 9pt;
        color: var(--muted);
        text-align: center;
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
