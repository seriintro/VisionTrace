/**
 * SENTINEL Memory Store
 * SQLite-backed persistent memory for all recordings, events, and summaries.
 * Uses sql.js (pure JS) — no native build required.
 */
import sqlJsModule from 'sql.js';
type Database = import('sql.js').Database;
import fs from 'fs';
import path from 'path';

const DB_PATH = path.resolve(process.env.MEMORY_DB_PATH || '../sentinel-memory.db');

let db: Database | null = null;

function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export async function getDb(): Promise<Database> {
  if (db) return db;

  // sql.js ships as a CJS module with a .default property in some bundlers
  const initSqlJs = (sqlJsModule as any).default || sqlJsModule;
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  createSchema(db!);
  persist(db!);
  return db!;
}

function createSchema(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS recordings (
      id          TEXT PRIMARY KEY,
      filename    TEXT NOT NULL,
      filepath    TEXT NOT NULL,
      date        TEXT NOT NULL,
      display_time TEXT NOT NULL,
      timestamp   INTEGER NOT NULL,
      duration    REAL,
      size        INTEGER,
      summary     TEXT,
      people_desc TEXT,
      tags        TEXT,   -- JSON array string
      anomalies   TEXT,   -- JSON array string
      indexed_at  INTEGER
    );

    CREATE TABLE IF NOT EXISTS events (
      id            TEXT PRIMARY KEY,
      recording_id  TEXT NOT NULL,
      date          TEXT NOT NULL,
      time_offset   REAL NOT NULL,   -- seconds into the video
      abs_timestamp INTEGER NOT NULL, -- unix ms (recording start + offset)
      label         TEXT NOT NULL,
      description   TEXT NOT NULL,
      tags          TEXT NOT NULL,   -- JSON array
      confidence    REAL DEFAULT 0.7,
      FOREIGN KEY (recording_id) REFERENCES recordings(id)
    );

    CREATE INDEX IF NOT EXISTS idx_events_date      ON events(date);
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(abs_timestamp);
    CREATE INDEX IF NOT EXISTS idx_events_recording ON events(recording_id);
    CREATE INDEX IF NOT EXISTS idx_recordings_date  ON recordings(date);
  `);
}

/** Persist in-memory DB to disk */
export function persist(database?: Database) {
  const target = database || db;
  if (!target) return;
  const data = target.export();
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ── Recording CRUD ─────────────────────────────────────────────────────────

export interface RecordingMemory {
  id: string;
  filename: string;
  filepath: string;
  date: string;
  display_time: string;
  timestamp: number;
  duration?: number;
  size?: number;
  summary?: string;
  people_desc?: string;
  tags?: string[];
  anomalies?: string[];
  indexed_at?: number;
}

export async function upsertRecording(rec: RecordingMemory) {
  const d = await getDb();
  d.run(`
    INSERT INTO recordings (id, filename, filepath, date, display_time, timestamp, duration, size, summary, people_desc, tags, anomalies, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      summary=excluded.summary, people_desc=excluded.people_desc,
      tags=excluded.tags, anomalies=excluded.anomalies,
      indexed_at=excluded.indexed_at, duration=excluded.duration
  `, [
    rec.id, rec.filename, rec.filepath, rec.date, rec.display_time,
    rec.timestamp, rec.duration ?? null, rec.size ?? null,
    rec.summary ?? null, rec.people_desc ?? null,
    JSON.stringify(rec.tags ?? []),
    JSON.stringify(rec.anomalies ?? []),
    rec.indexed_at ?? Date.now(),
  ]);
  persist();
}

export async function isRecordingIndexed(id: string): Promise<boolean> {
  const d = await getDb();
  const res = d.exec(`SELECT indexed_at FROM recordings WHERE id=? AND summary IS NOT NULL`, [id]);
  return res.length > 0 && res[0].values.length > 0;
}

export async function getRecordingMemory(id: string): Promise<RecordingMemory | null> {
  const d = await getDb();
  const res = d.exec(`SELECT * FROM recordings WHERE id=?`, [id]);
  if (!res.length || !res[0].values.length) return null;
  return rowToRecording(res[0].columns, res[0].values[0]);
}

// ── Event CRUD ─────────────────────────────────────────────────────────────

export interface EventMemory {
  id: string;
  recording_id: string;
  date: string;
  time_offset: number;
  abs_timestamp: number;
  label: string;
  description: string;
  tags: string[];
  confidence: number;
}

export async function insertEvents(events: EventMemory[]) {
  const d = await getDb();
  for (const e of events) {
    d.run(`
      INSERT OR REPLACE INTO events (id, recording_id, date, time_offset, abs_timestamp, label, description, tags, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [e.id, e.recording_id, e.date, e.time_offset, e.abs_timestamp, e.label, e.description, JSON.stringify(e.tags), e.confidence]);
  }
  persist();
}

export async function getEventsForRecording(recordingId: string): Promise<EventMemory[]> {
  const d = await getDb();
  const res = d.exec(`SELECT * FROM events WHERE recording_id=? ORDER BY time_offset`, [recordingId]);
  if (!res.length) return [];
  return res[0].values.map(row => rowToEvent(res[0].columns, row));
}

// ── Search ─────────────────────────────────────────────────────────────────

export interface SearchResult {
  type: 'recording' | 'event';
  date: string;
  display_time: string;
  recording_id: string;
  label: string;
  description: string;
  tags: string[];
  time_offset?: number;
  abs_timestamp: number;
  confidence?: number;
}

/** Full-text search across all events and recording summaries */
export async function searchMemory(query: string, limit = 20): Promise<SearchResult[]> {
  const d = await getDb();
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  if (!terms.length) return [];

  const likeClauses = terms.map(() => `(LOWER(e.label) LIKE ? OR LOWER(e.description) LIKE ? OR LOWER(e.tags) LIKE ?)`).join(' OR ');
  const likeParams = terms.flatMap(t => [`%${t}%`, `%${t}%`, `%${t}%`]);

  const res = d.exec(`
    SELECT e.*, r.display_time, r.filename
    FROM events e
    JOIN recordings r ON e.recording_id = r.id
    WHERE ${likeClauses}
    ORDER BY e.abs_timestamp DESC
    LIMIT ?
  `, [...likeParams, limit]);

  if (!res.length) return [];

  return res[0].values.map(row => {
    const cols = res[0].columns;
    const get = (col: string) => row[cols.indexOf(col)];
    return {
      type: 'event' as const,
      date: String(get('date')),
      display_time: String(get('display_time')),
      recording_id: String(get('recording_id')),
      label: String(get('label')),
      description: String(get('description')),
      tags: JSON.parse(String(get('tags')) || '[]'),
      time_offset: Number(get('time_offset')),
      abs_timestamp: Number(get('abs_timestamp')),
      confidence: Number(get('confidence')),
    };
  });
}

/** Get most recent N events optionally filtered by date range */
export async function getRecentEvents(days = 7, limit = 50): Promise<SearchResult[]> {
  const d = await getDb();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = localDateStr(since);

  const res = d.exec(`
    SELECT e.*, r.display_time, r.filename
    FROM events e
    JOIN recordings r ON e.recording_id = r.id
    WHERE e.date >= ?
    ORDER BY e.abs_timestamp DESC
    LIMIT ?
  `, [sinceStr, limit]);

  if (!res.length) return [];
  return res[0].values.map(row => {
    const cols = res[0].columns;
    const get = (col: string) => row[cols.indexOf(col)];
    return {
      type: 'event' as const,
      date: String(get('date')),
      display_time: String(get('display_time')),
      recording_id: String(get('recording_id')),
      label: String(get('label')),
      description: String(get('description')),
      tags: JSON.parse(String(get('tags')) || '[]'),
      time_offset: Number(get('time_offset')),
      abs_timestamp: Number(get('abs_timestamp')),
      confidence: Number(get('confidence')),
    };
  });
}

/** Get all recordings with summaries for a date range */
export async function getRecordingsByDateRange(fromDate: string, toDate: string): Promise<RecordingMemory[]> {
  const d = await getDb();
  const res = d.exec(`
    SELECT * FROM recordings WHERE date >= ? AND date <= ? ORDER BY timestamp DESC
  `, [fromDate, toDate]);
  if (!res.length) return [];
  return res[0].values.map(row => rowToRecording(res[0].columns, row));
}

// ── Row mappers ────────────────────────────────────────────────────────────

function rowToRecording(cols: string[], row: any[]): RecordingMemory {
  const get = (col: string) => row[cols.indexOf(col)];
  return {
    id: String(get('id')),
    filename: String(get('filename')),
    filepath: String(get('filepath')),
    date: String(get('date')),
    display_time: String(get('display_time')),
    timestamp: Number(get('timestamp')),
    duration: get('duration') != null ? Number(get('duration')) : undefined,
    size: get('size') != null ? Number(get('size')) : undefined,
    summary: get('summary') ? String(get('summary')) : undefined,
    people_desc: get('people_desc') ? String(get('people_desc')) : undefined,
    tags: JSON.parse(String(get('tags') || '[]')),
    anomalies: JSON.parse(String(get('anomalies') || '[]')),
    indexed_at: get('indexed_at') ? Number(get('indexed_at')) : undefined,
  };
}

function rowToEvent(cols: string[], row: any[]): EventMemory {
  const get = (col: string) => row[cols.indexOf(col)];
  return {
    id: String(get('id')),
    recording_id: String(get('recording_id')),
    date: String(get('date')),
    time_offset: Number(get('time_offset')),
    abs_timestamp: Number(get('abs_timestamp')),
    label: String(get('label')),
    description: String(get('description')),
    tags: JSON.parse(String(get('tags') || '[]')),
    confidence: Number(get('confidence')),
  };
}

// ── Cleanup ────────────────────────────────────────────────────────────────

/** Remove recordings from memory whose IDs are not in the active video index */
export async function pruneOrphanedRecordings(activeIds: string[]): Promise<number> {
  const d = await getDb();

  if (activeIds.length === 0) {
    // Nothing on disk — wipe everything
    const before = d.exec('SELECT COUNT(*) FROM recordings')[0]?.values[0][0] as number ?? 0;
    d.run('DELETE FROM events WHERE 1=1');
    d.run('DELETE FROM recordings WHERE 1=1');
    persist();
    return before;
  }

  // Build a NOT IN clause with placeholders
  const placeholders = activeIds.map(() => '?').join(',');
  const orphanRes = d.exec(
    `SELECT id FROM recordings WHERE id NOT IN (${placeholders})`,
    activeIds
  );
  const orphanIds: string[] = orphanRes[0]?.values.map(r => String(r[0])) ?? [];

  if (orphanIds.length === 0) return 0;

  const orphanPlaceholders = orphanIds.map(() => '?').join(',');
  d.run(`DELETE FROM events    WHERE recording_id IN (${orphanPlaceholders})`, orphanIds);
  d.run(`DELETE FROM recordings WHERE id          IN (${orphanPlaceholders})`, orphanIds);
  persist();

  console.log(`[Memory] Pruned ${orphanIds.length} orphaned recording(s):`, orphanIds);
  return orphanIds.length;
}
