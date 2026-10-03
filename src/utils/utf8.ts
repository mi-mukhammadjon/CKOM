/**
 * Кодирование UTF-8 без TextEncoder/TextDecoder: в движке Hermes они есть
 * не во всех версиях, а резервная копия должна читаться везде одинаково.
 */

export function utf8Encode(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    // Суррогатная пара — символ за пределами BMP (эмодзи)
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return Uint8Array.from(out);
}

export function utf8Decode(bytes: Uint8Array): string {
  let start = 0;
  // BOM в начале файла пропускаем
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3;

  const chunks: string[] = [];
  let codes: number[] = [];
  for (let i = start; i < bytes.length; ) {
    const b = bytes[i];
    let code: number;
    if (b < 0x80) {
      code = b;
      i += 1;
    } else if ((b & 0xe0) === 0xc0) {
      code = ((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
      i += 2;
    } else if ((b & 0xf0) === 0xe0) {
      code = ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
      i += 3;
    } else {
      code =
        ((b & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      i += 4;
    }

    if (code > 0xffff) {
      code -= 0x10000;
      codes.push(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
    } else {
      codes.push(code);
    }
    // Собираем строку кусками, чтобы не упереться в лимит аргументов
    if (codes.length >= 8192) {
      chunks.push(String.fromCharCode(...codes));
      codes = [];
    }
  }
  chunks.push(String.fromCharCode(...codes));
  return chunks.join('');
}
