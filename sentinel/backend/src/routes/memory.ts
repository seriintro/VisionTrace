/**
 * SENTINEL Memory Routes
 * GET  /api/memory/search?q=...       — search events & recordings
 * GET  /api/memory/report?days=7      — daily/weekly activity report
 * GET  /api/memory/recording/:id      — get stored memory for a recording
 * POST /api/memory/reindex/:id        — force re-index a specific recording
 */
import { Router, Request, Response } from 'express';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import {
  searchMemory, getRecentEvents, getRecordingsByDateRange,
  getRecordingMemory, getEventsForRecording
} from '../services/memoryStore';
import { autoIndexRecording } from '../services/autoIndex';
import { getIndex } from './videos';

const router = Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const MODEL = 'gemini-2.5-flash';

function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── Search ─────────────────────────────────────────────────────────────────
router.get('/search', async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Query required' });

  try {
    const results = await searchMemory(q, 20);
    res.json({ results, count: results.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Report ─────────────────────────────────────────────────────────────────
router.get('/report', async (req: Request, res: Response) => {
  const days = Math.min(30, Math.max(1, parseInt(String(req.query.days || '7'))));

  try {
    const toDate = localDateStr();
    const fromDate = localDateStr(new Date(Date.now() - days * 86400000));
    const recordings = await getRecordingsByDateRange(fromDate, toDate);
    const events = await getRecentEvents(days, 100);

    if (!recordings.length && !events.length) {
      return res.json({ report: `No recordings found in the last ${days} day(s).` });
    }

    // Ask Gemini to summarize
    const model = genAI.getGenerativeModel({ model: MODEL });
    const parts: Part[] = [];

    const recSummaries = recordings.map(r =>
      `• ${r.date} ${r.display_time} — ${r.summary || 'No summary'} [Tags: ${(r.tags || []).join(', ')}]`
    ).join('\n');

    const eventList = events.slice(0, 40).map(e =>
      `• ${e.date} ${e.display_time} (+${Math.round(e.time_offset || 0)}s) — ${e.label}: ${e.description}`
    ).join('\n');

    parts.push({
      text:
        `You are VisionTrace. Generate a concise ${days === 1 ? 'daily' : `${days}-day`} activity report.\n\n` +
        `RECORDINGS (${recordings.length} total):\n${recSummaries}\n\n` +
        `EVENTS (${events.length} total, showing ${Math.min(events.length, 40)}):\n${eventList}\n\n` +
        `Write a structured report with:\n` +
        `1. Overall summary (2-3 sentences)\n` +
        `2. Key events / notable moments\n` +
        `3. Unusual or suspicious activity (if any)\n` +
        `4. Quiet periods\n` +
        `Be direct and factual. Use bullet points.`
    });

    const result = await model.generateContent(parts);
    res.json({ report: result.response.text(), days, recordingCount: recordings.length, eventCount: events.length });

  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Get recording memory ───────────────────────────────────────────────────
router.get('/recording/:id', async (req: Request, res: Response) => {
  try {
    const mem = await getRecordingMemory(req.params.id);
    if (!mem) return res.status(404).json({ error: 'Not in memory — needs indexing' });
    const events = await getEventsForRecording(req.params.id);
    res.json({ recording: mem, events });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Force re-index ─────────────────────────────────────────────────────────
router.post('/reindex/:id', async (req: Request, res: Response) => {
  const index = getIndex();
  const all = Object.values(index).flat();
  const video = all.find(v => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });

  try {
    const result = await autoIndexRecording(video);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
