export interface VideoFile {
  id: string;
  filename: string;
  date: string;
  time: string;
  displayTime: string;
  timestamp: number;
  duration?: number;
  size: number;
  moments?: Moment[];
}

export interface VideoGroup {
  date: string;
  videos: VideoFile[];
}

export interface Moment {
  id: string;
  videoId: string;
  timestampSeconds: number;
  label: string;
  description: string;
  confidence: number;
  tags: string[];
  frameDataUrl?: string;
  detectedAt: number;
  videoDate?: string;
  videoTime?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  frames?: string[];
  videoRef?: { videoId: string; seekTo?: number };
  matchedVideo?: { id: string; date: string; displayTime: string };
  isLoading?: boolean;
  error?: boolean;
}

export interface StreamStatus {
  connected: boolean;
  url: string;
  error?: string;
}
