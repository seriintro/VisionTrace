import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { VideoFile, VideoIndex } from '../types';

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v'];

/**
 * Parse a filename or folder to extract date/time.
 * Supported formats:
 *   Folder: YYYY-MM-DD  |  File: HH-MM-SS.ext  or  YYYY-MM-DD_HH-MM-SS.ext
 *   Also handles: 14-30-00.mp4 / 14_30_00.mp4 / 143000.mp4
 */
function parseVideoDateTime(folderName: string, filename: string): { date: string; time: string; displayTime: string; timestamp: number } | null {
  // Date from folder
  const dateMatch = folderName.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) return null;

  const [, year, month, day] = dateMatch;
  const date = `${year}-${month}-${day}`;

  // Time from filename: HH-MM-SS, HH_MM_SS, HHMMSS, or full YYYY-MM-DD_HH-MM-SS
  const base = path.basename(filename, path.extname(filename));
  let hour = '00', minute = '00', second = '00';

  const fullTs = base.match(/\d{4}-\d{2}-\d{2}[_T](\d{2})[-_:](\d{2})[-_:](\d{2})/);
  const hms = base.match(/^(\d{2})[-_:](\d{2})[-_:](\d{2})/);
  const compact = base.match(/^(\d{2})(\d{2})(\d{2})$/);

  if (fullTs) {
    [, hour, minute, second] = fullTs;
  } else if (hms) {
    [, hour, minute, second] = hms;
  } else if (compact) {
    [, hour, minute, second] = compact;
  }

  const time = `${hour}-${minute}-${second}`;
  const displayTime = `${hour}:${minute}`;
  const timestamp = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`).getTime();

  return { date, time, displayTime, timestamp };
}

/**
 * Scan the surveillance-videos directory and build an indexed map.
 * Structure:
 *   surveillance-videos/
 *     YYYY-MM-DD/
 *       HH-MM-SS.mp4
 */
export function indexVideos(videosDir: string): VideoIndex {
  const index: VideoIndex = {};

  if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir, { recursive: true });
    return index;
  }

  const dateFolders = fs.readdirSync(videosDir).filter(name => {
    const fullPath = path.join(videosDir, name);
    return fs.statSync(fullPath).isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(name);
  });

  for (const dateFolder of dateFolders) {
    const folderPath = path.join(videosDir, dateFolder);
    const files = fs.readdirSync(folderPath).filter(f =>
      VIDEO_EXTENSIONS.includes(path.extname(f).toLowerCase())
    );

    const videoFiles: VideoFile[] = [];

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const stat = fs.statSync(filePath);
      const parsed = parseVideoDateTime(dateFolder, file);

      if (!parsed) continue;

      videoFiles.push({
        id: uuidv4(),
        filename: file,
        filepath: filePath,
        date: parsed.date,
        time: parsed.time,
        displayTime: parsed.displayTime,
        timestamp: parsed.timestamp,
        size: stat.size,
        moments: [],
      });
    }

    // Sort by time ascending
    videoFiles.sort((a, b) => a.timestamp - b.timestamp);
    if (videoFiles.length > 0) {
      index[dateFolder] = videoFiles;
    }
  }

  return index;
}

/**
 * Find the video most relevant to a natural-language date/time query.
 * e.g. "what happened at 3pm on January 20" → finds closest video
 */
export function findVideoByQuery(index: VideoIndex, dateStr: string, timeStr: string): VideoFile | null {
  // Normalize date
  const dateEntry = Object.keys(index).find(d => {
    const date = new Date(d);
    const queryDate = new Date(dateStr);
    return date.toDateString() === queryDate.toDateString();
  });

  if (!dateEntry || !index[dateEntry]) return null;

  const videos = index[dateEntry];
  if (videos.length === 0) return null;

  // Parse target time
  const [targetHour, targetMin] = timeStr.split(':').map(Number);
  const targetMinutes = targetHour * 60 + (targetMin || 0);

  // Find closest video
  let closest = videos[0];
  let minDiff = Infinity;

  for (const video of videos) {
    const [h, m] = video.time.split('-').map(Number);
    const videoMinutes = h * 60 + m;
    const diff = Math.abs(videoMinutes - targetMinutes);
    if (diff < minDiff) {
      minDiff = diff;
      closest = video;
    }
  }

  return closest;
}

/**
 * Get all available dates from the index.
 */
export function getAvailableDates(index: VideoIndex): string[] {
  return Object.keys(index).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
}
