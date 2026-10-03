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

Versiya tegi qo'yilsa, `Release Android APK` workflow'i APK'ni yig'ib, GitHub Releases'ga yuklaydi:

```bash
git tag v1.1.1
git push origin v1.1.1
```

Yuklab olish sahifasi har doim eng so'nggi relizga havola beradi.

Har bir yangi relizdan oldin `app.json` dagi `version` va `android.versionCode` ni oshiring — aks holda Android eski APK'ni yangisining ustiga o'rnatishga ruxsat beradi.

## Muhim

- **Parol tiklanmaydi.** Bu uchdan-uchgacha shifrlashning narxi: parol unutilsa, bulutdagi nusxani ochib bo'lmaydi. Telefondagi ma'lumotlar qoladi; yangi hisob ochib, ularni qayta yuklash mumkin.
- **Suratlar sinxronlanmaydi.** Hisoblagich va kvitansiya suratlari faqat ular olingan qurilmada qoladi.
- **Veb-versiyada** ma'lumotlar brauzer xotirasida saqlanadi (qurilmadagidek shifrlangan baza yo'q). Sinxronlash esa vebda ham shifrlangan.
