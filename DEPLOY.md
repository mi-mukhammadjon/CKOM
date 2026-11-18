# СКОМ: serverga joylash

Ilova uch qismdan iborat:

| Qism | Qayerda | Narx |
|---|---|---|
| Sinxronlash serveri (login + shifrlangan seyflar) | Supabase | Bepul tarif |
| Veb-versiya va APK yuklab olish sahifasi | GitHub Pages | Bepul |
| APK fayllari | GitHub Releases | Bepul |

Ma'lumotlar qurilmada AES-256-GCM bilan shifrlanadi. Supabase faqat shifrlangan matnni saqlaydi va uni o'qiy olmaydi: kalit paroldan qurilmada hosil qilinadi, serverga esa paroldan olingan alohida kirish kaliti boradi.

---

## 1. Supabase loyihasi

1. <https://supabase.com> → **New project**. Region: eng yaqini (masalan, Frankfurt). Baza parolini saqlab qo'ying.
2. **SQL Editor** → `supabase/migrations/20261004000000_vaults.sql` faylining mazmunini joylab, **Run** bosing.
3. **Authentication → Sign In / Providers → Email**:
   - *Confirm email* yoqilgan bo'lsa, ro'yxatdan o'tgan foydalanuvchi emaildagi havolani bosishi kerak. Tasdiqsiz ishlatish uchun uni o'chiring.
4. **Project Settings → API** dan ikkita qiymatni oling:
   - `Project URL` → `EXPO_PUBLIC_SUPABASE_URL`
   - `anon public` kalit → `EXPO_PUBLIC_SUPABASE_ANON_KEY`

   ⚠️ `service_role` kalitini hech qayerga yozmang — u RLS'ni chetlab o'tadi.

> Bepul tarifda loyiha 7 kun davomida so'rov bo'lmasa to'xtatiladi. Supabase panelida **Restore** bosilsa, ma'lumotlar bilan qayta ishga tushadi.

## 2. Mahalliy build uchun sozlama

`.env.example` dan nusxa olib, `.env.local` yarating va qiymatlarni yozing. `.env.local` git'ga tushmaydi.

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

So'ng APK'ni qayta yig'ing (`README.md` dagi buyruq).

## 3. GitHub repozitoriy

1. GitHub'da yangi **public** repo yarating (GitHub Pages bepul tarifda faqat public repolarda ishlaydi). Nom, masalan, `KCOM`.
2. Repo **Settings → Secrets and variables → Actions → Variables** bo'limiga ikkita o'zgaruvchi qo'shing:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
3. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Kodni yuboring:

```bash
git remote add origin https://github.com/<login>/KCOM.git
git push -u origin master
```

Push'dan keyin `Deploy web to GitHub Pages` workflow'i testlarni o'tkazib, saytni joylaydi:

- Veb-versiya: `https://<login>.github.io/KCOM/`
- APK sahifasi: `https://<login>.github.io/KCOM/download/`

## 4. APK chiqarish

Versiya faqat bitta joyda — `app.json` dagi `version` da beriladi. Android uchun `versionCode` undan avtomatik hisoblanadi (`1.3.0 → 10300`), qo'lda oshirish shart emas.

```bash
# app.json → "version": "1.3.1"
git commit -am "1.3.1"
git tag v1.3.1
git push origin main v1.3.1
```

Yoki tegsiz: GitHub'da **Actions → Release Android APK → Run workflow** — teg `app.json` dagi versiyadan avtomatik yaratiladi.

`Release Android APK` workflow'i tekshiruvlarni (tiplar, lint, testlar) o'tkazadi, teg `app.json` dagi versiyaga mos kelishini tekshiradi, APK'ni yig'ib, GitHub Releases'ga yuklaydi. Yuklab olish sahifasi har doim eng so'nggi relizga havola beradi.

## 5. Imzolash kaliti (muhim)

1.3.0 gacha bo'lgan APK'lar React Native'ning **hammaga ochiq debug kaliti** bilan imzolangan. Bu kalit internetda bor, ya'ni istalgan odam `com.ckom.app` nomli soxta "yangilanish" yasab, foydalanuvchi telefonida ilova o'rniga o'rnatishi mumkin.

Workflow endi o'z kalitingizni qo'llab-quvvatlaydi. Kalit sekretlarda bo'lmasa, eski imzo saqlanadi va workflow ogohlantirish chiqaradi.

**O'z kalitingizga o'tish:**

1. Kalit yarating (bir marta, kompyuteringizda):

   ```bash
   keytool -genkeypair -v -storetype PKCS12 -keystore ckom-release.keystore \
     -alias ckom -keyalg RSA -keysize 4096 -validity 10000
   ```

2. **Kalitni va parolni ishonchli joyda saqlang** (parol menejeri + oflayn nusxa). Kalit yo'qolsa, ilovani hech qachon yangilab bo'lmaydi.
3. Repo **Settings → Secrets and variables → Actions → Secrets** ga qo'shing:
   - `ANDROID_KEYSTORE_BASE64` — `base64 -w0 ckom-release.keystore` natijasi (Windows: `certutil -encode`)
   - `ANDROID_KEYSTORE_PASSWORD` — keystore paroli
   - `ANDROID_KEY_ALIAS` — `ckom`
   - `ANDROID_KEY_PASSWORD` — kalit paroli (PKCS12'da keystore paroli bilan bir xil)

⚠️ **Imzo o'zgargach, eski APK ustiga yangisi o'rnatilmaydi.** Foydalanuvchilar eski ilovani o'chirib, yangisini o'rnatishi kerak bo'ladi, bunda telefondagi ma'lumotlar o'chadi. O'tishdan oldin hammaga bulutga sinxronlashni yoki **Sozlamalar → zaxira faylini saqlash** ni bajarishni ayting, yangi ilovada esa kirish yoki fayldan tiklash orqali ma'lumotlarni qaytarish mumkin. O'tishni bir marta, imkon qadar ertaroq qiling.

Har bir relizda workflow jurnalidagi **Show signing certificate** qadamida imzoning SHA-256 izi ko'rsatiladi.

## Muhim

- **Parol tiklanmaydi.** Bu uchdan-uchgacha shifrlashning narxi: parol unutilsa, bulutdagi nusxani ochib bo'lmaydi. Telefondagi ma'lumotlar qoladi; yangi hisob ochib, ularni qayta yuklash mumkin. Parolni eslab turgan holda uni **Sozlamalar → Bulut → Parolni o'zgartirish** orqali almashtirish mumkin: bulutdagi nusxa yangi kalit bilan qayta shifrlanadi, boshqa qurilmalar esa yangi parolni so'raydi.
- **Supabase'da "Secure password change"** yoqilgan bo'lsa, parolni almashtirish qayta autentifikatsiya talab qiladi. Bu sozlamani o'chiq qoldiring (standart holat shunday).
- **Suratlar sinxronlanmaydi.** Hisoblagich va kvitansiya suratlari faqat ular olingan qurilmada qoladi.
- **Veb-versiyada** ma'lumotlar brauzer xotirasida saqlanadi (qurilmadagidek shifrlangan baza yo'q). Sinxronlash esa vebda ham shifrlangan. Shifrlash kaliti faqat brauzer oynasi ochiq turganda (`sessionStorage`) saqlanadi: oyna yopilgach, parol qayta so'raladi.
