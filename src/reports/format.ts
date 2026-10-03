import type { Translate } from '../i18n';
import { Report, ReportTable } from './build';
import { REPORT_LOGO_DATA_URI } from './logo';

/** Число в формате приложения («14 980», «863,25») — в CSV пишем без пробелов */
const NUMERIC = /^-?\d{1,3}( \d{3})*(,\d+)?$|^-?\d+(,\d+)?$/;

function csvCell(value: string): string {
  const cleaned = NUMERIC.test(value) ? value.replace(/ /g, '') : value;
  return /[;"\n]/.test(cleaned) ? `"${cleaned.replace(/"/g, '""')}"` : cleaned;
}

/**
 * CSV для Excel: UTF-8 с BOM (иначе кириллица превращается в кракозябры)
 * и разделитель «;» — так Excel с русской и узбекской локалью сразу делит
 * колонки и распознает числа с десятичной запятой.
 */
export function reportToCsv(report: Report, t: Translate): string {
  const lines: string[] = [
    csvCell(report.title),
    [t('reports.property'), report.propertyName].map(csvCell).join(';'),
    [t('reports.periodLabel'), report.periodLabel].map(csvCell).join(';'),
    '',
  ];

  report.kpis.forEach(kpi => lines.push([kpi.label, kpi.value, kpi.hint ?? ''].map(csvCell).join(';')));
  if (report.kpis.length) lines.push('');

  report.tables.forEach(table => {
    if (table.title) lines.push(csvCell(table.title));
    lines.push(table.columns.map(c => csvCell(c.label)).join(';'));
    table.rows.forEach(row => lines.push(table.columns.map(c => csvCell(row[c.key] ?? '')).join(';')));
    if (table.footer) {
      lines.push(table.columns.map(c => csvCell(table.footer?.[c.key] ?? '')).join(';'));
    }
    lines.push('');
  });

  return '﻿' + lines.join('\r\n');
}

/** Текст для мессенджеров. Отчет для инспектора уже имеет готовый текст. */
export function reportToText(report: Report): string {
  if (report.text) return report.text;

  const lines: string[] = [
    `📊 ${report.title}`,
    `🏠 ${report.propertyName}`,
    `📅 ${report.periodLabel}`,
    '─────────────────────',
  ];
  report.kpis.forEach(kpi => lines.push(`• ${kpi.label}: ${kpi.value}${kpi.hint ? ` (${kpi.hint})` : ''}`));

  report.tables.forEach(table => {
    lines.push('');
    if (table.title) lines.push(`*${table.title}*`);
    const [first, ...rest] = table.columns;
    table.rows.forEach(row => {
      const details = rest
        .map(c => (row[c.key] ? `${c.label}: ${row[c.key]}` : ''))
        .filter(Boolean)
        .join(' · ');
      lines.push(`— ${row[first.key]}${details ? ` · ${details}` : ''}`);
    });
  });

  return lines.join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tableHtml(table: ReportTable): string {
  const head = table.columns
    .map(c => `<th class="${c.align === 'right' ? 'r' : ''}">${escapeHtml(c.label)}</th>`)
    .join('');
  const body = table.rows
    .map(
      row =>
        `<tr>${table.columns
          .map(c => `<td class="${c.align === 'right' ? 'r num' : ''}">${escapeHtml(row[c.key] ?? '')}</td>`)
          .join('')}</tr>`
    )
    .join('');
  const foot = table.footer
    ? `<tfoot><tr>${table.columns
        .map(c => `<td class="${c.align === 'right' ? 'r num' : ''}">${escapeHtml(table.footer?.[c.key] ?? '')}</td>`)
        .join('')}</tr></tfoot>`
    : '';
  return `
    ${table.title ? `<h2>${escapeHtml(table.title)}</h2>` : ''}
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>`;
}

/**
 * HTML для PDF (A4). Палитра приложения: графитовая шапка, бирюзовый акцент,
 * цвета ресурсов в полосе структуры затрат.
 */
export function reportToHtml(report: Report, t: Translate, generatedAt: string): string {
  const kpis = report.kpis
    .map(
      kpi => `
      <div class="kpi ${kpi.tone ?? ''}">
        <div class="kpi-label">${escapeHtml(kpi.label)}</div>
        <div class="kpi-value">${escapeHtml(kpi.value)}</div>
        ${kpi.hint ? `<div class="kpi-hint ${kpi.hintTone ?? ''}">${escapeHtml(kpi.hint)}</div>` : ''}
      </div>`
    )
    .join('');

  const bars = report.bars.length
    ? `
      <div class="bar">${report.bars
        .map(b => `<span style="flex:${Math.max(1, Math.round(b.share * 1000))};background:${b.color}"></span>`)
        .join('')}</div>
      <div class="legend">${report.bars
        .map(
          b => `<div><i style="background:${b.color}"></i>${escapeHtml(b.label)} — <b>${escapeHtml(
            b.value
          )}</b> · ${Math.round(b.share * 100)}%</div>`
        )
        .join('')}</div>`
    : '';

  const body = report.empty
    ? `<p class="empty">${escapeHtml(t('reports.empty'))}</p>`
    : report.tables.map(tableHtml).join('');

  const inspectorText = report.text
    ? `<h2>Telegram</h2><pre>${escapeHtml(report.text)}</pre>`
    : '';

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Onest', 'Roboto', 'Helvetica Neue', Arial, sans-serif; color: #111317; font-size: 11pt; margin: 0; }
  .head { background: #17191E; color: #F3F4F6; border-radius: 14px; padding: 18px 20px; display: flex; align-items: center; gap: 16px; }
  .head img { width: 52px; height: 52px; border-radius: 12px; }
  .head h1 { margin: 0; font-size: 19pt; font-weight: 800; letter-spacing: -0.01em; }
  .head .meta { color: #A4A9B3; font-size: 10pt; margin-top: 4px; }
  .accent { height: 4px; border-radius: 2px; background: linear-gradient(90deg, #2ED3F0, #9B6BFF); margin: 10px 0 16px; }
  .kpis { display: grid; grid-template-columns: repeat(${Math.min(4, Math.max(1, report.kpis.length))}, 1fr); gap: 10px; margin-bottom: 16px; }
  .kpi { border: 1px solid #E2E5EB; border-radius: 12px; padding: 10px 12px; }
  .kpi-label { color: #5B6170; font-size: 9pt; }
  .kpi-value { font-size: 14pt; font-weight: 800; margin-top: 3px; font-variant-numeric: tabular-nums; }
  .kpi-hint { color: #5B6170; font-size: 9pt; margin-top: 2px; }
  .kpi.bad .kpi-value { color: #D43B4E; }
  .kpi.good .kpi-value { color: #12A06A; }
  .kpi-hint.bad { color: #D43B4E; }
  .kpi-hint.good { color: #12A06A; }
  .bar { display: flex; height: 10px; border-radius: 5px; overflow: hidden; gap: 2px; margin: 4px 0 8px; }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 9.5pt; color: #3A3F4A; margin-bottom: 14px; }
  .legend i { display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-right: 6px; vertical-align: middle; }
  h2 { font-size: 12pt; margin: 18px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  th { text-align: left; color: #5B6170; font-weight: 600; border-bottom: 1.5px solid #17191E; padding: 7px 8px; }
  td { padding: 7px 8px; border-bottom: 1px solid #ECEEF2; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #F6F7F9; }
  tfoot td { font-weight: 800; border-top: 1.5px solid #17191E; border-bottom: none; }
  .r { text-align: right; }
  .num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  pre { background: #F6F7F9; border-radius: 10px; padding: 12px; font-family: inherit; font-size: 10pt; white-space: pre-wrap; }
  .empty { color: #5B6170; padding: 24px 0; text-align: center; }
  .foot { margin-top: 22px; color: #8A8F99; font-size: 8.5pt; border-top: 1px solid #ECEEF2; padding-top: 8px; }
</style></head>
<body>
  <div class="head">
    <img src="${REPORT_LOGO_DATA_URI}" />
    <div>
      <h1>${escapeHtml(report.title)}</h1>
      <div class="meta">${escapeHtml(report.propertyName)} · ${escapeHtml(report.periodLabel)}</div>
    </div>
  </div>
  <div class="accent"></div>
  <div class="kpis">${kpis}</div>
  ${bars}
  ${body}
  ${inspectorText}
  <div class="foot">${escapeHtml(t('reports.generated', { date: generatedAt }))}</div>
</body></html>`;
}
