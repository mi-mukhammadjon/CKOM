const { applySigning } = require('../withReleaseSigning');
const { versionCodeOf } = require('../../app.config');

const GRADLE = `
android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
            minifyEnabled false
        }
    }
}`;

describe('withReleaseSigning', () => {
  it('добавляет ключ release и оставляет debug-сборку как есть', () => {
    const out = applySigning(GRADLE);
    expect(out).toContain("System.getenv('CKOM_UPLOAD_STORE_FILE')");
    expect(out).toMatch(/debug \{\s+signingConfig signingConfigs\.debug/);
    expect(out).toContain('? signingConfigs.release : signingConfigs.debug');
  });

  it('повторное применение ничего не меняет', () => {
    const once = applySigning(GRADLE);
    expect(applySigning(once)).toBe(once);
  });
});

describe('versionCodeOf', () => {
  it('растет вместе с версией', () => {
    expect(versionCodeOf('1.3.0')).toBe(10300);
    expect(versionCodeOf('1.12.4')).toBeGreaterThan(versionCodeOf('1.3.0'));
    expect(versionCodeOf('2.0.0')).toBeGreaterThan(versionCodeOf('1.99.99'));
  });
});
