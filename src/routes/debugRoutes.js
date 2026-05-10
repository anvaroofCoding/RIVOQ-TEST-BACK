import express from 'express';

const debugRouter = express.Router();

/**
 * @swagger
 * /debug/oauth-config:
 *   get:
 *     tags: [Debug]
 *     summary: OAuth configuration status
 *     description: Shows current OAuth configuration (development only)
 */
debugRouter.get('/oauth-config', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackUrl = process.env.GOOGLE_CALLBACK_URL;

  const isConfigured = {
    client_id_set: clientId && !clientId.includes('your_google'),
    client_secret_set: clientSecret && !clientSecret.includes('your_google'),
    callback_url_set: !!callbackUrl,
  };

  const status = isConfigured.client_id_set && isConfigured.client_secret_set && isConfigured.callback_url_set;

  res.json({
    status: status ? 'READY' : 'INCOMPLETE',
    configured: isConfigured,
    config: {
      NODE_ENV: process.env.NODE_ENV,
      GOOGLE_CLIENT_ID: clientId ? '***' + clientId.slice(-10) : 'NOT_SET',
      GOOGLE_CLIENT_SECRET: clientSecret ? '***' + clientSecret.slice(-10) : 'NOT_SET',
      GOOGLE_CALLBACK_URL: callbackUrl || 'NOT_SET',
    },
    instructions: 'https://console.cloud.google.com',
    setup_guide: '/GOOGLE_OAUTH_COMPLETE_SETUP.md',
  });
});

export default debugRouter;
