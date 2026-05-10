# RIVOQ Backend API

Professional-grade Express.js backend API with MongoDB, Swagger documentation, and AdminJS admin panel.

## Features

✨ **Core Features**
- Express.js framework
- MongoDB with Mongoose ODM
- JWT Authentication & Authorization
- Role-based access control (RBAC)
- Input validation with Joi
- Error handling middleware
- Security with Helmet.js
- CORS support
- Morgan logging

📚 **Documentation & Admin**
- Swagger/OpenAPI documentation
- AdminJS admin panel
- API health check endpoint

🔒 **Security**
- Password hashing with bcryptjs
- JWT token generation
- Authentication middleware
- Authorization by roles
- Helmet security headers

## Project Structure

```
src/
├── config/          # Configuration files
│   ├── index.js     # Main config
│   ├── database.js  # MongoDB connection
│   └── swagger.js   # Swagger setup
├── models/          # Mongoose schemas
│   ├── User.js
│   ├── Subject.js
│   ├── Topic.js
│   ├── Question.js
│   └── TestSession.js
├── controllers/     # Request handlers
│   ├── authController.js
│   └── testController.js
├── services/        # Business logic
│   └── authService.js
├── routes/          # API routes
│   ├── authRoutes.js
│   └── testRoutes.js
├── middleware/      # Custom middleware
│   ├── auth.js
│   └── errorHandler.js
├── validators/      # Joi validation schemas
│   └── schemas.js
├── utils/           # Utility functions
│   ├── AppError.js
│   ├── jwt.js
│   └── validators.js
├── admin/           # AdminJS setup
│   └── setup.js
└── index.js         # Application entry point
```

## Installation

### Prerequisites
- Node.js >= 16.0.0
- npm >= 8.0.0
- MongoDB running locally or MongoDB Atlas URI

### Setup

1. **Clone & Install**
```bash
npm install
```

2. **Environment Setup**
```bash
cp .env.example .env
```

3. **Configure .env**
```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/rivoq
JWT_SECRET=your_secret_key
SESSION_SECRET=your_session_secret
```

## Running the Server

### Development Mode with Auto-reload
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

## API Documentation

### Swagger UI
- **URL**: http://localhost:3000/api-docs
- **Format**: OpenAPI 3.0.0
- Interactive API testing interface

### API Base URL
- **Development**: http://localhost:3000/api

### Network / Expo (LAN) usage
Expo (phone/emulator) ko‘pincha `localhost`ga ucha olmaydi. Shu sabab backend’ni tarmoqda oching va LAN IP’dan foydalaning.

1) Serverni ishga tushiring:
```bash
npm run dev
```

2) Terminalda `LAN Base URL` chiqadi. Shuni Expo’da ishlating:
- **LAN API Base**: `http://<LAN_IP>:3000/api`
- **Swagger**: `http://<LAN_IP>:3000/api-docs`

## Admin Panel

### Access AdminJS
- **URL**: http://localhost:3000/admin
- **Default Credentials**: 
  - Email: admin@rivoq.com
  - Password: 123123

### Admin panelda nimalar boshqariladi
- **Users**: userlarni ko‘rish va admin yaratish (`role=admin`)
- **Test yaratish**:
  - **Fan** (`Subject`)
  - **Mavzu yaratish** (`Topic`) → daqiqa (`minutes`) va qiyinlik
  - **Savol qo‘shish**: Topic ichiga savol + 1 to‘g‘ri + 3 xato javob

## API Endpoints (Swagger’da aynan shu endpointlar bor)

Eslatma: `Auth` endpointlaridan tashqari hammasi **JWT token** talab qiladi.

### Auth (`/api/auth`)

#### `GET /api/auth/google`
Google login flow’ni boshlaydi (redirect).

#### `GET /api/auth/google/callback`
Google’dan qaytgan callback. Response ichida JWT qaytadi.

**Response (200):**
```json
{
  "success": true,
  "message": "Google login successful",
  "data": {
    "user": {
      "_id": "string",
      "name": "string",
      "email": "string",
      "role": "user|admin"
    },
    "token": "jwt"
  }
}
```

#### `GET /api/auth/dev-token?email=...` (DEV only)
Swagger test qilish uchun qulay token beradi (production’da ishlamaydi). Agar user DB’da yo‘q bo‘lsa, development’da avtomatik yaratadi.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "token": "jwt",
    "user": {
      "_id": "string",
      "email": "string",
      "name": "string"
    }
  }
}
```

#### Email OTP Login (6 xonali kod)
Google’dan tashqari, email orqali ham login/register ishlaydi: user emailini yozadi → 6 xonali kod boradi → kodni tasdiqlasa JWT oladi.

##### `POST /api/auth/email/request-code`
Emailga 6 xonali kod yuboradi (10 minut amal qiladi).

**Body:**
```json
{ "email": "user@example.com" }
```

**Response (200):**
```json
{
  "success": true,
  "message": "Verification code sent",
  "data": {
    "email": "user@example.com",
    "expiresInSeconds": 600
  }
}
```

##### `POST /api/auth/email/verify-code`
6 xonali kodni tasdiqlaydi va JWT token qaytaradi.

**Body:**
```json
{ "email": "user@example.com", "code": "123456" }
```

**Response (200):**
```json
{
  "success": true,
  "message": "Email verified",
  "data": {
    "token": "jwt",
    "user": {
      "_id": "string",
      "email": "user@example.com",
      "name": "string"
    }
  }
}
```

##### SMTP sozlash (production uchun)
OTP email real yuborilishi uchun `.env`ga quyidagilarni qo‘ying:
```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_user
SMTP_PASS=your_pass
EMAIL_FROM=no-reply@yourdomain.com
```

DEV’da SMTP bo‘lmasa kod terminal log’da chiqadi:
`[DEV OTP] email=... code=123456`

### Test (`/api`)

#### `GET /api/me`
Token egasining profili.

**Headers:**
`Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "string",
      "name": "string",
      "email": "string",
      "role": "user|admin"
    }
  }
}
```

#### `GET /api/subjects`
Fanlar ro‘yxati (`Subject`).

**Response (200):**
```json
{
  "success": true,
  "data": {
    "subjects": [
      {
        "_id": "string",
        "name": "Math",
        "description": "string"
      }
    ]
  }
}
```

#### `GET /api/subjects/{subjectId}/topics`
Tanlangan fan bo‘yicha mavzular (`Topic`).

**Response (200):**
```json
{
  "success": true,
  "data": {
    "topics": [
      {
        "_id": "string",
        "subject": "string",
        "name": "string",
        "description": "string",
        "minutes": 3,
        "difficulty": "OSON|O'RTACHA|QIYIN",
        "questionCount": 5
      }
    ]
  }
}
```

#### `POST /api/topics/{topicId}/start`
Topic uchun testni boshlaydi va **session** yaratadi.

**Response (201):**
```json
{
  "success": true,
  "message": "Test started",
  "data": {
    "sessionId": "string",
    "topic": {
      "_id": "string",
      "name": "string",
      "minutes": 3,
      "difficulty": "OSON"
    },
    "total": 5,
    "expiresAt": "2026-01-01T00:00:00.000Z",
    "current": {
      "index": 0,
      "questionId": "string",
      "question": "string",
      "options": ["a", "b", "c", "d"]
    }
  }
}
```

#### `GET /api/sessions/{sessionId}`
Session status + current savol. Vaqt tugagan bo‘lsa session avtomatik `finished` bo‘ladi.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "session": {
      "_id": "string",
      "status": "in_progress|finished",
      "score": 2,
      "total": 5,
      "currentIndex": 2,
      "expiresAt": "ISO_DATE",
      "correctCount": 2,
      "wrongCount": 1,
      "unansweredCount": 2
    },
    "current": {
      "index": 2,
      "questionId": "string",
      "question": "string",
      "options": ["a", "b", "c", "d"]
    }
  }
}
```

#### `POST /api/sessions/{sessionId}/answer`
Hozirgi savolga javob yuboradi va keyingisiga o‘tkazadi (yoki tugatadi).

**Body:**
```json
{ "answer": "optionValue" }
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "isCorrect": true,
    "status": "in_progress|finished",
    "score": 3,
    "total": 5,
    "correctCount": 3,
    "wrongCount": 1,
    "unansweredCount": 1,
    "next": {
      "index": 3,
      "questionId": "string",
      "question": "string",
      "options": ["a", "b", "c", "d"]
    }
  }
}
```

#### `GET /api/sessions/{sessionId}/results`
Faqat `finished` session uchun natija: to‘g‘ri/xato/yechilmagan va **to‘g‘ri javoblar**.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "session": {
      "_id": "string",
      "status": "finished",
      "score": 3,
      "total": 5,
      "correctCount": 3,
      "wrongCount": 1,
      "unansweredCount": 1
    },
    "questions": [
      {
        "index": 0,
        "question": "string",
        "options": ["a", "b", "c", "d"],
        "correctAnswer": "a",
        "selectedAnswer": "b",
        "isCorrect": false
      }
    ]
  }
}
```

#### `GET /api/sessions`
Arxiv (foydalanuvchi yechgan sessionlar ro‘yxati).

#### `GET /api/analytics/me`
Analitika summary:
- `totalSessions`
- `totalQuestions`
- `totalCorrect`
- `totalWrong`
- `totalUnanswered`
- `avgScorePct`

## Middleware Stack

### Security
- **Helmet.js**: Sets HTTP security headers
- **CORS**: Cross-origin resource sharing

### Logging
- **Morgan**: HTTP request logging

### Validation
- **Joi**: Request body/parameter validation
- **Custom validators**: Property-level validation

### Error Handling
- **Express async errors**: Automatic async error catching
- **Global error handler**: Centralized error processing

### Authentication
- **JWT Bearer tokens**: Token-based authentication
- **Role-based authorization**: Admin/User role checking

## Error Handling

### Standard Error Response
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation Error",
  "errors": [
    {
      "field": "email",
      "message": "\"email\" must be a valid email"
    }
  ]
}
```

### HTTP Status Codes
- `200`: Success
- `201`: Created
- `400`: Bad Request (Validation Error)
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `409`: Conflict (User exists)
- `500`: Internal Server Error

## Development

### Running Tests
```bash
npm test
```

### Linting
```bash
npm run lint
```

### Environment Variables
Copy `.env.example` to `.env` and update values:
- `NODE_ENV`: development/production
- `PORT`: Server port
- `MONGODB_URI`: Database connection string
- `JWT_SECRET`: JWT signing secret
- `SESSION_SECRET`: Session encryption secret

## Security Best Practices

✅ **Implemented**
- Password hashing (bcryptjs)
- JWT token validation
- CORS protection
- Helmet security headers
- Input validation & sanitization
- Role-based access control
- Error message sanitization
- HTTP-only session cookies

## Performance Optimizations

- Connection pooling
- Query pagination
- Index optimization
- Async/await error handling
- Efficient middleware ordering

## Health Check

```http
GET /health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "environment": "development"
}
```

## Deployment

### Environment Variables for Production
Update `.env`:
```env
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/rivoq
JWT_SECRET=your_secure_secret_key
SESSION_SECRET=your_secure_session_key
CORS_ORIGIN=https://yourfrontend.com
```

### Start Production Server
```bash
npm start
```

## Troubleshooting

### MongoDB Connection Failed
- Ensure MongoDB is running
- Check `MONGODB_URI` in `.env`
- Verify network access (firewall, IP whitelist)

### JWT Token Errors
- Verify token in Authorization header: `Bearer {token}`
- Check `JWT_SECRET` consistency
- Ensure token hasn't expired

### Swagger Execute ishlamayapti
- `http://localhost:3000/api-docs` ni **Cmd+Shift+R** bilan refresh qiling
- Dev’da token olish: `GET /api/auth/dev-token?email=...`
- Swagger `Authorize` oynasiga **faqat tokenni o‘zini** kiriting (Bearer yozmang)

### Admin Panel Not Loading
- Clear browser cache
- Check AdminJS dependencies installed
- Verify `connect-mongo` connectivity

## License

ISC

## Support

For issues and support: support@rivoq.com
