# Google OAuth Setup Guide

## Google Cloud Console'dan OAuth Credentials Olish

### 1. Google Cloud Console'ga kirish
1. [Google Cloud Console](https://console.cloud.google.com) ga kiring
2. New Project yarating yoki mavjud proyektdan foydalaning

### 2. OAuth Consent Screen'ini sozlash
1. **APIs & Services** → **OAuth consent screen** qismiga o'ting
2. **User Type**: External tanlang
3. App nomini kiriting: "RIVOQ Backend"
4. Support email'ini kiriting
5. Developer contact ma'lumotlarini kiriting
6. Scope'larni qo'shing:
   - `email`
   - `profile`
   - `openid`

### 3. OAuth 2.0 Credentials yaratish
1. **APIs & Services** → **Credentials** qismiga o'ting
2. **Create Credentials** → **OAuth 2.0 Client ID** tanlang
3. Application type: **Web application** tanlang
4. Authorized JavaScript origins qo'shing:
   ```
   http://localhost:3000
   http://localhost:3000
   ```
5. Authorized redirect URIs qo'shing:
   ```
   http://localhost:3000/api/auth/google/callback
   ```
6. **Credentials yaratish** bosgich

### 4. Client ID va Secret'ni .env'ga qo'shish
```env
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
```

## Google OAuth Flow

### Frontend'da:
```html
<a href="http://localhost:3000/api/auth/google">
  Login with Google
</a>
```

### Backend Flow:
1. User `GET /api/auth/google` qiladi
2. Google login page'ga redirect bo'ladi
3. User Google akkauntida login qiladi
4. Google API callback'ni chaqiradi
5. Server JWT token yaratadi
6. User ma'lumotlari bilan JSON response qaytaradi

### Callback Response:
```json
{
  "success": true,
  "message": "Google login successful",
  "data": {
    "user": {
      "_id": "...",
      "name": "User Name",
      "email": "user@gmail.com",
      "role": "user",
      "avatar": "https://..."
    },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

## Endpoint'lar

### Google Login Boshlash
```http
GET /api/auth/google
```
Google login page'ga redirect qiladi.

### Google Callback (Automatic)
```http
GET /api/auth/google/callback?code=...&state=...
```
Google API shaxsan chaqiradi. JWT token bilan response qaytaradi.

## Testing

### 1. Frontend test link:
```html
<a href="http://localhost:3000/api/auth/google">Google bilan kirish</a>
```

### 2. Manual redirect linkni qo'llash:
```
http://localhost:3000/api/auth/google
```

User Google qabul qilgach, token oladi va RIVOQ akkauntini yaratadi yoki tasdiqlab kiradi.

## Production Deploy'da

Production uchun:
```env
GOOGLE_CLIENT_ID=production_client_id
GOOGLE_CLIENT_SECRET=production_client_secret
GOOGLE_CALLBACK_URL=https://yourdomain.com/api/auth/google/callback
```

Google Cloud Console'da authorized redirect URIs'ga qo'shish:
```
https://yourdomain.com/api/auth/google/callback
```

## Xavfsizlik Eslatmalari

✅ `GOOGLE_CLIENT_SECRET` hech qachon front-end'ga jo'natolmang
✅ HTTPS'ni production'da ishlating
✅ CSRF protection'ni ishlating
✅ JWT token expiration set qiling
