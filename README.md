# Unified Financial Intelligence Agent

FIN adalah prototype personal-finance mobile-first yang dibuat sebagai installable Progressive Web App dengan Next.js. Untuk fase ini repo sengaja hanya berisi frontend—tanpa backend, Python, Docker, atau database.

## Menjalankan

```bash
pnpm install
pnpm dev
```

Buka `http://localhost:3000`.

## Verifikasi

```bash
pnpm lint
pnpm build
pnpm start
```

Build production menyertakan:

- web app manifest;
- ikon 192px, 512px, maskable, dan Apple Touch;
- service worker dengan app-shell caching dan offline fallback;
- metadata standalone serta security headers dasar;
- UI dashboard responsif dengan data demo lokal.

## Arah desain

Referensi produk utamanya adalah Aiccountant Indonesia: mobile-first, angka pengeluaran yang cepat dipindai, daftar transaksi jelas, dan navigasi ala aplikasi. FIN memakai identitas serta fokusnya sendiri—privacy state, confidence review, dan pengalaman PWA.

Seluruh transaksi saat ini adalah data contoh dan perubahan hanya hidup di state browser selama halaman terbuka.
