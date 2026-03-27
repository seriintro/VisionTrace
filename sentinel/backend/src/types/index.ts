// ─── Video Types ─────────────────────────────────────────────────────────────

export interface VideoFile {
  id: string;
  filename: string;
  filepath: string;
  date: string;       // YYYY-MM-DD
  time: string;       // HH-MM-SS
  displayTime: string; // HH:MM
  timestamp: number;  // Unix ms
  duration?: number;  // seconds
  size: number;       // bytes
  moments?: Moment[];
}

export interface VideoIndex {
  [date: string]: VideoFile[];
}

// ─── Moment / Event Types ────────────────────────────────────────────────────

export interface Moment {
  id: string;
  videoId: string;
  timestampSeconds: number; // offset inside video
  label: string;
  description: string;
  confidence: number;       // 0-1
  tags: string[];
  frameDataUrl?: string;
  detectedAt: number;       // Unix ms when detected
}

export type MomentTag =
  | 'person'
  | 'motion'
  | 'object'
  | 'group'
  | 'anomaly'
  | 'vehicle'
  | 'animal';

// ─── Chat Types ──────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  frames?: string[];
  videoRef?: { videoId: string; seekTo?: number };
  isLoading?: boolean;
  error?: boolean;
}

export interface AnalyzeRequest {
  question: string;
  frames?: string[];
  chatHistory?: Array<{ role: string; content: string }>;
  videoId?: string;
  seekSeconds?: number;
  mode: 'live' | 'recording';
}

export interface AnalyzeResponse {
  answer: string;
  videoRef?: { videoId: string; seekTo: number };
  relatedMoments?: Moment[];
}

// ─── Stream Types ────────────────────────────────────────────────────────────

export interface StreamStatus {
  connected: boolean;
  url: string;
  lastFrame?: number;
}

// ─── Upload Types ────────────────────────────────────────────────────────────

export interface UploadResult {
  success: boolean;
  video?: VideoFile;
  error?: string;
}
