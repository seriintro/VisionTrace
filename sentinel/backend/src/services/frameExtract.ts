import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Extract N frames from a video file at evenly-spaced intervals.
 * Handles browser-recorded WebM files (no duration metadata) via fps-filter fallback.
 */
export async function extractFramesFromVideo(
  videoPath: string,
  count: number = 4,
  seekSeconds?: number
): Promise<string[]> {
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-'));

  try {
    const duration = await getVideoDuration(videoPath);

    // Browser-recorded WebM (MediaRecorder) often reports duration=0 because
    // the header isn't finalized. Fall back to linear fps-based extraction.
    if (!duration || duration <= 0) {
      console.warn(`Duration=0 for ${path.basename(videoPath)} — using fps-filter extraction`);
      return await extractFramesFps(videoPath, count, tmpDir);
    }

    const startOffset = seekSeconds ?? 0;
    const extractFrom = Math.min(startOffset, Math.max(0, duration - 10));
    const windowDuration = Math.min(30, duration - extractFrom);
    const interval = windowDuration / (count + 1);

    const framePromises = Array.from({ length: count }, (_, i) => {
      const seekTo = extractFrom + interval * (i + 1);
      const outFile = path.join(tmpDir, `frame_${i}.jpg`);
      return extractSingleFrame(videoPath, seekTo, outFile);
    });

    const framePaths = await Promise.all(framePromises);
    const frames: string[] = [];

    for (const fp of framePaths) {
      if (fs.existsSync(fp)) {
        frames.push(`data:image/jpeg;base64,${fs.readFileSync(fp).toString('base64')}`);
      }
    }

    // If seek-based extraction failed (common with webm), fall back
    if (frames.length === 0) {
      console.warn(`Seek extraction got 0 frames for ${path.basename(videoPath)} — trying fps fallback`);
      return await extractFramesFps(videoPath, count, tmpDir);
    }

    return frames;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

/**
 * Extract frames using fps=1 filter — reads video linearly, no seeking.
 * Works on any WebM regardless of duration/index metadata.
 */
function extractFramesFps(videoPath: string, count: number, tmpDir: string): Promise<string[]> {
  return new Promise((resolve) => {
    const outPattern = path.join(tmpDir, 'fps_%02d.jpg');

    ffmpeg(videoPath)
      .inputOptions(['-fflags', '+genpts+igndts'])
      .outputOptions([
        '-vf', 'fps=1,scale=1280:-1',
        '-vframes', String(count),
        '-q:v', '3',
      ])
      .output(outPattern)
      .on('end', () => {
        const frames: string[] = [];
        for (let i = 1; i <= count; i++) {
          const p = path.join(tmpDir, `fps_${String(i).padStart(2, '0')}.jpg`);
          if (fs.existsSync(p)) {
            frames.push(`data:image/jpeg;base64,${fs.readFileSync(p).toString('base64')}`);
          }
        }
        resolve(frames);
      })
      .on('error', (err) => {
        console.warn('fps-filter extraction failed:', err.message);
        resolve([]);
      })
      .run();
  });
}

function extractSingleFrame(videoPath: string, seekSeconds: number, outPath: string): Promise<string> {
  return new Promise((resolve) => {
    ffmpeg(videoPath)
      .inputOptions(['-fflags', '+genpts+igndts'])
      .seekInput(seekSeconds)
      .frames(1)
      .output(outPath)
      .outputOptions(['-vf', 'scale=1280:-1', '-q:v', '3', '-update', '1'])
      .on('end', () => resolve(outPath))
      .on('error', (err) => {
        console.warn(`Frame extract warn at ${seekSeconds}s:`, err.message);
        resolve(outPath);
      })
      .run();
  });
}

export function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath,
      ['-analyzeduration', '10000000', '-probesize', '10000000'],
      (err, metadata) => {
        if (err) return reject(err);
        resolve(metadata.format.duration ?? 0);
      }
    );
  });
}

export async function generateThumbnail(videoPath: string): Promise<string | null> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-thumb-'));
  try {
    // Try seek-based first, fall back to fps filter for webm
    const duration = await getVideoDuration(videoPath).catch(() => 0);
    let frames: string[];
    if (duration > 0) {
      const outPath = path.join(tmpDir, 'thumb.jpg');
      await extractSingleFrame(videoPath, Math.min(2, duration * 0.1), outPath);
      frames = fs.existsSync(outPath)
        ? [`data:image/jpeg;base64,${fs.readFileSync(outPath).toString('base64')}`]
        : [];
    } else {
      frames = await extractFramesFps(videoPath, 1, tmpDir);
    }
    return frames[0] ?? null;
  } catch {
    return null;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

export async function extractKeyFrames(
  videoPath: string,
  samplesPerMinute: number = 2
): Promise<Array<{ frame: string; seconds: number }>> {
  const duration = await getVideoDuration(videoPath);
  const results: Array<{ frame: string; seconds: number }> = [];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-kf-'));

  try {
    if (!duration || duration <= 0) {
      // For webm with no duration, extract up to 8 frames via fps filter
      const frames = await extractFramesFps(videoPath, 8, tmpDir);
      frames.forEach((frame, i) => results.push({ frame, seconds: i }));
      return results;
    }

    const totalSamples = Math.max(4, Math.round((duration / 60) * samplesPerMinute));
    const interval = duration / (totalSamples + 1);

    for (let i = 0; i < totalSamples; i++) {
      const seconds = interval * (i + 1);
      const outPath = path.join(tmpDir, `kf_${i}.jpg`);
      await extractSingleFrame(videoPath, seconds, outPath);
      if (fs.existsSync(outPath)) {
        results.push({
          frame: `data:image/jpeg;base64,${fs.readFileSync(outPath).toString('base64')}`,
          seconds: Math.round(seconds),
        });
      }
    }
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }

  return results;
}
