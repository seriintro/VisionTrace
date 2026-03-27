'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Trash2, Bot, User, Film, Calendar, Clock } from 'lucide-react';
import Sidebar from '@/components/ui/Sidebar';
import { analyze, getVideos, videoStreamUrl } from '@/lib/api';
import { ChatMessage, VideoGroup, VideoFile } from '@/types';

const SUGGESTIONS = [
  { q:'What was happening today at 3pm?',           icon:'🕒' },
  { q:'What happened yesterday evening?',            icon:'🌆' },
  { q:'Who was in the recording this morning?',      icon:'👤' },
  { q:'Describe activity on the latest recording',   icon:'📹' },
];

export default function ChatPage() {
  const [messages, setMessages]   = useState<ChatMessage[]>([]);
  const [input, setInput]         = useState('');
  const [busy, setBusy]           = useState(false);
  const [groups, setGroups]       = useState<VideoGroup[]>([]);
  const [previewVideo, setPreview] = useState<VideoFile|null>(null);
  const [previewSeek, setSeek]    = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { getVideos().then(r=>setGroups(r.groups)).catch(()=>{}); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [messages]);

  const send = useCallback(async (q?: string) => {
    const question = (q ?? input).trim();
    if (!question || busy) return;
    setInput(''); setBusy(true);

    const uid = crypto.randomUUID(), aid = crypto.randomUUID();
    setMessages(prev => [
      ...prev,
      { id:uid, role:'user',      content:question, timestamp:Date.now() },
      { id:aid, role:'assistant', content:'',        timestamp:Date.now(), isLoading:true },
    ]);

    const history = messages.map(m => ({ role:m.role, content:m.content }));
    try {
      const result = await analyze({ question, frames:[], chatHistory:history, mode:'recording' });
      setMessages(prev => prev.map(m => m.id===aid
        ? { ...m, content:result.answer, isLoading:false, videoRef:result.videoRef, matchedVideo:result.matchedVideo }
        : m));
      if (result.matchedVideo && result.videoRef) {
        const all = groups.flatMap(g=>g.videos);
        const found = all.find(v=>v.id===result.matchedVideo!.id);
        if (found) { setPreview(found); setSeek(result.videoRef.seekTo??0); }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      setMessages(prev => prev.map(m => m.id===aid ? { ...m, content:msg, isLoading:false, error:true } : m));
    } finally {
      setBusy(false);
      setTimeout(()=>inputRef.current?.focus(), 100);
    }
  }, [input, busy, messages, groups]);

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const totalVideos = groups.reduce((s,g)=>s+g.videos.length, 0);

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>
      <Sidebar />

      {/* Left: recording index */}
      <div style={{ width:200, flexShrink:0, background:'var(--bg-card)',
        borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <p style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)',
            textTransform:'uppercase', letterSpacing:'.04em' }}>Recordings</p>
          <p style={{ fontSize:22, fontWeight:700, color:'var(--green)', marginTop:2 }}>{totalVideos}</p>
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          {groups.length===0
            ? <p style={{ padding:'16px', fontSize:12, color:'var(--text-muted)' }}>No recordings</p>
            : groups.map(g => (
              <div key={g.date}>
                <div style={{ padding:'8px 16px', background:'var(--bg-hover)',
                  borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:6 }}>
                  <Calendar size={11} color="var(--text-muted)" />
                  <span style={{ fontSize:11, fontWeight:500, color:'var(--text-secondary)' }}>{g.date}</span>
                </div>
                {g.videos.map(v => (
                  <button key={v.id}
                    onClick={()=>{ setPreview(v); setSeek(0); }}
                    style={{ width:'100%', padding:'7px 16px 7px 26px', display:'flex', alignItems:'center',
                      gap:6, borderBottom:'1px solid var(--border)', cursor:'pointer',
                      background: previewVideo?.id===v.id ? 'var(--green-light)' : 'transparent',
                      border:'none', textAlign:'left', transition:'background .12s' }}
                    onMouseEnter={e=>{ if(previewVideo?.id!==v.id)(e.currentTarget as HTMLElement).style.background='var(--bg-hover)'; }}
                    onMouseLeave={e=>{ if(previewVideo?.id!==v.id)(e.currentTarget as HTMLElement).style.background='transparent'; }}>
                    <Clock size={10} color="var(--text-muted)" />
                    <span style={{ fontSize:12, color: previewVideo?.id===v.id ? 'var(--green)':'var(--text-primary)',
                      fontWeight: previewVideo?.id===v.id ? 500 : 400 }}>
                      {v.displayTime}
                    </span>
                    {(v.moments?.length??0)>0 && (
                      <span className="tag tag-amber" style={{ marginLeft:'auto', fontSize:9, padding:'1px 5px' }}>
                        {v.moments!.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}
        </div>
        <div style={{ padding:'10px 16px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
          <p style={{ fontSize:11, color:'var(--text-muted)', lineHeight:1.5 }}>
            VisionTrace auto-selects recordings by date & time
          </p>
        </div>
      </div>

      {/* Center: Chat */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'var(--bg-page)' }}>

        {/* Header */}
        <div style={{ padding:'14px 24px', background:'var(--bg-card)', borderBottom:'1px solid var(--border)',
          display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:8, background:'var(--green-light)',
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Bot size={16} color="var(--green)" />
            </div>
            <div>
              <h1 style={{ fontSize:15, fontWeight:600, lineHeight:1.2 }}>VisionTrace Intelligence</h1>
              <p style={{ fontSize:11, color:'var(--text-secondary)' }}>Ask anything about your recordings</p>
            </div>
          </div>
          {messages.length>0 && (
            <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={()=>setMessages([])}>
              <Trash2 size={12} /> Clear
            </button>
          )}
        </div>

        {/* Messages */}
        <div style={{ flex:1, overflowY:'auto', overflowX:'hidden', minHeight:0,
          padding:'24px', display:'flex', flexDirection:'column', gap:16 }}>
          {messages.length===0
            ? <EmptyState onSuggest={send} />
            : messages.map(msg => <Bubble key={msg.id} msg={msg} onVideoPreview={(v,s)=>{
                const all=groups.flatMap(g=>g.videos); const f=all.find(x=>x.id===v);
                if(f){setPreview(f);setSeek(s);}
              }} />)
          }
          <div ref={bottomRef} />
        </div>

        {/* Suggestions */}
        <div style={{ padding:'8px 24px 0', background:'var(--bg-card)', borderTop:'1px solid var(--border)',
          display:'flex', gap:6, overflowX:'auto', flexShrink:0 }} className="hide-scroll">
          {['What happened today?','Who was seen yesterday?','List all recordings','Activity at 3pm today?'].map(s=>(
            <button key={s} onClick={()=>send(s)} disabled={busy}
              className="btn btn-secondary"
              style={{ flexShrink:0, fontSize:11, padding:'4px 12px', whiteSpace:'nowrap',
                borderRadius:'var(--radius-full)' }}>
              {s}
            </button>
          ))}
        </div>

        {/* Input */}
        <div style={{ padding:'12px 24px 16px', background:'var(--bg-card)',
          display:'flex', gap:10, alignItems:'flex-end', flexShrink:0 }}>
          <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={onKey} disabled={busy}
            placeholder='Ask about any recording — e.g. "What was happening at 3pm on March 20?"'
            rows={2} className="input"
            style={{ flex:1, resize:'none', lineHeight:'1.5', maxHeight:100,
              borderRadius:'var(--radius-md)', fontSize:13 }}
          />
          <button onClick={()=>send()} disabled={!input.trim()||busy}
            className="btn btn-primary"
            style={{ padding:'10px 14px', flexShrink:0, borderRadius:'var(--radius-md)' }}>
            {busy
              ? <span style={{ width:14,height:14,borderRadius:'50%',display:'inline-block',
                  border:'2px solid rgba(255,255,255,.4)',borderTopColor:'#fff',
                  animation:'spin .8s linear infinite' }} />
              : <Send size={14} />}
          </button>
        </div>
      </div>

      {/* Right: Preview */}
      <div style={{ width:320, flexShrink:0, background:'var(--bg-card)',
        borderLeft:'1px solid var(--border)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <p style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)',
            textTransform:'uppercase', letterSpacing:'.04em' }}>Video Preview</p>
        </div>
        {previewVideo ? (
          <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
            <div style={{ background:'#000', flexShrink:0 }}>
              <VideoPreview video={previewVideo} seekTo={previewSeek} />
            </div>
            <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                <Film size={13} color="var(--green)" />
                <span style={{ fontSize:13, fontWeight:500, color:'var(--green)' }}>
                  {previewVideo.date} · {previewVideo.displayTime}
                </span>
              </div>
              <p style={{ fontSize:11, color:'var(--text-secondary)', overflow:'hidden',
                textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{previewVideo.filename}</p>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'10px 16px' }}>
              {(previewVideo.moments?.length??0)>0
                ? previewVideo.moments!.map(m => {
                    const c = m.tags.includes('anomaly')?'var(--red)':m.tags.includes('person')?'var(--green)':'var(--amber)';
                    return (
                      <div key={m.id} className="card" style={{ padding:'8px 10px', marginBottom:6 }}>
                        <div style={{ display:'flex', gap:6, alignItems:'flex-start' }}>
                          <div style={{ width:7,height:7,borderRadius:2,background:c,flexShrink:0,marginTop:4 }} />
                          <div>
                            <p style={{ fontSize:12,fontWeight:500,marginBottom:2 }}>{m.label}</p>
                            <p style={{ fontSize:11,color:'var(--text-secondary)' }}>{m.description}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                : <p style={{ fontSize:12,color:'var(--text-muted)',textAlign:'center',paddingTop:20 }}>
                    No moments scanned yet
                  </p>
              }
            </div>
          </div>
        ) : (
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center',
            justifyContent:'center', gap:8, padding:20, opacity:.4 }}>
            <Film size={32} color="var(--text-muted)" />
            <p style={{ fontSize:13, color:'var(--text-secondary)', textAlign:'center', lineHeight:1.6 }}>
              Ask about a recording and the matched video will appear here
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function VideoPreview({ video, seekTo }: { video:VideoFile; seekTo:number }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current && seekTo>0) ref.current.currentTime = seekTo; }, [video.id, seekTo]);
  return <video ref={ref} src={videoStreamUrl(video.id)} controls
    style={{ width:'100%', maxHeight:180, display:'block', background:'#000' }} />;
}

function EmptyState({ onSuggest }: { onSuggest:(q:string)=>void }) {
  const examples = [
    { q:'What happened at 3pm today?',            icon:'🕒' },
    { q:'Who was at the entrance yesterday?',      icon:'🚪' },
    { q:'Describe activity on March 20 at 2pm',   icon:'📅' },
    { q:'What was the person wearing at 9am?',     icon:'👔' },
  ];
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center',
      justifyContent:'center', gap:24, padding:'40px 20px' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:52,height:52,borderRadius:14,margin:'0 auto 14px',
          background:'var(--green-light)',border:'1px solid #B7E4C7',
          display:'flex',alignItems:'center',justifyContent:'center' }}>
          <Bot size={24} color="var(--green)" />
        </div>
        <h2 style={{ fontSize:20,fontWeight:700,marginBottom:8 }}>Ask VisionTrace</h2>
        <p style={{ fontSize:13,color:'var(--text-secondary)',maxWidth:340,lineHeight:1.7 }}>
          Ask anything about your surveillance recordings. Mention a date and time — VisionTrace will automatically find and analyse the right footage.
        </p>
      </div>
      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,width:'100%',maxWidth:480 }}>
        {examples.map(ex => (
          <button key={ex.q} onClick={()=>onSuggest(ex.q)}
            className="card"
            style={{ padding:'12px 14px',cursor:'pointer',textAlign:'left',
              transition:'all .15s',border:'1px solid var(--border)' }}
            onMouseEnter={e=>{ (e.currentTarget as HTMLElement).style.borderColor='var(--green-mid)'; (e.currentTarget as HTMLElement).style.boxShadow='0 0 0 3px rgba(64,145,108,.1)'; }}
            onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.borderColor='var(--border)'; (e.currentTarget as HTMLElement).style.boxShadow='var(--shadow-sm)'; }}>
            <span style={{ fontSize:20,display:'block',marginBottom:6 }}>{ex.icon}</span>
            <span style={{ fontSize:12,color:'var(--text-secondary)',lineHeight:1.5 }}>{ex.q}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Bubble({ msg, onVideoPreview }: { msg:ChatMessage; onVideoPreview:(v:string,s:number)=>void }) {
  const isUser = msg.role==='user';
  const time   = new Date(msg.timestamp).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true});
  return (
    <div className="fade-up" style={{ display:'flex',gap:10,alignItems:'flex-start',
      flexDirection:isUser?'row-reverse':'row' }}>
      {!isUser && (
        <div style={{ flexShrink:0,width:32,height:32,borderRadius:8,background:'var(--green-light)',
          border:'1px solid #B7E4C7',display:'flex',alignItems:'center',justifyContent:'center' }}>
          <Bot size={16} color="var(--green)" />
        </div>
      )}
      <div style={{ maxWidth:'78%',display:'flex',flexDirection:'column',
        alignItems:isUser?'flex-end':'flex-start',gap:4 }}>
        <div style={{
          padding:'10px 14px',
          borderRadius:isUser?'16px 4px 16px 16px':'4px 16px 16px 16px',
          background:isUser?'var(--user-bubble)':'var(--bg-card)',
          border:isUser?'none':`1px solid ${msg.error?'#FECACA':'var(--border)'}`,
          boxShadow:'var(--shadow-sm)',
          color:isUser?'var(--user-text)':msg.error?'var(--red)':'var(--text-primary)',
        }}>
          {msg.isLoading
            ? <div style={{ display:'flex',gap:5,alignItems:'center',padding:'2px 0' }}>
                {[0,1,2].map(i=>(
                  <div key={i} style={{ width:6,height:6,borderRadius:'50%',background:'var(--green-mid)',
                    animation:`blink 1.2s ease-in-out ${i*.2}s infinite` }} />
                ))}
                <span style={{ fontSize:12,color:'var(--text-secondary)',marginLeft:6 }}>
                  Locating recording & analysing…
                </span>
              </div>
            : <p className="prose" style={{ fontSize:13,lineHeight:1.7,whiteSpace:'pre-wrap' }}>{msg.content}</p>
          }
        </div>
        <p style={{ fontSize:10,color:'var(--text-muted)',padding:'0 2px' }}>{time}</p>
        {msg.matchedVideo && (
          <button onClick={()=>onVideoPreview(msg.matchedVideo!.id,msg.videoRef?.seekTo??0)}
            className="tag tag-green"
            style={{ cursor:'pointer',display:'flex',alignItems:'center',gap:4 }}>
            <Film size={10} /> {msg.matchedVideo.date} · {msg.matchedVideo.displayTime}
          </button>
        )}
      </div>
      {isUser && (
        <div style={{ flexShrink:0,width:32,height:32,borderRadius:'50%',background:'var(--bg-sidebar)',
          display:'flex',alignItems:'center',justifyContent:'center' }}>
          <User size={14} color="#fff" />
        </div>
      )}
    </div>
  );
}
