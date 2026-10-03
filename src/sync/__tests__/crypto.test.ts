import {
  decryptVault,
  deriveAuthSecret,
  deriveVaultKey,
  encryptVault,
  fromBase64,
  fromHex,
  toBase64,
  toHex,
} from '../crypto';

const salt = fromHex('00112233445566778899aabbccddeeff');
const iv = fromHex('0102030405060708090a0b0c');

describe('base64 и hex', () => {
  it.each([[[]], [[0]], [[255, 1]], [[1, 2, 3]], [[0, 255, 128, 7, 9]]])('туда и обратно: %j', bytes => {
    const data = Uint8Array.from(bytes);
    expect(Array.from(fromBase64(toBase64(data)))).toEqual(bytes);
    expect(Array.from(fromHex(toHex(data)))).toEqual(bytes);
  });

  it('совпадает со стандартным base64', () => {
    expect(toBase64(Uint8Array.from([77, 97, 110]))).toBe('TWFu');
    expect(toBase64(Uint8Array.from([77, 97]))).toBe('TWE=');
  });
});

describe('ключи', () => {
  it('секрет входа не совпадает с ключом шифрования при том же пароле', async () => {
    const auth = await deriveAuthSecret('parol-123', 'User@Mail.uz');
    const vault = toHex(await deriveVaultKey('parol-123', salt, 1000));
    expect(auth).toHaveLength(64);
    expect(auth).not.toBe(vault);
  });

  it('email в секрете входа не зависит от регистра и пробелов', async () => {
    expect(await deriveAuthSecret('p', ' User@Mail.uz ')).toBe(await deriveAuthSecret('p', 'user@mail.uz'));
  });
});

describe('шифрование хранилища', () => {
  const json = JSON.stringify({ properties: [{ name: "Uy — Toshkent, ko'cha" }], notes: 'Замена ⚡' });

  it('расшифровывается тем же ключом', async () => {
    const key = await deriveVaultKey('parol-123', salt, 1000);
    const vault = encryptVault(json, key, iv);
    expect(vault.ciphertext).not.toContain('Toshkent');
    expect(decryptVault(vault, key)).toBe(json);
  });

  it('неверный пароль не расшифровывает', async () => {
    const vault = encryptVault(json, await deriveVaultKey('parol-123', salt, 1000), iv);
    const wrong = await deriveVaultKey('boshqa', salt, 1000);
    expect(() => decryptVault(vault, wrong)).toThrow();
  });

  it('измененный шифротекст отвергается', async () => {
    const key = await deriveVaultKey('parol-123', salt, 1000);
    const vault = encryptVault(json, key, iv);
    const bytes = fromBase64(vault.ciphertext);
    bytes[5] ^= 1;
    expect(() => decryptVault({ ...vault, ciphertext: toBase64(bytes) }, key)).toThrow();
  });
});
