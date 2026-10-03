import { compressBackup, decodeBackup, isGzip } from '../backupCodec';
import { utf8Decode, utf8Encode } from '../utf8';

const sample = JSON.stringify({
  properties: [{ id: 'prop-1', name: "Uy — Toshkent, Amir Temur ko'chasi" }],
  notes: 'Замена батарей ⚡ 💧 🔥',
  readings: Array.from({ length: 200 }, (_, i) => ({ id: `r${i}`, reading: 14000 + i * 170 })),
});

describe('utf8', () => {
  it('кодирует и декодирует кириллицу, узбекскую латиницу и эмодзи без потерь', () => {
    expect(utf8Decode(utf8Encode(sample))).toBe(sample);
  });

  it('совпадает со стандартным кодированием UTF-8', () => {
    // «с» = d1 81, «у» = d1 83, «м» = d0 bc, пробел, «ʻ» = ca bb, «💧» = f0 9f 92 a7
    expect(Array.from(utf8Encode('сум ʻ💧'))).toEqual([
      0xd1, 0x81, 0xd1, 0x83, 0xd0, 0xbc, 0x20, 0xca, 0xbb, 0xf0, 0x9f, 0x92, 0xa7,
    ]);
  });

  it('пропускает BOM в начале файла', () => {
    expect(utf8Decode(Uint8Array.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d]))).toBe('{}');
  });
});

describe('backupCodec', () => {
  it('сжатая копия читается обратно в исходный JSON', () => {
    const packed = compressBackup(sample);
    expect(isGzip(packed)).toBe(true);
    expect(decodeBackup(packed)).toBe(sample);
  });

  it('сжатие заметно уменьшает размер', () => {
    const packed = compressBackup(sample);
    expect(packed.length).toBeLessThan(utf8Encode(sample).length / 4);
  });

  it('читает обычный JSON прежних версий', () => {
    expect(decodeBackup(utf8Encode(sample))).toBe(sample);
  });
});
