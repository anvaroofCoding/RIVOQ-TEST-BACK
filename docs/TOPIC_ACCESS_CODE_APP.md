# Mobil ilova: 6 raqamli kod bilan maxfiy test

Barcha so‘rovlar `Authorization: Bearer <access_token>` sarlavhasi bilan (`Content-Type: application/json`). Asosiy URL prefix: **`/api`**.

---

## 1) Kod kiritilganda: faqat test haqida ma’lumot (sessiya yo‘q)

**Foydalanuvchi 6 raqamni kiritadi** → ekranda fan nomi, mavzu, vaqt, qiyinlik, savollar soni chiqadi. **Hali test boshlanmaydi.**

```http
POST /api/topics/preview-by-code
```

**Body:**

```json
{
  "code": "123456"
}
```

**Muvaffaqiyatli javob `200`:**

```json
{
  "success": true,
  "data": {
    "code": "123456",
    "company": {
      "_id": "...",
      "name": "Janob Win",
      "companyLogo": "/uploads/company-logos/....webp"
    },
    "topic": {
      "_id": "...",
      "name": "Mavzu nomi",
      "description": "",
      "minutes": 30,
      "difficulty": "OSON",
      "questionCount": 10
    },
    "subject": {
      "_id": "...",
      "name": "Fan nomi",
      "description": ""
    }
  }
}
```

**Xatolar:** `400` (kod format yoki mavzu mos emas), `403` (shu **6 raqam** bilan allaqachon yakunlagansiz — kompaniya yangi kod bersa qayta ochiladi), `404` (kod topilmadi — kompaniya yopgan yoki bekor qilgan).

---

## 2) «Testni boshlash» tugmasi: sessiya ochiladi (avvalgi jamoat testi bilan bir xil)

**Tugma bosilgach** shu kod bilan test **rasman boshlanadi** — vaqt hisobi, birinchi savol qaytariladi.

> Agar **shu kirish kodi** bilan allaqachon **yakunlagan** bo‘lsangiz — **`403`**. **Kod yangilangan** (yangi 6 raqam) bo‘lsa, qayta kirish mumkin. Agar **taymer tugamagan** (`in_progress`) sessiya bo‘lsa, javobda **shu sessiya** qaytadi.

```http
POST /api/topics/start-with-code
```

**Body:**

```json
{
  "code": "123456"
}
```

**Muvaffaqiyatli javob `201`:** jamoat testidagi `POST /api/topics/:topicId/start` bilan **bir xil struktura**:

- `data.company` — kompaniya **`name`** va **`companyLogo`** (nisbiy URL; to‘liq uchun `BASE_URL` + `companyLogo`)  
- `data.sessionId` — keyingi barcha so‘rovda ishlatiladi  
- `data.topic` — `name`, `minutes`, `difficulty`  
- `data.total` — savollar soni  
- `data.expiresAt`, `data.remainingSeconds`  
- `data.current` — birinchi savol (`question`, `choices` / `options`)

---

## 3) Testni yechish (o‘zgarishsiz — eski API)

Aynan shu tartibda davom etasiz:

| Amal | So‘rov |
|------|--------|
| Joriy holat va savol | `GET /api/sessions/:sessionId` — maxfiy testda `data.company` (nom + logo) qaytishi mumkin |
| Javob yuborish | `POST /api/sessions/:sessionId/answer` — body: `{ "answer": "A" }` yoki variant matni |
| Javobni tahrirlash (kerak bo‘lsa) | `PATCH /api/sessions/:sessionId/answers/:index` |
| Vaqtidan oldin topshirish | `POST /api/sessions/:sessionId/finish` |
| Yakuniy natija (to‘g‘ri javoblar bilan) | `GET /api/sessions/:sessionId/results` |
| Tarix | `GET /api/sessions/history` |

Coin/ball qoidalari jamoat testidagi bilan **bir xil** (masalan, sessiya yakunida mukofotlar).

---

## Qoida: bir kirish kodi — bir foydalanuvchi bir marta

- **Aynan shu 6 raqam** bilan yakunlagan bo‘lsangiz, qayta **shu kodni** kirita olmaysiz (`403`).
- **Kompaniya AdminJS da kodni yangilasa** (yangi 6 raqam), avvalgi kod bilan tugatgan bo‘lsangiz ham **yangi kod bilan** qayta kirish mumkin.

---

## Qisqa UI oqim

1. Kod maydoni → **`preview-by-code`** → test kartochkasi (fan/mavzu/vaqti/savollar soni).  
2. **«Testni boshlash»** → **`start-with-code`** → `sessionId` + birinchi savol.  
3. **`/sessions/...`** orqali yechish — katalogdagi test bilan bir xil.

**Muhim:** `preview-by-code` faqat ma’lumot beradi; vaqt **faqat** `start-with-code` dan keyin hisoblanadi.
