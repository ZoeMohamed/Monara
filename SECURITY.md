# Security notes

Fase ini frontend-only dan tidak menangani token, kredensial Gmail, atau data keuangan sungguhan.

- Jangan menaruh secret di bundle browser atau `NEXT_PUBLIC_*`.
- Service worker hanya menyimpan app shell dan aset origin sendiri; data keuangan tidak dimasukkan ke cache.
- Integrasi Gmail/OAuth nanti harus dilakukan oleh backend terpisah dengan scope hanya-baca.
- Data demo di UI bukan data pengguna dan tidak dikirim ke layanan eksternal.
