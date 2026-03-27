import { Router, Request, Response } from 'express';
import { detectMoments } from '../services/gemini';
import { extractKeyFrames } from '../services/frameExtract';
import { getIndex } from './videos';

const router = Router();

// POST /api/moments/:videoId — detect key moments in a video
router.post('/:videoId', async (req: Request, res: Response) => {
  const { videoId } = req.params;

  const index = getIndex();
  const all = Object.values(index).flat();
  const video = all.find(v => v.id === videoId);

  if (!video) return res.status(404).json({ error: 'Video not found' });

  try {
    // Extract key frames spread across the video
    const keyFrames = await extractKeyFrames(video.filepath, 2);

    if (keyFrames.length === 0) {
      return res.json({ moments: [], message: 'Could not extract frames from video' });
    }

    // Run Gemini moment detection
    const moments = await detectMoments(video.id, keyFrames, video.date, video.displayTime);

    // Cache moments on the video object
    video.moments = moments;

    res.json({ moments, framesAnalyzed: keyFrames.length });
  } catch (err) {
    console.error('Moment detection error:', err);
    res.status(500).json({ error: `Moment detection failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// GET /api/moments — get all detected moments across all videos
router.get('/', (_req: Request, res: Response) => {
  const index = getIndex();
  const all = Object.values(index).flat();
  const allMoments = all.flatMap(v => (v.moments || []).map(m => ({ ...m, videoDate: v.date, videoTime: v.displayTime })));
  allMoments.sort((a, b) => b.detectedAt - a.detectedAt);
  res.json({ moments: allMoments });
});

export default router;
