import express from 'express';
import path from 'path';
import morgan from 'morgan';
import { createServer as createViteServer } from 'vite';
import { env } from './server/config/env.ts';
import { connectDatabase } from './server/config/db.ts';
import apiRouter from './server/routes/api.ts';
import { errorHandler } from './server/middleware/errorHandler.ts';

async function startServer() {
  const app = express();

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan('tiny'));

  // Attempt MongoDB Atlas connection on startup (honest status tracked in getDatabaseHealth)
  const dbHealth = await connectDatabase();
  if (dbHealth.connected) {
    console.log(`[Database] Connected to MongoDB Atlas (${dbHealth.host}/${dbHealth.name})`);
  } else {
    console.warn(`[Database] ${dbHealth.status}: ${dbHealth.message}`);
  }

  // Mount REST API
  app.use('/api', apiRouter);

  // Unknown API routes return JSON 404
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  // Centralized error handler
  app.use(errorHandler);

  if (env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(env.PORT, '0.0.0.0', () => {
    console.log(`[Server] OptiStock Retail running on http://0.0.0.0:${env.PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Server Fatal]', err);
  process.exit(1);
});
