import { reportToCsv, reportToHtml, reportToText } from '../format';
import { Report } from '../build';
import { createTranslator } from '../../i18n';

const t = createTranslator('ru');

const report: Report = {
  type: 'readings',
  title: 'Журнал показаний',
  propertyName: 'Квартира',
  periodLabel: 'Сентябрь 2026',
  currency: 'сум',
  empty: false,
  kpis: [{ label: 'Начислено', value: '98 100 сум' }],
  bars: [],
  tables: [
    {
      columns: [
        { key: 'resource', label: 'Ресурс' },
        { key: 'cost', label: 'Сумма, сум', align: 'right' },
        { key: 'notes', label: 'Примечание' },
      ],
      rows: [
        { resource: 'Электричество', cost: '85 500', notes: 'Замена; поверка' },
        { resource: 'Холодная вода', cost: '863,25', notes: '<b>' },
      ],
      footer: { resource: 'Итого', cost: '86 363,25', notes: '' },
    },
  ],
};

describe('reportToCsv', () => {
  const csv = reportToCsv(report, t);

  it('начинается с BOM, чтобы Excel прочитал кириллицу', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('числа без пробелов, с десятичной запятой', () => {
    expect(csv).toContain('Электричество;85500;');
    expect(csv).toContain('Холодная вода;863,25;');
    expect(csv).toContain('Итого;86363,25;');
  });

  it('значения с «;» заключены в кавычки', () => {
    expect(csv).toContain('"Замена; поверка"');
  });
});

describe('reportToText', () => {
  it('содержит заголовок, объект и строки таблицы', () => {
    const text = reportToText(report);
    expect(text).toContain('Журнал показаний');
    expect(text).toContain('— Электричество · Сумма, сум: 85 500');
  });

  it('для инспектора отдает готовый текст', () => {
    expect(reportToText({ ...report, text: 'готово' })).toBe('готово');
  });
});

describe('reportToHtml', () => {
  it('экранирует пользовательский текст', () => {
    const html = reportToHtml(report, t, '04.10.2026');
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('<td class="">&lt;b&gt;</td>'.replace('&lt;', '<'));
    expect(html).toContain('04.10.2026');
  });
});
