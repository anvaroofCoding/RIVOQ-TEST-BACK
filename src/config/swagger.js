import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'RIVOQ Backend API',
      version: '1.0.0',
      description: 'Professional Express.js Backend API with MongoDB',
      contact: {
        name: 'Support',
        email: 'support@rivoq.com',
      },
    },
    servers: [
      {
        url: '/api',
        description: 'Current server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    // Apply JWT auth by default to all endpoints in Swagger UI.
    // Public endpoints can override with `security: []` in their route docs.
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  // Document OAuth + Test solving endpoints.
  apis: [
    './src/routes/authRoutes.js',
    './src/routes/profileRoutes.js',
    './src/routes/testRoutes.js',
    './src/routes/rankingRoutes.js',
    './src/routes/walletRoutes.js',
    './src/routes/notificationRoutes.js',
    './src/routes/aiRoutes.js',
    './src/routes/aiAnalyzeRoutes.js',
    './src/routes/activityRoutes.js',
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
