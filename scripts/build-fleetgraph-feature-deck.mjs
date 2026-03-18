import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { chromium } from '@playwright/test';

const ROOT = process.cwd();
const INPUT = path.join(ROOT, 'final-report', 'fleetgraph-feature-deck.md');
const HTML_OUTPUT = path.join(ROOT, 'final-report', 'fleetgraph-feature-deck.html');
const PDF_OUTPUT = path.join(ROOT, 'final-report', 'fleetgraph-feature-deck.pdf');

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

function parseSlideCard(line) {
  const trimmed = line.trim().replace(/^- /, '');
  const match = trimmed.match(/^\*\*([^*]+):\*\*\s*(.+)$/);

  if (!match) {
    return {
      label: 'Point',
      body: trimmed,
    };
  }

  return {
    label: match[1].trim(),
    body: match[2].trim(),
  };
}

function parseSlides(markdown) {
  return markdown
    .replace(/\r\n/g, '\n')
    .split(/\n---\n/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean);
      const titleLine = lines.find((line) => line.startsWith('# '));
      const title = titleLine ? titleLine.slice(2).trim() : 'Slide';
      const cards = lines.filter((line) => line.startsWith('- ')).map(parseSlideCard);
      const paragraphs = lines.filter(
        (line) => line && !line.startsWith('# ') && !line.startsWith('- ')
      );
      const totalTextLength = cards.reduce((sum, card) => sum + card.body.length, 0);

      return {
        title,
        cards,
        paragraphs,
        kind: cards.length === 0 ? 'cover' : 'content',
        dense: totalTextLength > 520 || cards.some((card) => card.body.length > 160),
      };
    });
}

function buildCoverHtml(slide, index, totalSlides) {
  const subtitle = slide.paragraphs[0] ?? '';
  const summary = slide.paragraphs[1] ?? '';
  const detail = slide.paragraphs[2] ?? '';

  return `
  <section class="slide slide-cover">
    <div class="cover-grid">
      <div class="cover-visual">
        <div class="cover-visual-inner">
          <p class="visual-kicker">Shared Graph Architecture</p>
          <div class="hero-flow">
            <div class="hero-trigger-stack">
              <div class="hero-node hero-node-warm">Proactive Sweep</div>
              <div class="hero-node hero-node-cool">On-Demand Context</div>
            </div>
            <div class="hero-arrow">→</div>
            <div class="hero-node hero-node-core">
              <span class="hero-core-label">Shared FleetGraph</span>
              <span class="hero-core-sub">One graph, two triggers</span>
            </div>
          </div>
          <div class="hero-phases">
            <span class="hero-phase">Fetch</span>
            <span class="hero-phase">Signals</span>
            <span class="hero-phase">Reasoning</span>
            <span class="hero-phase">HITL</span>
          </div>
          <div class="hero-outcomes">
            <div class="hero-outcome">
              <strong>Push</strong>
              <span>Proactive findings</span>
            </div>
            <div class="hero-outcome">
              <strong>Pull</strong>
              <span>Context-aware answers</span>
            </div>
            <div class="hero-outcome">
              <strong>Act</strong>
              <span>Safe draft actions</span>
            </div>
          </div>
        </div>
      </div>
      <div class="cover-content">
        <p class="cover-kicker">ShipShape</p>
        <h1>${renderInline(slide.title)}</h1>
        ${subtitle ? `<p class="cover-subtitle">${renderInline(subtitle)}</p>` : ''}
        ${summary ? `<p class="cover-summary">${renderInline(summary)}</p>` : ''}
        <div class="cover-badges">
          <span class="cover-badge">Proactive + On-Demand</span>
          <span class="cover-badge">Shared LangGraph</span>
          <span class="cover-badge">Human Approval Boundary</span>
        </div>
        <div class="cover-rule"></div>
        ${detail ? `<p class="cover-detail">${renderInline(detail)}</p>` : ''}
      </div>
    </div>
    <div class="footer">
      <span>FleetGraph Presentation Deck</span>
      <span>${index + 1} / ${totalSlides}</span>
    </div>
  </section>`;
}

function buildSlideHtml(slide, index, totalSlides) {
  if (slide.kind === 'cover') {
    return buildCoverHtml(slide, index, totalSlides);
  }

  const denseClass = slide.dense ? ' dense' : '';

  return `
  <section class="slide${denseClass}">
    <div class="topbar">
      <p class="eyebrow">FleetGraph</p>
      <p class="meta">What · Why · How · Outcome</p>
    </div>
    <div class="title-wrap">
      <h1>${renderInline(slide.title)}</h1>
      <div class="title-accent"></div>
    </div>
    <div class="card-grid">
      ${slide.cards
        .map(
          (card) => `
            <article class="card card-${card.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}">
              <div class="card-label">${renderInline(card.label)}</div>
              <p class="card-body">${renderInline(card.body)}</p>
            </article>
          `
        )
        .join('')}
    </div>
    <div class="footer">
      <span>ShipShape FleetGraph Feature Summary</span>
      <span>${index + 1} / ${totalSlides}</span>
    </div>
  </section>`;
}

function buildHtml(slides) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FleetGraph Feature Deck</title>
  <style>
    @page {
      size: 1280px 720px;
      margin: 0;
    }

    :root {
      --page: #efe7da;
      --paper: #fbf7f0;
      --paper-strong: #ffffff;
      --ink: #1b2b3d;
      --muted: #617181;
      --line: #d6cdbf;
      --accent: #b85a2d;
      --navy: #214160;
      --gold: #d2a33a;
      --what: #edf4ff;
      --why: #fff1e4;
      --how: #eef8ee;
      --outcome: #f5eefc;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      background: var(--page);
      color: var(--ink);
      font-family: "Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif;
    }

    body {
      margin: 0;
    }

    .slide {
      position: relative;
      width: 1280px;
      height: 720px;
      overflow: hidden;
      padding: 46px 54px 46px;
      background: var(--paper);
      page-break-after: always;
      break-after: page;
    }

    .slide:last-of-type {
      page-break-after: auto;
      break-after: auto;
    }

    .slide::before {
      content: "";
      position: absolute;
      inset: 20px;
      border: 1px solid var(--line);
      border-radius: 26px;
      pointer-events: none;
    }

    .slide::after {
      content: "";
      position: absolute;
      left: 20px;
      top: 20px;
      bottom: 20px;
      width: 12px;
      border-radius: 26px 0 0 26px;
      background: linear-gradient(180deg, var(--accent), var(--gold), var(--navy));
      pointer-events: none;
    }

    .slide-cover {
      padding: 56px 60px 46px;
      background:
        linear-gradient(135deg, #fbf7f0 0%, #f8f0e5 100%);
    }

    .slide-cover::after {
      width: 18px;
      border-radius: 26px 0 0 26px;
    }

    .cover-grid {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: minmax(0, 1.08fr) minmax(360px, 0.92fr);
      gap: 34px;
      align-items: center;
      height: 570px;
      margin-top: 12px;
      padding-right: 12px;
    }

    .cover-visual {
      min-height: 520px;
      padding: 18px;
      border: 1px solid var(--line);
      border-radius: 28px;
      background:
        radial-gradient(circle at top left, rgba(184, 90, 45, 0.08), transparent 28%),
        linear-gradient(180deg, #fffdf8 0%, #f7f2e7 100%);
    }

    .cover-visual-inner {
      position: relative;
      height: 100%;
      padding: 24px;
      border-radius: 22px;
      background: rgba(255, 255, 255, 0.72);
      border: 1px solid rgba(33, 65, 96, 0.08);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .visual-kicker {
      margin: 0;
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .hero-flow {
      display: grid;
      grid-template-columns: 180px 46px minmax(0, 1fr);
      gap: 18px;
      align-items: center;
      margin-top: 10px;
    }

    .hero-trigger-stack {
      display: grid;
      gap: 14px;
    }

    .hero-node {
      padding: 18px 18px;
      border-radius: 20px;
      border: 1px solid rgba(33, 65, 96, 0.12);
      font-size: 18px;
      font-weight: 800;
      line-height: 1.2;
      color: var(--ink);
      background: var(--paper-strong);
    }

    .hero-node-warm {
      background: #fff0e4;
    }

    .hero-node-cool {
      background: #edf4ff;
    }

    .hero-node-core {
      min-height: 178px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 10px;
      background:
        linear-gradient(135deg, rgba(33, 65, 96, 0.96), rgba(56, 88, 120, 0.96));
      color: #ffffff;
      border-color: transparent;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    }

    .hero-core-label {
      font-size: 28px;
      font-weight: 900;
      line-height: 1.05;
      letter-spacing: -0.03em;
    }

    .hero-core-sub {
      font-size: 15px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.82);
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    .hero-arrow {
      text-align: center;
      font-size: 38px;
      font-weight: 900;
      color: var(--accent);
      line-height: 1;
    }

    .hero-phases {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-top: 26px;
    }

    .hero-phase {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 54px;
      padding: 10px 12px;
      border-radius: 16px;
      background: #fffaf1;
      border: 1px solid var(--line);
      color: var(--navy);
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .hero-outcomes {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
      margin-top: 26px;
    }

    .hero-outcome {
      min-height: 112px;
      padding: 16px;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: #fffdf8;
      display: flex;
      flex-direction: column;
      gap: 8px;
      justify-content: center;
    }

    .hero-outcome strong {
      font-size: 14px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--accent);
    }

    .hero-outcome span {
      font-size: 20px;
      line-height: 1.22;
      font-weight: 800;
      color: var(--ink);
      letter-spacing: -0.02em;
    }

    .cover-content {
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 10px 6px 10px 4px;
    }

    .cover-kicker {
      margin: 0 0 18px;
      color: var(--navy);
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }

    .slide-cover h1 {
      margin: 0;
      max-width: 760px;
      font-size: 64px;
      line-height: 0.95;
      letter-spacing: -0.045em;
    }

    .cover-subtitle {
      margin: 20px 0 0;
      color: var(--accent);
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .cover-summary {
      margin: 18px 0 0;
      max-width: 460px;
      color: var(--ink);
      font-size: 20px;
      line-height: 1.42;
      font-weight: 500;
    }

    .cover-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 22px;
    }

    .cover-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 38px;
      padding: 8px 14px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.88);
      border: 1px solid var(--line);
      color: var(--navy);
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .cover-rule {
      width: 180px;
      height: 10px;
      margin-top: 24px;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--accent), var(--gold), var(--navy));
    }

    .cover-detail {
      margin: 22px 0 0;
      max-width: 470px;
      color: var(--muted);
      font-size: 16px;
      line-height: 1.5;
      font-weight: 600;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    .topbar,
    .footer {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .eyebrow,
    .meta,
    .footer {
      margin: 0;
      color: var(--muted);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .eyebrow {
      font-size: 12px;
      font-weight: 700;
    }

    .meta,
    .footer span {
      font-size: 11px;
      font-weight: 600;
    }

    .topbar {
      min-height: 18px;
    }

    .title-wrap {
      position: relative;
      z-index: 1;
      margin-top: 16px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 140px;
      gap: 18px;
      align-items: center;
    }

    h1 {
      margin: 0;
      font-size: 40px;
      line-height: 1.02;
      letter-spacing: -0.03em;
      max-width: 900px;
    }

    .title-accent {
      height: 10px;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--accent), var(--gold), var(--navy));
      margin-bottom: 10px;
    }

    .card-grid {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: repeat(2, minmax(0, 1fr));
      gap: 18px;
      height: 480px;
      margin-top: 26px;
    }

    .card {
      height: 100%;
      padding: 20px 22px 20px;
      border-radius: 22px;
      border: 1px solid var(--line);
      background: var(--paper-strong);
      box-shadow: none;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .card-what {
      background: var(--what);
    }

    .card-why {
      background: var(--why);
    }

    .card-how {
      background: var(--how);
    }

    .card-outcome {
      background: var(--outcome);
    }

    .card-label {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 98px;
      padding: 8px 14px;
      border-radius: 999px;
      background: var(--paper-strong);
      border: 1px solid #d8dde4;
      color: var(--navy);
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .card-body {
      margin: 0;
      font-size: 19px;
      line-height: 1.42;
      font-weight: 600;
    }

    code {
      font-family: "SFMono-Regular", Menlo, Consolas, monospace;
      font-size: 0.82em;
      background: rgba(33, 65, 96, 0.08);
      padding: 2px 6px;
      border-radius: 6px;
    }

    a {
      color: var(--navy);
      text-decoration: none;
      border-bottom: 1px solid rgba(33, 65, 96, 0.24);
    }

    strong {
      font-weight: 800;
    }

    .dense h1 {
      font-size: 36px;
    }

    .dense .card {
      padding: 18px 20px 18px;
    }

    .dense .card-body {
      font-size: 17px;
      line-height: 1.36;
    }

    .footer {
      position: absolute;
      left: 54px;
      right: 54px;
      bottom: 34px;
      z-index: 1;
    }
  </style>
</head>
<body>
${slides.map((slide, index) => buildSlideHtml(slide, index, slides.length)).join('\n')}
</body>
</html>`;
}

async function main() {
  const markdown = await fs.readFile(INPUT, 'utf8');
  const slides = parseSlides(markdown);
  const html = buildHtml(slides);

  await fs.writeFile(HTML_OUTPUT, html, 'utf8');

  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });

    await page.goto(pathToFileURL(HTML_OUTPUT).href, { waitUntil: 'load' });
    await page.emulateMedia({ media: 'screen' });
    await page.pdf({
      path: PDF_OUTPUT,
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }

  console.log(`Wrote ${HTML_OUTPUT}`);
  console.log(`Wrote ${PDF_OUTPUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
