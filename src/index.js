import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import passport from 'passport';
import os from 'os';

import { config } from './config/index.js';
import { connectDB } from './config/database.js';
import { swaggerSpec } from './config/swagger.js';
import { initializePassport } from './config/passport.js';
import path from 'path';
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

const app = express();

if (config.node_env === 'production') {
  app.set('trust proxy', 1);
}

// Security Middleware
// AdminJS uses inline scripts/styles on its pages; default Helmet CSP blocks them.
// Disable CSP globally for now to keep AdminJS working.
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

// Session Middleware
app.use(
  session({
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    store: new MongoStore({
      mongoUrl: config.mongodb.uri,
    }),
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      secure: config.node_env === 'production',
      httpOnly: true,
    },
  })
);

// Passport Initialize
initializePassport();
app.use(passport.initialize());
app.use(passport.session());

// AdminJS requires being mounted before any body-parser middleware.
// Otherwise @adminjs/express can throw a 500 on login POST.
// Also disable caching for AdminJS assets to avoid stale component bundles in development.
app.use('/admin/frontend/assets', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
setupAdmin(app);

app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

// Body Parser Middleware (must be after AdminJS)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// API Documentation
// Serve Swagger UI with persisted auth.
// Important: don't mount `setup()` on `app.use('/api-docs', ...)` because it can
// fight with static serving and lead to inconsistent UI behavior.
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

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.node_env,
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api', testRoutes);
app.use('/api', walletRoutes);
app.use('/api', rankingRoutes);
app.use('/api', notificationRoutes);
app.use('/api', aiRoutes);
app.use('/api', aiAnalyzeRoutes);
app.use('/api', activityRoutes);

// 404 Handler
app.use(notFoundHandler);

// Global Error Handler
app.use(errorHandler);

// Database Connection & Server Start
const startServer = async () => {
  try {
    await connectDB();
    await ensureDefaultAdminPanelUser();

    app.listen(config.port, config.host, () => {
      const ifaces = os.networkInterfaces();
      const ips = Object.values(ifaces)
        .flat()
        .filter((i) => i && i.family === 'IPv4' && !i.internal)
        .map((i) => i.address);
      const lan = ips[0];

      console.log(`\n${'='.repeat(50)}`);
      console.log(`✓ Server running on http://localhost:${config.port}`);
      if (lan) {
        console.log(`✓ LAN Base URL: http://${lan}:${config.port}`);
        console.log(`✓ LAN API Base: http://${lan}:${config.port}/api`);
      }
      console.log(`✓ API Docs: http://localhost:${config.port}/api-docs`);
      console.log(`✓ Admin Dashboard: http://localhost:${config.port}/admin`);
      console.log(`✓ Environment: ${config.node_env}`);
      console.log(`${'='.repeat(50)}\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();

export default app;
