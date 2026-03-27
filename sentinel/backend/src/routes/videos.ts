import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { indexVideos, getAvailableDates } from '../services/videoIndex';
import { generateThumbnail, getVideoDuration } from '../services/frameExtract';

const router = Router();
const VIDEOS_DIR = path.resolve(process.env.VIDEOS_DIR || '../surveillance-videos');

// Cache index in memory, refresh on request
let videoIndexCache: ReturnType<typeof indexVideos> | null = null;
let lastIndexed = 0;
const INDEX_TTL = 30_000; // 30s

function getIndex() {
  if (!videoIndexCache || Date.now() - lastIndexed > INDEX_TTL) {
    videoIndexCache = indexVideos(VIDEOS_DIR);
    lastIndexed = Date.now();
  }
  return videoIndexCache;
}

// GET /api/videos — list all videos grouped by date
router.get('/', (_req: Request, res: Response) => {
  try {
    const index = getIndex();
    const dates = getAvailableDates(index);
    const result = dates.map(date => ({
      date,
      videos: index[date].map(v => ({
        id: v.id,
        filename: v.filename,
        date: v.date,
        time: v.time,
        displayTime: v.displayTime,
        timestamp: v.timestamp,
        size: v.size,
        duration: v.duration,
        moments: v.moments,
      })),
    }));
    res.json({ groups: result, totalVideos: Object.values(index).flat().length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/videos/dates — list available dates
router.get('/dates', (_req: Request, res: Response) => {
  const index = getIndex();
  res.json({ dates: getAvailableDates(index) });
});

// GET /api/videos/:id/thumbnail — generate thumbnail
router.get('/:id/thumbnail', async (req: Request, res: Response) => {
  const index = getIndex();
  const all = Object.values(index).flat();
  const video = all.find(v => v.id === req.params.id);

  if (!video) return res.status(404).json({ error: 'Video not found' });

  try {
    const thumb = await generateThumbnail(video.filepath);
    if (!thumb) return res.status(500).json({ error: 'Thumbnail generation failed' });
    res.json({ thumbnail: thumb });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/videos/:id/stream — stream video file
router.get('/:id/stream', (req: Request, res: Response) => {
  const index = getIndex();
  const all = Object.values(index).flat();
  const video = all.find(v => v.id === req.params.id);

  if (!video) return res.status(404).json({ error: 'Video not found' });
  if (!fs.existsSync(video.filepath)) return res.status(404).json({ error: 'File not found on disk' });

  const stat = fs.statSync(video.filepath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    const file = fs.createReadStream(video.filepath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp4',
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    });
    fs.createReadStream(video.filepath).pipe(res);
  }
});

// GET /api/videos/refresh — force re-index
router.post('/refresh', (_req: Request, res: Response) => {
  videoIndexCache = null;
  lastIndexed = 0;
  const index = getIndex();
  res.json({ success: true, count: Object.values(index).flat().length });
});

export default router;
export { getIndex, VIDEOS_DIR };
