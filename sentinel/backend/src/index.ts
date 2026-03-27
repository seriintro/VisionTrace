import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

import videosRouter  from './routes/videos';
import analyzeRouter from './routes/analyze';
import uploadRouter  from './routes/upload';
import momentsRouter from './routes/moments';
import streamRouter  from './routes/stream';
import memoryRouter  from './routes/memory';

const app  = express();
const PORT = parseInt(process.env.PORT || '3001');

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.use('/api/videos',  videosRouter);
app.use('/api/analyze', analyzeRouter);
app.use('/api/upload',  uploadRouter);
app.use('/api/moments', momentsRouter);
app.use('/api/stream',  streamRouter);
app.use('/api/memory',  memoryRouter);

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'VisionTrace Backend',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    env: {
      droidcamUrl:      process.env.DROIDCAM_URL || 'http://192.168.x.x:4747',
      videosDir:        path.resolve(process.env.VIDEOS_DIR || '../surveillance-videos'),
      geminiConfigured: !!process.env.GEMINI_API_KEY,
      memoryDb:         path.resolve(process.env.MEMORY_DB_PATH || '../sentinel-memory.db'),
    },
  });
});

app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║         VisionTrace Backend v2.0.0          ║
╠══════════════════════════════════════════╣
║  API      →  http://localhost:${PORT}       ║
║  Memory   →  SQLite (persistent)         ║
║  Gemini   →  ${process.env.GEMINI_API_KEY ? '✓ configured' : '✗ MISSING KEY  '}       ║
╚══════════════════════════════════════════╝
  `);
});

export default app;
