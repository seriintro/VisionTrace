import { Router, Request, Response } from 'express';
import {
  analyzeLive, analyzeRecording, analyzeTemporalQuery,
  parseTimeFromQuery, parseDateFromQuery,
} from '../services/gemini';
import { findVideoByQuery } from '../services/videoIndex';
import { extractFramesFromVideo } from '../services/frameExtract';
import {
  searchMemory, getRecentEvents, getRecordingsByDateRange,
  getRecordingMemory, getEventsForRecording
} from '../services/memoryStore';
import { getIndex } from './videos';
import { AnalyzeRequest } from '../types';

const router = Router();

function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/** Detect memory-style queries that need cross-video retrieval */
function detectMemoryQuery(q: string): { type: string; subject?: string } | null {
  const lower = q.toLowerCase();
  if (/when did .+ last|last time .+ (happen|seen|appear|was there)/i.test(q))
    return { type: 'last_occurrence', subject: q };
  if (/all times|every time|whenever|show.*all.*time|how many times/i.test(q))
    return { type: 'all_occurrences', subject: q };
  if (/unusual|suspicious|anomal|strange|weird|different/i.test(q))
    return { type: 'anomalies' };
  if (/(daily|weekly|this week|past \d+ day|last \d+ day|activity report|what happened (today|yesterday|this week))/i.test(q))
    return { type: 'report' };
  return null;
}

router.post('/', async (req: Request, res: Response) => {
  try {
    const body: AnalyzeRequest = req.body;
    const { question, frames = [], chatHistory = [], mode, videoId, seekSeconds } = body;

    if (!question?.trim()) return res.status(400).json({ error: 'Question is required' });

    // ── Mode: Live camera ──────────────────────────────────────────────────
    if (mode === 'live') {
      const answer = await analyzeLive(question, frames, chatHistory);
      return res.json({ answer });
    }

    // ── Memory queries — cross-video intelligence ──────────────────────────
    const memoryQuery = detectMemoryQuery(question);
    if (memoryQuery) {
      const index = getIndex();
      const availableDates = Object.keys(index).sort().reverse();

      if (memoryQuery.type === 'report') {
        // Delegate to /api/memory/report logic inline
        const days = /yesterday/i.test(question) ? 1 : /this week|past 7|last 7/i.test(question) ? 7 : 1;
        const toDate = localDateStr();
        const fromDate = localDateStr(new Date(Date.now() - days * 86400000));
        const recordings = await getRecordingsByDateRange(fromDate, toDate);
        const events = await getRecentEvents(days, 60);

        if (!recordings.length && !events.length) {
          return res.json({
            answer: `No recordings found for the requested period (${fromDate}${fromDate !== toDate ? ` to ${toDate}` : ''}). Nothing has been recorded or indexed yet.`,
          });
        }

        const recContext = recordings.map(r =>
          `[${r.date} ${r.display_time}] ${r.summary || 'No summary'}${r.anomalies?.length ? ` ⚠ Anomalies: ${r.anomalies.join(', ')}` : ''}`
        ).join('\n');
        const evContext = events.slice(0, 30).map(e =>
          `[${e.date} ${e.display_time}+${Math.round(e.time_offset||0)}s] ${e.label}: ${e.description}`
        ).join('\n');

        const memoryContext =
          `SENTINEL MEMORY — last ${days} day(s):\n\nRecordings:\n${recContext}\n\nEvents:\n${evContext}`;
        const answer = await analyzeLive(
          `${question}\n\n${memoryContext}\n\nAnswer based on the memory above. Be specific with times and dates.`,
          [], chatHistory
        );
        return res.json({ answer });
      }

      // Search-style query: "when did X last happen", "all times someone at door"
      const results = await searchMemory(question, 15);
      if (results.length > 0) {
        const context = results.map(r =>
          `[${r.date} ${r.display_time}${r.time_offset != null ? ` +${Math.round(r.time_offset)}s` : ''}] ${r.label}: ${r.description} (tags: ${r.tags.join(', ')})`
        ).join('\n');

        const enriched =
          `${question}\n\nSENTINEL MEMORY — relevant past events found:\n${context}\n\n` +
          `Answer the question precisely using this memory. Include specific dates and times.`;
        const answer = await analyzeLive(enriched, [], chatHistory);
        return res.json({ answer });
      }

      // No memory results — for specific memory queries return honest answer, don't hallucinate
      if (memoryQuery.type !== 'report') {
        return res.json({ answer: 'No matching events found in memory. Recordings may not have been indexed yet — save a recording first.' });
      }
    }

    // ── Mode: Recording with explicit videoId ──────────────────────────────
    if (mode === 'recording' && videoId) {
      const index = getIndex();
      const all = Object.values(index).flat();
      const video = all.find(v => v.id === videoId);
      if (!video) return res.status(404).json({ error: 'Video not found' });

      // Inject stored memory context if available
      let memoryContext = '';
      const mem = await getRecordingMemory(videoId);
      if (mem?.summary) {
        const storedEvents = await getEventsForRecording(videoId);
        memoryContext = `\n\nStored analysis of this recording:\nSummary: ${mem.summary}\n` +
          (mem.people_desc ? `People: ${mem.people_desc}\n` : '') +
          (storedEvents.length ? `Events: ${storedEvents.map(e => `${e.label}: ${e.description}`).join('; ')}` : '');
      }

      let analysisFrames = frames;
      if (analysisFrames.length === 0) {
        try {
          analysisFrames = await extractFramesFromVideo(video.filepath, 4, seekSeconds ?? 0);
        } catch (e) { console.warn('Frame extraction failed:', e); }
      }

      const enrichedQuestion = memoryContext ? `${question}${memoryContext}` : question;
      const answer = await analyzeRecording(enrichedQuestion, analysisFrames, video, seekSeconds ?? 0, chatHistory);
      return res.json({ answer, videoRef: { videoId: video.id, seekTo: seekSeconds ?? 0 } });
    }

    // ── Temporal / natural language query ──────────────────────────────────
    const detectedDate = parseDateFromQuery(question);
    const detectedTime = parseTimeFromQuery(question);
    const index = getIndex();
    const availableDates = Object.keys(index).sort().join(', ') || 'none';

    if (detectedDate) {
      const dateKey = Object.keys(index).find(d => d === detectedDate);
      if (!dateKey || !index[dateKey]?.length) {
        return res.json({
          answer: `No recordings found for **${detectedDate}**.\n\nAvailable dates:\n${availableDates.split(', ').map(d => `• ${d}`).join('\n')}`,
        });
      }

      const videosOnDate = index[dateKey];
      let targetVideo = videosOnDate[0];
      if (detectedTime) {
        const found = findVideoByQuery(index, detectedDate, detectedTime);
        if (found) targetVideo = found;
      }

      // Enrich with memory
      let memoryContext = '';
      const mem = await getRecordingMemory(targetVideo.id);
      if (mem?.summary) {
        memoryContext = `\n\n[Memory: ${mem.summary}${mem.anomalies?.length ? ` Anomalies: ${mem.anomalies.join(', ')}` : ''}]`;
      }

      let analysisFrames = frames;
      if (analysisFrames.length === 0) {
        try {
          analysisFrames = await extractFramesFromVideo(targetVideo.filepath, 4, 0);
        } catch (e) { console.warn('Frame extraction failed for temporal query:', e); }
      }

      const recordingsSummary = videosOnDate.map(v => `• ${v.displayTime} — ${v.filename}`).join('\n');
      const enrichedQuestion = detectedTime
        ? `${question}${memoryContext}`
        : `${question}${memoryContext}\n\n[Context: ${videosOnDate.length} recording(s) on ${detectedDate}:\n${recordingsSummary}\nAnalyzing: ${targetVideo.displayTime}]`;

      const answer = await analyzeTemporalQuery(enrichedQuestion, analysisFrames, targetVideo, chatHistory);
      return res.json({
        answer,
        videoRef: { videoId: targetVideo.id, seekTo: 0 },
        matchedVideo: { id: targetVideo.id, date: targetVideo.date, displayTime: targetVideo.displayTime },
      });
    }

    // ── Latest recording ───────────────────────────────────────────────────
    const isLatestQuery = /latest|last|most recent|newest|recent/i.test(question);
    if (isLatestQuery) {
      const sortedDates = Object.keys(index).sort((a, b) => b.localeCompare(a));
      const latestDate = sortedDates[0];
      if (!latestDate || !index[latestDate]?.length) {
        return res.json({ answer: 'No recordings are currently indexed.' });
      }

      const videosOnDate = index[latestDate];
      const targetVideo = videosOnDate[videosOnDate.length - 1];

      // Check memory first
      const mem = await getRecordingMemory(targetVideo.id);
      if (mem?.summary) {
        const storedEvents = await getEventsForRecording(targetVideo.id);
        const evList = storedEvents.length
          ? `\n\nDetected events:\n${storedEvents.map(e => `• +${Math.round(e.time_offset)}s — ${e.label}: ${e.description}`).join('\n')}`
          : '';
        const answer = await analyzeLive(
          `${question}\n\nMemory for ${targetVideo.date} ${targetVideo.displayTime}:\n${mem.summary}${mem.people_desc ? `\nPeople: ${mem.people_desc}` : ''}${evList}\n\nAnswer based on the stored memory above.`,
          [], chatHistory
        );
        return res.json({ answer, videoRef: { videoId: targetVideo.id, seekTo: 0 }, matchedVideo: { id: targetVideo.id, date: targetVideo.date, displayTime: targetVideo.displayTime } });
      }

      // Fall back to frame extraction
      let analysisFrames = frames;
      try { analysisFrames = await extractFramesFromVideo(targetVideo.filepath, 4, 0); } catch {}
      const answer = await analyzeTemporalQuery(question, analysisFrames, targetVideo, chatHistory);
      return res.json({ answer, videoRef: { videoId: targetVideo.id, seekTo: 0 }, matchedVideo: { id: targetVideo.id, date: targetVideo.date, displayTime: targetVideo.displayTime } });
    }

    // ── List query ─────────────────────────────────────────────────────────
    const isListQuery = /list|show|what.*have|all recording|available|index/i.test(question);
    if (isListQuery) {
      const summary = Object.entries(index)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, videos]) => `**${date}** — ${videos.length} recording(s): ${videos.map(v => v.displayTime).join(', ')}`)
        .join('\n');
      return res.json({
        answer: summary
          ? `Here are all indexed recordings:\n\n${summary}`
          : 'No recordings currently indexed.',
      });
    }

    // ── Fallback — only answer if live frames present, never hallucinate ────
    if (frames.length > 0) {
      const answer = await analyzeLive(question, frames, chatHistory);
      return res.json({ answer });
    }
    res.json({ answer: "I don't have any recordings or live frames to answer that question. Try asking about a specific date, or start a live session first." });

  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: `Analysis failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

export default router;
