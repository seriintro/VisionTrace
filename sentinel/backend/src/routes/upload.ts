import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { VIDEOS_DIR } from './videos';
import { autoIndexRecording } from '../services/autoIndex';
import { VideoFile } from '../types';

const router = Router();
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const now = new Date();
    const localToday = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const dateParam = (req.query.date as string) || localToday;
    const dateMatch = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : localToday;
    const dir = path.join(VIDEOS_DIR, dateMatch);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const base = path.basename(file.originalname, path.extname(file.originalname));
    const ext = path.extname(file.originalname).toLowerCase();
    const timeNow = new Date().toTimeString().slice(0, 8).replace(/:/g, '-');
    const safeName = /^\d{2}[-_:]\d{2}/.test(base) ? `${base}${ext}` : `${timeNow}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    VIDEO_EXTENSIONS.includes(ext) ? cb(null, true) : cb(new Error(`Unsupported format. Allowed: ${VIDEO_EXTENSIONS.join(', ')}`));
  },
});

router.post('/', upload.single('video'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No video file provided' });

  // Respond immediately — don't block upload on indexing
  res.json({
    success: true,
    filename: req.file.filename,
    path: req.file.path,
    size: req.file.size,
    message: `Uploaded to ${req.file.destination}`,
  });

  // Auto-index in background
  try {
    const folder = path.basename(req.file.destination); // YYYY-MM-DD
    const base   = path.basename(req.file.filename, path.extname(req.file.filename));
    let hour = '00', minute = '00', second = '00';
    const hms = base.match(/^(\d{2})[-_:](\d{2})[-_:](\d{2})/);
    if (hms) { [, hour, minute, second] = hms; }
    const [year, month, day] = folder.split('-');

    const videoFile: VideoFile = {
      id: uuidv4(),
      filename: req.file.filename,
      filepath: req.file.path,
      date: folder,
      time: `${hour}-${minute}-${second}`,
      displayTime: `${hour}:${minute}`,
      timestamp: new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`).getTime(),
      size: req.file.size,
      moments: [],
    };

    autoIndexRecording(videoFile).catch(e => console.error('[Upload AutoIndex]', e));
  } catch (e) {
    console.error('[Upload AutoIndex setup]', e);
  }
});

export default router;
