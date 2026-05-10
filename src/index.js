import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import session from 'express-session';
import passport from 'passport';
import os from 'os';
import fs from 'fs';
import path from 'path';

import { config } from './config/index.js';
import { connectDB, createMongoSessionStore } from './config/database.js';
import { swaggerSpec } from './config/swagger.js';
import { initializePassport } from './config/passport.js';
import { setupAdmin, ensureDefaultAdminPanelUser } from './admin/setup.js';

import authRoutes from './routes/authRoutes.js';
import testRoutes from './routes/testRoutes.js';
import walletRoutes from './routes/walletRoutes.js';
import rankingRoutes from './routes/rankingRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import aiAnalyzeRoutes from './routes/aiAnalyzeRoutes.js';
import activityRoutes from './routes/activityRoutes.js';

import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

process.on('unhandledRejection', (reason) => {
  console.error('[RIVOQ FATAL] Unhandled rejection:', reason instanceof Error ? reason.stack : reason);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('[RIVOQ FATAL] Uncaught exception:', err?.stack || err);
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

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.node_env,
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api', testRoutes);
  app.use('/api', walletRoutes);
  app.use('/api', rankingRoutes);
  app.use('/api', notificationRoutes);
  app.use('/api', aiRoutes);
  app.use('/api', aiAnalyzeRoutes);
  app.use('/api', activityRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

async function bootstrap() {
  const port = Number(config.port) || 3000;
  console.log(`[RIVOQ] start node=${process.version} env=${config.node_env} port=${port} host=${config.host}`);

  await connectDB();
  await ensureDefaultAdminPanelUser();

  fs.writeSync(2, '[RIVOQ] HTTP: Express app yig‘ilmoqda (AdminJS bundle bo‘lishi mumkin)…\n');

  const app = await buildApp();

  fs.writeSync(2, `[RIVOQ] HTTP: listen(${config.host}:${port})…\n`);

  return new Promise((resolve, reject) => {
    app.listen(port, config.host, () => {
      const ifaces = os.networkInterfaces();
      const ips = Object.values(ifaces)
        .flat()
        .filter((i) => i && i.family === 'IPv4' && !i.internal)
        .map((i) => i.address);
      const lan = ips[0];

      console.log(`\n${'='.repeat(50)}`);
      console.log(`✓ Server running on http://localhost:${port}`);
      if (lan) {
        console.log(`✓ LAN Base URL: http://${lan}:${port}`);
        console.log(`✓ LAN API Base: http://${lan}:${port}/api`);
      }
      console.log(`✓ API Docs: http://localhost:${port}/api-docs`);
      console.log(`✓ Admin Dashboard: http://localhost:${port}/admin`);
      console.log(`✓ Environment: ${config.node_env}`);
      console.log(`${'='.repeat(50)}\n`);
      fs.writeSync(2, `[RIVOQ] HTTP: server ochiq — port ${port}\n`);
      resolve();
    }).on('error', reject);
  });
}

bootstrap().catch((error) => {
  const detail = error?.stack || error?.message || error;
  try {
    fs.writeSync(2, `Failed to start server:\n${detail}\n`);
  } catch {
    // ignore
  }
  console.error('Failed to start server:', detail);
  process.exit(1);
});
