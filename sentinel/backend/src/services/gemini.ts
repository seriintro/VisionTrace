import { GoogleGenerativeAI, Part, TextPart, InlineDataPart } from '@google/generative-ai';
import { ChatMessage, Moment, VideoFile } from '../types';
import { v4 as uuidv4 } from 'uuid';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const MODEL = 'gemini-2.5-flash';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function textPart(text: string): TextPart {
  return { text };
}

function imagePart(base64DataUrl: string): InlineDataPart {
  const data = base64DataUrl.includes(',') ? base64DataUrl.split(',')[1] : base64DataUrl;
  return { inlineData: { mimeType: 'image/jpeg', data } };
}

// ─── Live Analysis ────────────────────────────────────────────────────────────

export async function analyzeLive(
  question: string,
  frames: string[],
  chatHistory: Array<{ role: string; content: string }>
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: MODEL });
  const parts: Part[] = [];

  parts.push(textPart(
    `You are VisionTrace, an advanced AI surveillance analysis system. ` +
    `You analyze live camera feeds and answer questions precisely. ` +
    `Describe people's clothing, actions, body language, and interactions in detail. ` +
    `Be direct, factual, and structured. Use bullet points for multiple observations.`
  ));

  if (chatHistory.length > 0) {
    const ctx = chatHistory.slice(-6)
      .map(m => `${m.role === 'user' ? 'Operator' : 'VisionTrace'}: ${m.content}`)
      .join('\n');
    parts.push(textPart(`\nConversation context:\n${ctx}\n`));
  }

  if (frames.length > 0) {
    parts.push(textPart(`\nAnalyzing ${frames.length} live frame(s):`));
    frames.forEach(f => parts.push(imagePart(f)));
  }

  parts.push(textPart(`\nOperator query: ${question}`));

  const result = await model.generateContent(parts);
  return result.response.text();
}

// ─── Recording Analysis ───────────────────────────────────────────────────────

export async function analyzeRecording(
  question: string,
  frames: string[],
  video: VideoFile,
  seekSeconds: number,
  chatHistory: Array<{ role: string; content: string }>
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: MODEL });
  const parts: Part[] = [];

  parts.push(textPart(
    `You are VisionTrace, an advanced AI surveillance analysis system. ` +
    `You are analyzing a surveillance recording from ${video.date} at ${video.displayTime}. ` +
    `The frames shown are extracted around the ${formatSeconds(seekSeconds)} mark of the recording. ` +
    `Describe what you observe in precise detail: people present, clothing, activities, ` +
    `objects, interactions, and any notable events. Be direct and factual.`
  ));

  if (chatHistory.length > 0) {
    const ctx = chatHistory.slice(-6)
      .map(m => `${m.role === 'user' ? 'Operator' : 'VisionTrace'}: ${m.content}`)
      .join('\n');
    parts.push(textPart(`\nConversation context:\n${ctx}\n`));
  }

  if (frames.length > 0) {
    parts.push(textPart(`\nRecording frames (${video.date} ${video.displayTime}, ~${formatSeconds(seekSeconds)} in):`));
    frames.forEach(f => parts.push(imagePart(f)));
  }

  parts.push(textPart(`\nOperator query: ${question}`));

  const result = await model.generateContent(parts);
  return result.response.text();
}

// ─── Temporal Query ───────────────────────────────────────────────────────────

/**
 * Answer a temporal query like "what was happening at 3pm on Jan 20?"
 * Uses frames extracted from the matched recording.
 */
export async function analyzeTemporalQuery(
  question: string,
  frames: string[],
  video: VideoFile,
  chatHistory: Array<{ role: string; content: string }>
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: MODEL });
  const parts: Part[] = [];

  parts.push(textPart(
    `You are VisionTrace, an advanced AI surveillance analysis system. ` +
    `An operator has asked about a specific time. You have located the recording from ` +
    `${video.date} at ${video.displayTime} and extracted ${frames.length} frames from it. ` +
    `Answer the operator's question based on what you see. ` +
    `Be precise about: who is present, what they are wearing, what they are doing, ` +
    `and any significant events or objects visible. ` +
    `If the frames are unclear or don't show what was asked, say so honestly.`
  ));

  if (chatHistory.length > 0) {
    const ctx = chatHistory.slice(-4)
      .map(m => `${m.role === 'user' ? 'Operator' : 'VisionTrace'}: ${m.content}`)
      .join('\n');
    parts.push(textPart(`\nContext:\n${ctx}\n`));
  }

  parts.push(textPart(`\nFrames from recording ${video.date} ${video.displayTime}:`));
  frames.forEach(f => parts.push(imagePart(f)));

  parts.push(textPart(`\nOperator query: ${question}`));

  const result = await model.generateContent(parts);
  return result.response.text();
}

// ─── Moment Detection ─────────────────────────────────────────────────────────

/**
 * Analyze a batch of frames and detect key moments/events.
 * Returns structured moment data.
 */
export async function detectMoments(
  videoId: string,
  keyFrames: Array<{ frame: string; seconds: number }>,
  videoDate: string,
  videoTime: string
): Promise<Moment[]> {
  if (keyFrames.length === 0) return [];

  const model = genAI.getGenerativeModel({ model: MODEL });
  const parts: Part[] = [];

  parts.push(textPart(
    `You are VisionTrace's automated moment detection system. ` +
    `Analyze these ${keyFrames.length} frames from a surveillance recording (${videoDate} ${videoTime}). ` +
    `For each frame that contains a notable event or activity, output a JSON array. ` +
    `Each item should have: ` +
    `"timestampSeconds" (number), "label" (short title), "description" (1-2 sentences), ` +
    `"tags" (array from: person, motion, object, group, anomaly, vehicle, animal), ` +
    `"confidence" (0.0 to 1.0). ` +
    `Only include truly notable moments — not empty/static frames. ` +
    `Respond ONLY with a valid JSON array, no markdown, no extra text.`
  ));

  keyFrames.forEach(({ frame, seconds }, i) => {
    parts.push(textPart(`Frame ${i + 1} at ${formatSeconds(seconds)}:`));
    parts.push(imagePart(frame));
  });

  try {
    const result = await model.generateContent(parts);
    const text = result.response.text().trim();
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    if (!Array.isArray(parsed)) return [];

    return parsed.map((m: Partial<Moment>) => ({
      id: uuidv4(),
      videoId,
      timestampSeconds: Number(m.timestampSeconds) || 0,
      label: String(m.label || 'Activity detected'),
      description: String(m.description || ''),
      confidence: Math.min(1, Math.max(0, Number(m.confidence) || 0.7)),
      tags: Array.isArray(m.tags) ? m.tags : ['motion'],
      detectedAt: Date.now(),
    }));
  } catch (err) {
    console.error('Moment detection parse error:', err);
    return [];
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/**
 * Parse natural language time from a user query.
 * e.g. "at 3pm", "around 2:30", "3:45 pm" → "15:30"
 */
export function parseTimeFromQuery(query: string): string | null {
  const lower = query.toLowerCase();

  // Match patterns like "3pm", "3:30pm", "15:00", "3 pm", "at 3", "around 2:30"
  const patterns = [
    /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/,
    /\b(\d{1,2})\s*(am|pm)\b/,
    /\bat\s+(\d{1,2})(?::(\d{2}))?\b/,
    /\baround\s+(\d{1,2})(?::(\d{2}))?\b/,
  ];

  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match) {
      let hour = parseInt(match[1]);
      const minute = match[2] && /^\d+$/.test(match[2]) ? parseInt(match[2]) : 0;
      const meridian = (match[3] || match[2] || '').toLowerCase();

      if (meridian === 'pm' && hour < 12) hour += 12;
      if (meridian === 'am' && hour === 12) hour = 0;

      return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    }
  }

  return null;
}

/**
 * Parse a date from a natural language query.
 * e.g. "on January 20", "yesterday", "on 20th", "Jan 20" → "YYYY-MM-DD"
 */

/** Returns YYYY-MM-DD in the server's local timezone (avoids UTC offset issues). */
function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function parseDateFromQuery(query: string): string | null {
  const lower = query.toLowerCase();
  const now = new Date();

  if (lower.includes('yesterday')) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return localDateStr(d);
  }
  if (lower.includes('today')) {
    return localDateStr(now);
  }

  // Match "January 20", "Jan 20", "20 January"
  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    january: 0, february: 1, march: 2, april: 3, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  };

  for (const [name, idx] of Object.entries(months)) {
    const re = new RegExp(`\\b${name}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b|\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${name}\\b`);
    const match = lower.match(re);
    if (match) {
      const day = parseInt(match[1] || match[2]);
      const year = now.getFullYear();
      const date = new Date(year, idx, day);
      return localDateStr(date);
    }
  }

  // Match YYYY-MM-DD or MM/DD
  const isoMatch = query.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  return null;
}
