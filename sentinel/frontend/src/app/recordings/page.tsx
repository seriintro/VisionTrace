'use client';
import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Film, RefreshCw, ChevronDown, ChevronRight, Calendar } from 'lucide-react';
import Sidebar from '@/components/ui/Sidebar';
import VideoCard from '@/components/dashboard/VideoCard';
import Timeline from '@/components/timeline/Timeline';
import ChatPanel from '@/components/chat/ChatPanel';
import { getVideos, videoStreamUrl, refreshIndex } from '@/lib/api';
import { VideoGroup, VideoFile, Moment } from '@/types';

function RecordingsInner() {
  const searchParams = useSearchParams();
  const [groups,       setGroups]   = useState<VideoGroup[]>([]);
  const [loading,      setLoading]  = useState(true);
  const [selectedVideo,setSelected] = useState<VideoFile|null>(null);
  const [currentTime,  setTime]     = useState(0);
  const [duration,     setDuration] = useState(0);
  const [expanded,     setExpanded] = useState<Record<string,boolean>>({});
  const [refreshing,   setRefreshing] = useState(false);
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { groups:g } = await getVideos(); setGroups(g);
      if (g.length>0) setExpanded({[g[0].date]:true});
      const vid = searchParams.get('v');
      if (vid) { const f=g.flatMap(x=>x.videos).find(v=>v.id===vid); if(f) setSelected(f); }
    } catch {} finally { setLoading(false); }
  },[searchParams]);

  useEffect(()=>{ load(); },[load]);

  const getFrames = useCallback(async ():Promise<string[]> => {
    if (!videoRef.current||!canvasRef.current||!selectedVideo) return [];
    const v=videoRef.current,c=canvasRef.current,ctx=c.getContext('2d');
    if (!ctx||v.readyState<2) return [];
    c.width=v.videoWidth; c.height=v.videoHeight; ctx.drawImage(v,0,0);
    return [c.toDataURL('image/jpeg',.85)];
  },[selectedVideo]);

  const handleSeek = useCallback((s:number) => { if(videoRef.current) videoRef.current.currentTime=s; setTime(s); },[]);

  const handleVideoRef = useCallback((vid:string, seek:number) => {
    const f=groups.flatMap(g=>g.videos).find(v=>v.id===vid);
    if(f){ setSelected(f); setTimeout(()=>handleSeek(seek),500); }
  },[groups,handleSeek]);

  const handleMomentsDetected = useCallback((videoId:string, moments:Moment[]) => {
    setGroups(p=>p.map(g=>({...g,videos:g.videos.map(v=>v.id===videoId?{...v,moments}:v)})));
    setSelected(p=>p?.id===videoId?{...p,moments}:p);
  },[]);

  const doRefresh = async () => { setRefreshing(true); await refreshIndex(); await load(); setRefreshing(false); };
  const total = groups.reduce((s,g)=>s+g.videos.length,0);

  return (
    <div style={{ display:'flex',height:'100vh',overflow:'hidden' }}>
      <Sidebar />
      <main style={{ flex:1,display:'grid',gridTemplateColumns:'240px 1fr 360px',overflow:'hidden' }}>

        {/* Left: video list */}
        <div style={{ borderRight:'1px solid var(--border)',display:'flex',
          flexDirection:'column',overflow:'hidden',background:'var(--bg-card)' }}>
          <div style={{ padding:'12px 16px',borderBottom:'1px solid var(--border)',
            display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0 }}>
            <div>
              <p style={{ fontSize:12,fontWeight:600,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'.04em' }}>Recordings</p>
              <p style={{ fontSize:20,fontWeight:700,color:'var(--green)' }}>{total}</p>
            </div>
            <button className="btn btn-secondary" style={{ padding:'5px 8px' }} onClick={doRefresh} disabled={refreshing}>
              <RefreshCw size={13} style={refreshing?{animation:'spin .8s linear infinite'}:{}} />
            </button>
          </div>
          <div style={{ flex:1,overflowY:'auto' }}>
            {loading
              ? <div style={{ padding:12,display:'flex',flexDirection:'column',gap:8 }}>
                  {[1,2,3].map(i=><div key={i} className="shimmer" style={{ height:70,borderRadius:8 }} />)}
                </div>
              : groups.length===0
                ? <div style={{ padding:24,textAlign:'center' }}>
                    <Film size={24} color="var(--text-muted)" style={{ margin:'0 auto 8px' }} />
                    <p style={{ fontSize:13,color:'var(--text-secondary)',fontWeight:500 }}>No recordings</p>
                    <p style={{ fontSize:11,color:'var(--text-muted)',marginTop:4 }}>Add files to surveillance-videos/YYYY-MM-DD/</p>
                  </div>
                : groups.map(group=>(
                  <div key={group.date}>
                    <button onClick={()=>setExpanded(p=>({...p,[group.date]:!p[group.date]}))}
                      style={{ width:'100%',padding:'8px 14px',display:'flex',alignItems:'center',gap:6,
                        background:'var(--bg-hover)',border:'none',borderBottom:'1px solid var(--border)',
                        cursor:'pointer' }}>
                      {expanded[group.date]?<ChevronDown size={12} color="var(--text-secondary)"/>:<ChevronRight size={12} color="var(--text-secondary)"/>}
                      <Calendar size={11} color="var(--text-secondary)" />
                      <span style={{ fontSize:12,fontWeight:500,color:'var(--text-primary)' }}>{group.date}</span>
                      <span style={{ marginLeft:'auto',fontSize:11,color:'var(--text-muted)' }}>{group.videos.length}</span>
                    </button>
                    {expanded[group.date]&&(
                      <div style={{ padding:8,display:'flex',flexDirection:'column',gap:6 }}>
                        {group.videos.map(v=>(
                          <VideoCard key={v.id} video={v} isSelected={selectedVideo?.id===v.id}
                            onSelect={setSelected} onMomentsDetected={handleMomentsDetected} />
                        ))}
                      </div>
                    )}
                  </div>
                ))
            }
          </div>
        </div>

        {/* Center: player */}
        <div style={{ display:'flex',flexDirection:'column',overflow:'hidden',borderRight:'1px solid var(--border)' }}>
          {selectedVideo ? (
            <>
              <div style={{ flexShrink:0,background:'#000' }}>
                <video ref={videoRef} src={videoStreamUrl(selectedVideo.id)} controls
                  style={{ width:'100%',maxHeight:'52vh',display:'block' }}
                  onTimeUpdate={e=>setTime((e.target as HTMLVideoElement).currentTime)}
                  onLoadedMetadata={e=>setDuration((e.target as HTMLVideoElement).duration)} />
                <canvas ref={canvasRef} style={{ display:'none' }} />
              </div>

              {/* Timeline */}
              <div style={{ padding:'8px 20px',borderBottom:'1px solid var(--border)',
                background:'var(--bg-card)',flexShrink:0 }}>
                <Timeline duration={duration} currentTime={currentTime}
                  moments={selectedVideo.moments??[]} onSeek={handleSeek} />
              </div>

              {/* Video info + moments */}
              <div style={{ flex:1,overflowY:'auto',padding:'16px 20px',background:'var(--bg-page)' }}>
                <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:14 }}>
                  <div style={{ width:36,height:36,borderRadius:8,background:'var(--green-light)',
                    display:'flex',alignItems:'center',justifyContent:'center' }}>
                    <Film size={16} color="var(--green)" />
                  </div>
                  <div>
                    <p style={{ fontSize:14,fontWeight:600 }}>{selectedVideo.date} · {selectedVideo.displayTime}</p>
                    <p style={{ fontSize:11,color:'var(--text-secondary)' }}>{selectedVideo.filename}</p>
                  </div>
                </div>

                <p style={{ fontSize:12,fontWeight:600,color:'var(--text-secondary)',textTransform:'uppercase',
                  letterSpacing:'.04em',marginBottom:10 }}>Detected Moments</p>

                {(selectedVideo.moments?.length??0)===0
                  ? <p style={{ fontSize:13,color:'var(--text-muted)' }}>
                      No moments detected — click Scan on the video card to analyse.
                    </p>
                  : selectedVideo.moments!.map(m=>{
                      const c=m.tags.includes('anomaly')?'var(--red)':m.tags.includes('person')?'var(--green)':'var(--amber)';
                      return (
                        <div key={m.id} onClick={()=>handleSeek(m.timestampSeconds)}
                          className="card"
                          style={{ padding:'10px 12px',marginBottom:6,cursor:'pointer',
                            transition:'all .12s',display:'flex',gap:10 }}
                          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor=c;}}
                          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--border)';}}>
                          <div style={{ width:8,height:8,borderRadius:2,background:c,flexShrink:0,marginTop:4 }} />
                          <div style={{ flex:1 }}>
                            <div style={{ display:'flex',justifyContent:'space-between',marginBottom:2 }}>
                              <span style={{ fontSize:13,fontWeight:500 }}>{m.label}</span>
                              <span style={{ fontSize:11,color:'var(--text-secondary)',fontFamily:'var(--font-mono)' }}>
                                {Math.floor(m.timestampSeconds/60)}:{Math.floor(m.timestampSeconds%60).toString().padStart(2,'0')}
                              </span>
                            </div>
                            <p style={{ fontSize:12,color:'var(--text-secondary)' }}>{m.description}</p>
                            <div style={{ display:'flex',gap:4,marginTop:5,flexWrap:'wrap' }}>
                              {m.tags.map(t=><span key={t} className="tag tag-neutral" style={{ fontSize:9 }}>{t}</span>)}
                            </div>
                          </div>
                        </div>
                      );
                    })
                }
              </div>
            </>
          ) : (
            <div style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',
              justifyContent:'center',gap:10,opacity:.4 }}>
              <Film size={36} color="var(--text-muted)" />
              <p style={{ fontSize:14,fontWeight:500,color:'var(--text-secondary)' }}>Select a recording</p>
              <p style={{ fontSize:12,color:'var(--text-muted)' }}>
                Or ask in chat: "what happened at 3pm on Jan 20?"
              </p>
            </div>
          )}
        </div>

        {/* Right: chat */}
        <ChatPanel mode="recording" getFrames={getFrames}
          videoId={selectedVideo?.id} seekSeconds={currentTime} onVideoRef={handleVideoRef} />
      </main>
    </div>
  );
}

export default function RecordingsPage() {
  return <Suspense><RecordingsInner /></Suspense>;
}
