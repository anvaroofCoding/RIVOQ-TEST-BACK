import dotenv from 'dotenv';

dotenv.config();

export const config = {
  node_env: process.env.NODE_ENV || 'development',
  host: process.env.HOST || '0.0.0.0',
  port: process.env.PORT || 3000,
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/rivoq',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your_jwt_secret_key_change_in_production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  session: {
    secret: process.env.SESSION_SECRET || 'your_session_secret_key_change_in_production',
  },
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@example.com',
    password: process.env.ADMIN_PASSWORD || 'admin123',
  },
  google: {
    clientID: process.env.GOOGLE_CLIENT_ID || null,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback',
    secretConfigured: !!process.env.GOOGLE_CLIENT_SECRET,
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY || null,
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  },
  cors: {
    // For development: keep it wide open to avoid CORS blocking mobile/web clients.
    // NOTE: When `origin` is '*', `credentials` MUST be false.
    origin: process.env.CORS_ORIGIN || '*',
    credentials: process.env.CORS_CREDENTIALS === 'true' ? true : false,
  },
};
