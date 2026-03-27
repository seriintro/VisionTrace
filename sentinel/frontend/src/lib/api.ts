// All requests go through Next.js rewrites → backend at :3001
// In dev: next.config.js proxies /api/* and /health to localhost:3001
// In prod: set NEXT_PUBLIC_API_URL to your backend URL

const API = typeof window !== 'undefined'
  ? ''   // browser: use relative URLs (proxied by Next.js)
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'); // SSR

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

// ─── Videos ──────────────────────────────────────────────────────────────────
export const getVideos = () =>
  request<{ groups: import('@/types').VideoGroup[]; totalVideos: number }>('/api/videos');

export const getDates = () =>
  request<{ dates: string[] }>('/api/videos/dates');

export const getThumbnail = (id: string) =>
  request<{ thumbnail: string }>(`/api/videos/${id}/thumbnail`);

export const refreshIndex = () =>
  request<{ success: boolean; count: number }>('/api/videos/refresh', { method: 'POST' });

export const videoStreamUrl = (id: string) => {
  const base = typeof window !== 'undefined'
    ? ''
    : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001');
  return `${base}/api/videos/${id}/stream`;
};

// ─── Stream ───────────────────────────────────────────────────────────────────
export const getStreamStatus = () =>
  request<import('@/types').StreamStatus>('/api/stream/status');

export const mjpegUrl = () => {
  const base = typeof window !== 'undefined'
    ? ''
    : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001');
  return `${base}/api/stream/mjpeg`;
};

// ─── Analyze ──────────────────────────────────────────────────────────────────
export interface AnalyzePayload {
  question: string;
  frames?: string[];
  chatHistory?: { role: string; content: string }[];
  mode: 'live' | 'recording';
  videoId?: string;
  seekSeconds?: number;
}

export interface AnalyzeResult {
  answer: string;
  videoRef?: { videoId: string; seekTo: number };
  matchedVideo?: { id: string; date: string; displayTime: string };
}

export const analyze = (payload: AnalyzePayload) =>
  request<AnalyzeResult>('/api/analyze', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

// ─── Moments ─────────────────────────────────────────────────────────────────
export const detectMoments = (videoId: string) =>
  request<{ moments: import('@/types').Moment[]; framesAnalyzed: number }>(
    `/api/moments/${videoId}`,
    { method: 'POST' }
  );

export const getAllMoments = () =>
  request<{ moments: import('@/types').Moment[] }>('/api/moments');

// ─── Upload ───────────────────────────────────────────────────────────────────
export async function uploadVideo(file: File, date?: string): Promise<{ success: boolean; filename: string }> {
  const form = new FormData();
  form.append('video', file);
  const url = date ? `/api/upload?date=${date}` : '/api/upload';
  const res = await fetch(url, { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

// ─── Health ───────────────────────────────────────────────────────────────────
export const getHealth = () =>
  request<{ status: string; env: { geminiConfigured: boolean; droidcamUrl: string } }>('/health');
