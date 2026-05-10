# 🔐 Google OAuth Setup - Step by Step

## Problem Ko'rinishi
```
Error 401: invalid_client
The OAuth client was not found
```

Bu xato shuni bildiradi: Google credentials'i .env'da sozlanmagan yoki noto'g'ri.

---

## ✅ STEP 1: Google Cloud Console'ga kiring

1. https://console.cloud.google.com/ ga o'ting
2. Top-right ko'rsatkichdan **NEW PROJECT** tanlang
3. Project nomini kiriting: `RIVOQ Backend`
4. **CREATE** bosgich

---

## ✅ STEP 2: OAuth Consent Screen'ini o'rnatish

1. **APIs & Services** → **OAuth consent screen** qismiga o'ting
2. **User Type**: **External** tanlang (Test uchun)
3. **CREATE** bosgich

### Consent Screen formasi:

**App information** (Majburiy):
```
App name: RIVOQ Backend
User support email: islomanvarov05@gmail.com
Developer contact: islomanvarov05@gmail.com
```

**Authorized domains** (Optional):
```
localhost:3000
```

**Scopes** quiying oxiriga `email`, `profile`, `openid` mavjud

**SAVE & CONTINUE** →  **BACK TO DASHBOARD**

---

## ✅ STEP 3: OAuth 2.0 Credentials yaratish

### Left menu'dan:
1. **APIs & Services** → **Credentials**
2. **+ CREATE CREDENTIALS** → **OAuth 2.0 Client ID** tanlang

### Application type:
```
Web application
```

### Name:
```
RIVOQ Backend Auth
```

### Authorized JavaScript origins:
```
http://localhost:3000
http://localhost:3000:3000
```

**ADD URI** bosgich

### Authorized redirect URIs:
```
http://localhost:3000/api/auth/google/callback
```

**ADD URI** bosgich

### CREATE bosgich ➜ DOWNLOAD JSON

---

## ✅ STEP 4: Credentials'ni .env'ga qo'shish

Downloaded JSON faylini oching va quyidagilarni nusxalaing:

```json
{
  "client_id": "YOUR_CLIENT_ID_HERE",
  "client_secret": "YOUR_CLIENT_SECRET_HERE"
}
```

### .env faylni update qiling:

```env
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID_HERE
GOOGLE_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
```

---

## ✅ STEP 5: Server'ni restart qilish

```bash
npm start
```

Output:
```
✓ MongoDB connected successfully
✓ Server running on http://localhost:3000
```

---

## 🧪 TEST qilish

### Browser'da kirish:
```
http://localhost:3000/api/auth/google
```

### Swagger'da:
1. http://localhost:3000/api-docs/ o'ting
2. **Auth** bo'limini o'chq
3. **GET /auth/google** → **Try it out**
4. **Execute** bosgich

### Success Response:
```json
{
  "success": true,
  "message": "Google login successful",
  "data": {
    "user": {
      "_id": "...",
      "name": "Your Name",
      "email": "yourmail@gmail.com"
    },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

---

## ⚠️ Common Xatolar va Yechimi

### Error: "invalid_client"
**Sabab:** CLIENT_ID yoki SECRET to'g'ri emas
**Yechim:** Google Cloud Console'da credential'larni tekshiring

### Error: "Redirect URI mismatch"
**Sabab:** Registered URI bilan solishtiruvchi emas
**Yechim:** Google Console'da qo'shilgan URI bilan .env'ni solishtirib ko'ring

### Error: "This app isn't verified yet"
**Sabab:** OAuth consent screen'i to'liq emas
**Yechim:** Google Console → OAuth consent screen → SAVE

---

## 📱 Frontend Integration

### HTML Link:
```html
<a href="http://localhost:3000/api/auth/google" class="btn btn-google">
  Google bilan kirish
</a>
```

### JavaScript:
```javascript
// Google login link'ni open qilish
window.location.href = 'http://localhost:3000/api/auth/google';

// Yoki redirect bo'lmagan holda
fetch('http://localhost:3000/api/auth/google', {
  method: 'GET',
  credentials: 'include'
})
.then(res => res.json())
.then(data => {
  localStorage.setItem('token', data.data.token);
  // Navigate to dashboard
})
```

---

## 🔒 Production Deploy

Production uchun:

1. **Google Console** → Authorized JavaScript origins:
```
https://yourdomain.com
```

2. **Google Console** → Authorized redirect URIs:
```
https://yourdomain.com/api/auth/google/callback
```

3. **.env (Production)**:
```env
NODE_ENV=production
GOOGLE_CLIENT_ID=production_client_id
GOOGLE_CLIENT_SECRET=production_client_secret
GOOGLE_CALLBACK_URL=https://yourdomain.com/api/auth/google/callback
```

---

## ✅ Checklist

- [ ] Google Cloud Console Project yaratdim
- [ ] OAuth consent screen'i o'rnatdim
- [ ] OAuth 2.0 Client ID yaratdim
- [ ] JSON credential'larni yuklab oldim
- [ ] .env faylini update qildim (CLIENT_ID + SECRET)
- [ ] Server'ni restart qildim
- [ ] Google login test qildim
