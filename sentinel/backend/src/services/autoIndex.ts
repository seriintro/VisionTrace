/**
 * SENTINEL Auto-Indexer
 * When a recording is saved, this runs in the background:
 *   1. Extracts frames
 *   2. Sends to Gemini for structured analysis
 *   3. Stores summary + tags + events into SQLite memory
 */
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';
import { extractFramesFromVideo } from './frameExtract';
import {
  upsertRecording, insertEvents, isRecordingIndexed,
  EventMemory, persist
} from './memoryStore';
import { VideoFile } from '../types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const MODEL = 'gemini-2.5-flash';

export interface AutoIndexResult {
  success: boolean;
  summary?: string;
  tags?: string[];
  eventCount?: number;
  error?: string;
}

/**
 * Auto-index a video recording into persistent memory.
 * Safe to call multiple times — skips if already indexed.
 */
export async function autoIndexRecording(video: VideoFile): Promise<AutoIndexResult> {
  try {
    // Skip if already indexed
    const alreadyDone = await isRecordingIndexed(video.id);
    if (alreadyDone) return { success: true };

    console.log(`[AutoIndex] Indexing ${video.filename} (${video.date} ${video.displayTime})`);

    // Extract frames spread across the full recording
    let frames: string[] = [];
    try {
      frames = await extractFramesFromVideo(video.filepath, 6, 0);
    } catch (e) {
      console.warn('[AutoIndex] Frame extraction failed:', e);
    }

    if (frames.length === 0) {
      // Still register the recording in memory, just without visual analysis
      await upsertRecording({
        id: video.id,
        filename: video.filename,
        filepath: video.filepath,
        date: video.date,
        display_time: video.displayTime,
        timestamp: video.timestamp,
        duration: video.duration,
        size: video.size,
        summary: 'Frame extraction failed — visual analysis unavailable.',
        tags: [],
        anomalies: [],
        indexed_at: Date.now(),
      });
      return { success: false, error: 'Frame extraction failed' };
    }

    // Build Gemini prompt for structured analysis
    const parts: Part[] = [];
    parts.push({
      text:
        `You are VisionTrace's automated memory indexer. Analyze these ${frames.length} frames from a surveillance recording.\n` +
        `Recording: ${video.date} at ${video.displayTime} (file: ${video.filename})\n\n` +
        `Respond ONLY with a valid JSON object — no markdown, no extra text — with this exact shape:\n` +
        `{\n` +
        `  "summary": "2-3 sentence plain-English description of what happened in this recording",\n` +
        `  "people_desc": "description of people seen (clothing, count, actions) or 'No people detected'",\n` +
        `  "tags": ["array", "of", "keywords", "seen"],\n` +
        `  "anomalies": ["list any unusual/suspicious events, or empty array"],\n` +
        `  "events": [\n` +
        `    {\n` +
        `      "frame_index": 0,\n` +
        `      "label": "short event title",\n` +
        `      "description": "1-2 sentence description",\n` +
        `      "tags": ["person","motion","object","anomaly","vehicle","animal"],\n` +
        `      "confidence": 0.85\n` +
        `    }\n` +
        `  ]\n` +
        `}\n` +
        `Only include notable events. If a frame is empty/static, skip it.`
    });

    frames.forEach((f, i) => {
      parts.push({ text: `Frame ${i + 1} of ${frames.length}:` });
      const data = f.includes(',') ? f.split(',')[1] : f;
      parts.push({ inlineData: { mimeType: 'image/jpeg', data } });
    });

    const model = genAI.getGenerativeModel({ model: MODEL });
    const result = await model.generateContent(parts);
    const text = result.response.text().trim().replace(/```json|```/g, '').trim();

    let parsed: any = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      console.warn('[AutoIndex] JSON parse failed, using raw text as summary');
      parsed = { summary: text.slice(0, 500), tags: [], anomalies: [], events: [] };
    }

    const summary = String(parsed.summary || 'No summary available.');
    const tags: string[] = Array.isArray(parsed.tags) ? parsed.tags : [];
    const anomalies: string[] = Array.isArray(parsed.anomalies) ? parsed.anomalies : [];
    const people_desc = String(parsed.people_desc || '');
    const rawEvents: any[] = Array.isArray(parsed.events) ? parsed.events : [];

    // Calculate approx frame timestamps
    const frameInterval = video.duration && video.duration > 0
      ? video.duration / (frames.length + 1)
      : 10; // fallback: assume 10s per frame

    // Store recording in memory
    await upsertRecording({
      id: video.id,
      filename: video.filename,
      filepath: video.filepath,
      date: video.date,
      display_time: video.displayTime,
      timestamp: video.timestamp,
      duration: video.duration,
      size: video.size,
      summary,
      people_desc,
      tags,
      anomalies,
      indexed_at: Date.now(),
    });

    // Store individual events
    const events: EventMemory[] = rawEvents.map(e => {
      const frameIdx = Number(e.frame_index ?? 0);
      const timeOffset = frameInterval * (frameIdx + 1);
      return {
        id: uuidv4(),
        recording_id: video.id,
        date: video.date,
        time_offset: timeOffset,
        abs_timestamp: video.timestamp + timeOffset * 1000,
        label: String(e.label || 'Activity'),
        description: String(e.description || ''),
        tags: Array.isArray(e.tags) ? e.tags : [],
        confidence: Number(e.confidence ?? 0.7),
      };
    });

    await insertEvents(events);
    persist();

    console.log(`[AutoIndex] ✓ ${video.filename} — ${events.length} events, tags: ${tags.join(', ')}`);
    return { success: true, summary, tags, eventCount: events.length };

  } catch (err) {
    console.error('[AutoIndex] Error:', err);
    return { success: false, error: String(err) };
  }
}
