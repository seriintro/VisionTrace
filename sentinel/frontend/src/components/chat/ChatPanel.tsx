'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Trash2, Bot, User, AlertCircle, ExternalLink, Film } from 'lucide-react';
import { ChatMessage } from '@/types';
import { analyze, AnalyzePayload } from '@/lib/api';

interface ChatPanelProps {
  mode: 'live' | 'recording';
  getFrames?: () => Promise<string[]>;
  videoId?: string;
  seekSeconds?: number;
  onVideoRef?: (videoId: string, seekTo: number) => void;
}

const QUICK: Record<string, string[]> = {
  live: [
    'What is the person wearing?',
    'What are they doing?',
    'How many people in frame?',
    'Describe the scene',
    'Any unusual activity?',
  ],
  recording: [
    'What was happening here?',
    'Who is present?',
    'Describe clothing',
    'Any objects of interest?',
    'What action is taking place?',
  ],
};

export default function ChatPanel({ mode, getFrames, videoId, seekSeconds, onVideoRef }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState('');
  const [busy, setBusy]         = useState(false);
  const [capturing, setCapturing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async (q?: string) => {
    const question = (q ?? input).trim();
    if (!question || busy) return;
    setInput('');
    setBusy(true);
    setCapturing(true);
    let frames: string[] = [];
    try { if (getFrames) frames = await getFrames(); } catch {}
    setCapturing(false);

    const uid = crypto.randomUUID();
    const aid = crypto.randomUUID();

    setMessages(prev => [
      ...prev,
      { id: uid, role: 'user', content: question, timestamp: Date.now(), frames: frames.slice(0,1) },
      { id: aid, role: 'assistant', content: '', timestamp: Date.now(), isLoading: true },
    ]);

    const history = messages.map(m => ({ role: m.role, content: m.content }));
    const payload: AnalyzePayload = { question, frames, chatHistory: history, mode, videoId, seekSeconds };

    try {
      const result = await analyze(payload);
      setMessages(prev => prev.map(m => m.id === aid
        ? { ...m, content: result.answer, isLoading: false, videoRef: result.videoRef, matchedVideo: result.matchedVideo }
        : m
      ));
      if (result.videoRef && onVideoRef) onVideoRef(result.videoRef.videoId, result.videoRef.seekTo);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      setMessages(prev => prev.map(m => m.id === aid
        ? { ...m, content: msg, isLoading: false, error: true } : m
      ));
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [input, busy, messages, mode, getFrames, videoId, seekSeconds, onVideoRef]);

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--bg-app)' }}>
      {/* Header */}
      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        flexShrink:0, background:'var(--bg-card)', borderRadius:'0' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:28, height:28, borderRadius:6, background:'var(--green-light)',
            display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Bot size={15} color="var(--green)" />
          </div>
          <div>
            <p style={{ fontWeight:600, fontSize:13, color:'var(--text-primary)' }}>VisionTrace AI</p>
            {capturing && <p style={{ fontSize:10, color:'var(--amber)' }}>Capturing frames…</p>}
          </div>
        </div>
        {messages.length > 0 && (
          <button className="btn btn-ghost" style={{ padding:'4px 8px', fontSize:12 }}
            onClick={() => setMessages([])}>
            <Trash2 size={12} /> Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', overflowX:'hidden', minHeight:0,
        padding:'16px', display:'flex', flexDirection:'column', gap:14 }}>
        {messages.length === 0 && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center',
            justifyContent:'center', gap:8, opacity:.5, paddingTop:40 }}>
            <Bot size={26} color="var(--text-muted)" />
            <p style={{ fontSize:13, color:'var(--text-muted)', textAlign:'center' }}>
              Ask anything about the scene
            </p>
          </div>
        )}
        {messages.map(msg => <Bubble key={msg.id} msg={msg} onVideoRef={onVideoRef} />)}
        <div ref={bottomRef} />
      </div>

      {/* Quick questions */}
      <div style={{ padding:'8px 16px 0', flexShrink:0, display:'flex', gap:6,
        overflowX:'auto', borderTop:'1px solid var(--border)' }} className="hide-scroll">
        {QUICK[mode].map(q => (
          <button key={q} onClick={() => send(q)} disabled={busy}
            className="btn btn-secondary"
            style={{ flexShrink:0, fontSize:11, padding:'4px 10px', whiteSpace:'nowrap' }}>
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <div style={{ padding:'10px 16px 14px', flexShrink:0, display:'flex', gap:8, alignItems:'flex-end' }}>
        <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={onKey} disabled={busy} rows={1}
          placeholder="Ask about the scene…"
          className="input"
          style={{ resize:'none', maxHeight:80, lineHeight:'1.5' }} />
        <button onClick={() => send()} disabled={!input.trim() || busy}
          className="btn btn-primary" style={{ padding:'9px 12px', flexShrink:0 }}>
          {busy
            ? <span style={{ width:13, height:13, borderRadius:'50%', display:'inline-block',
                border:'2px solid rgba(255,255,255,.4)', borderTopColor:'#fff', animation:'spin .7s linear infinite' }} />
            : <Send size={13} />}
        </button>
      </div>
    </div>
  );
}

function Bubble({ msg, onVideoRef }: { msg: ChatMessage; onVideoRef?: (id:string, t:number) => void }) {
  const isUser = msg.role === 'user';
  const time = new Date(msg.timestamp).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:true });

  return (
    <div className="fade-up" style={{ display:'flex', gap:8, alignItems:'flex-start',
      flexDirection: isUser ? 'row-reverse' : 'row' }}>
      {/* Avatar */}
      <div style={{ flexShrink:0, width:28, height:28, borderRadius:6,
        background: isUser ? '#1c2b1c' : 'var(--green-light)',
        display:'flex', alignItems:'center', justifyContent:'center' }}>
        {isUser ? <User size={14} color="#fff" /> : <Bot size={14} color="var(--green)" />}
      </div>

      <div style={{ flex:1, maxWidth:'88%', display:'flex', flexDirection:'column',
        alignItems: isUser ? 'flex-end' : 'flex-start', gap:4 }}>

        {/* Frame thumbnail */}
        {isUser && msg.frames?.[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={msg.frames[0]} alt="frame" style={{ width:80, height:45, objectFit:'cover',
            borderRadius:6, border:'1px solid var(--border)' }} />
        )}

        {/* Bubble */}
        <div style={{
          background: isUser ? '#1c2b1c' : 'var(--bg-card)',
          border: `1px solid ${msg.error ? '#fecaca' : isUser ? 'transparent' : 'var(--border-card)'}`,
          borderRadius: isUser ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
          padding:'10px 13px',
          boxShadow: 'var(--shadow-sm)',
          maxWidth: '100%',
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5, gap:12 }}>
            <span style={{ fontSize:11, fontWeight:600,
              color: isUser ? 'rgba(255,255,255,.6)' : msg.error ? 'var(--red)' : 'var(--green)' }}>
              {isUser ? 'You' : msg.error ? 'Error' : 'VisionTrace'}
            </span>
            <span style={{ fontSize:10, color: isUser ? 'rgba(255,255,255,.35)' : 'var(--text-muted)',
              flexShrink:0 }}>{time}</span>
          </div>

          {msg.isLoading ? (
            <div style={{ display:'flex', gap:4, alignItems:'center', padding:'2px 0' }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width:6, height:6, borderRadius:'50%', background:'var(--green-mid)',
                  animation:`blink 1.2s ease-in-out ${i*.2}s infinite` }} />
              ))}
              <span style={{ fontSize:12, color:'var(--text-muted)', marginLeft:6 }}>Analyzing…</span>
            </div>
          ) : (
            <p className="prose-VisionTrace" style={{
              color: msg.error ? 'var(--red)' : isUser ? '#fff' : 'var(--text-primary)',
              whiteSpace:'pre-wrap',
            }}>
              {msg.content}
            </p>
          )}
        </div>

        {/* Matched video chip */}
        {msg.matchedVideo && onVideoRef && (
          <button onClick={() => onVideoRef(msg.matchedVideo!.id, msg.videoRef?.seekTo ?? 0)}
            className="btn badge badge-green"
            style={{ fontSize:11, padding:'3px 10px', gap:5, cursor:'pointer',
              border:'1px solid #bbdabb' }}>
            <Film size={10} />
            {msg.matchedVideo.date} · {msg.matchedVideo.displayTime}
            <ExternalLink size={9} />
          </button>
        )}
      </div>
    </div>
  );
}
