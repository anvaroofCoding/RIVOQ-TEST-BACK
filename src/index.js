import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import session from 'express-session';
import passport from 'passport';
import os from 'os';
import path from 'path';

import { config } from './config/index.js';
import { connectDB, createMongoSessionStore } from './config/database.js';
import { swaggerSpec } from './config/swagger.js';
import { initializePassport } from './config/passport.js';
import { setupAdmin, ensureDefaultAdminPanelUser } from './admin/setup.js';

import authRoutes from './routes/authRoutes.js';
import testRoutes from './routes/testRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import walletRoutes from './routes/walletRoutes.js';
import rankingRoutes from './routes/rankingRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import aiAnalyzeRoutes from './routes/aiAnalyzeRoutes.js';
import activityRoutes from './routes/activityRoutes.js';
import companyRoutes from './routes/companyRoutes.js';

import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createMailer, smtpMissingEnvKeysForOtp } from './utils/email.js';

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason instanceof Error ? reason.stack : reason);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err?.stack || err);
  process.exit(1);
});

async function buildApp() {
  const app = express();

  if (config.node_env === 'production') {
    app.set('trust proxy', 1);
  }

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: config.cors.origin,
      credentials: config.cors.credentials,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );
  app.use(morgan('combined'));

  app.use(
    session({
      secret: config.session.secret,
      resave: false,
      saveUninitialized: false,
      store: createMongoSessionStore(),
      cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        secure: config.node_env === 'production',
        httpOnly: true,
      },
    })
  );

  initializePassport();
  app.use(passport.initialize());
  app.use(passport.session());

  app.use('/admin/frontend/assets', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  await setupAdmin(app);

  app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

  // AdminJS dan keyin — global json `req._body` bilan AdminJS routerini buzadi
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  app.use('/api-docs', swaggerUi.serve);
  app.get(
    '/api-docs',
    swaggerUi.setup(swaggerSpec, {
      swaggerOptions: { persistAuthorization: true },
    })
  );
  app.get(
    '/api-docs/',
    swaggerUi.setup(swaggerSpec, {
      swaggerOptions: { persistAuthorization: true },
    })
  );
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  /** `/api/health` — BASE_URL `.../api` bo‘lsa ham tekshirish uchun (`/health` bilan bir xil). */
  const sendHealthJson = (_req, res) => {
    const smtpConfigured = !!createMailer();
    const body = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.node_env,
      smtpOtpConfigured: smtpConfigured,
    };
    if (!smtpConfigured) {
      body.smtpOtpMissingEnv = smtpMissingEnvKeysForOtp();
    }
    res.json(body);
  };
  app.get('/health', sendHealthJson);
  app.get('/api/health', sendHealthJson);

  app.get(['/api', '/api/'], (req, res) => {
    res.json({
      ok: true,
      message: 'API root — aniq patchlar /api/... ostida',
      health: '/health',
      docs: '/api-docs',
      admin: '/admin',
      examples: {
        auth: '/api/auth',
        subjects: 'GET /api/subjects (Bearer token)',
        me: 'GET /api/me',
      },
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api', testRoutes);
  app.use('/api', profileRoutes);
  app.use('/api', walletRoutes);
  app.use('/api', rankingRoutes);
  app.use('/api', notificationRoutes);
  app.use('/api', aiRoutes);
  app.use('/api', aiAnalyzeRoutes);
  app.use('/api', activityRoutes);
  app.use('/api/company', companyRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

async function bootstrap() {
  const port = Number(config.port) || 3000;

  await connectDB();
  await ensureDefaultAdminPanelUser();

  const app = await buildApp();

  return new Promise((resolve, reject) => {
    app.listen(port, config.host, () => {
      if (config.node_env === 'production') {
        console.log(`Listening on port ${port}`);
      } else {
        const ifaces = os.networkInterfaces();
        const ips = Object.values(ifaces)
          .flat()
          .filter((i) => i && i.family === 'IPv4' && !i.internal)
          .map((i) => i.address);
        const lan = ips[0];
        console.log(`\n${'='.repeat(50)}`);
        console.log(`✓ Server http://localhost:${port}`);
        if (lan) console.log(`✓ LAN http://${lan}:${port}`);
        console.log(`✓ Docs http://localhost:${port}/api-docs`);
        console.log(`✓ Admin http://localhost:${port}/admin`);
        console.log(`${'='.repeat(50)}\n`);
      }
      resolve();
    }).on('error', reject);
  });
}

bootstrap().catch((error) => {
  console.error('Server start:', error?.stack || error?.message || error);
  process.exit(1);
});
