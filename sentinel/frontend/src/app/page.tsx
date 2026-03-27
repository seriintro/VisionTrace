'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Shield, Radio, Film, Zap, AlertCircle, HardDrive, Calendar, ChevronRight, RefreshCw } from 'lucide-react';
import Sidebar from '@/components/ui/Sidebar';
import { getVideos, getAllMoments, getHealth, refreshIndex } from '@/lib/api';
import { VideoGroup, Moment } from '@/types';

export default function DashboardPage() {
  const [groups, setGroups]   = useState<VideoGroup[]>([]);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [health, setHealth]   = useState<{ geminiConfigured:boolean; droidcamUrl:string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [vRes, mRes, hRes] = await Promise.all([getVideos(), getAllMoments(), getHealth()]);
      setGroups(vRes.groups);
      setMoments(mRes.moments.slice(0,10));
      setHealth(hRes.env);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const doRefresh = async () => {
    setRefreshing(true);
    await refreshIndex(); await load();
    setRefreshing(false);
  };

  const totalVideos  = groups.reduce((s,g) => s + g.videos.length, 0);
  const totalSize    = groups.flatMap(g => g.videos).reduce((s,v) => s + v.size, 0);

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>
      <Sidebar />
      <main style={{ flex:1, overflowY:'auto', background:'var(--bg-app)', padding:'28px 32px' }}>

        {/* Page header */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:28 }}>
          <div>
            <h1 style={{ fontSize:24, fontWeight:700, color:'var(--text-primary)', marginBottom:4 }}>
              Dashboard
            </h1>
            <p style={{ color:'var(--text-secondary)', fontSize:14 }}>
              Overview of your surveillance system
            </p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-secondary" onClick={doRefresh} disabled={refreshing}>
              <RefreshCw size={13} style={refreshing ? { animation:'spin .8s linear infinite' } : {}} />
              Refresh
            </button>
            <Link href="/live" className="btn btn-primary">
              <Radio size={13} /> Live Feed
            </Link>
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
          {[
            { label:'Total Recordings', value: loading ? '—' : String(totalVideos), icon:<Film size={18}/>, color:'var(--green)', bg:'var(--green-light)' },
            { label:'Days Covered',     value: loading ? '—' : `${groups.length}`,  icon:<Calendar size={18}/>, color:'var(--blue)', bg:'var(--blue-light)' },
            { label:'Moments Detected', value: loading ? '—' : String(moments.length), icon:<AlertCircle size={18}/>, color:'var(--amber)', bg:'var(--amber-light)' },
            { label:'Storage Used',     value: loading ? '—' : formatBytes(totalSize), icon:<HardDrive size={18}/>, color:'var(--text-secondary)', bg:'var(--bg-muted)' },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding:'18px 20px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                <p style={{ fontSize:12, fontWeight:500, color:'var(--text-secondary)' }}>{s.label}</p>
                <div style={{ width:34, height:34, borderRadius:8, background:s.bg,
                  display:'flex', alignItems:'center', justifyContent:'center', color:s.color }}>
                  {s.icon}
                </div>
              </div>
              <p style={{ fontSize:26, fontWeight:700, color:'var(--text-primary)' }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Status bar */}
        <div className="card" style={{ padding:'12px 20px', marginBottom:24,
          display:'flex', gap:24, alignItems:'center', flexWrap:'wrap' }}>
          <p style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)', marginRight:8 }}>
            System Status
          </p>
          <StatusPill label="Backend API" ok={!loading} />
          <StatusPill label="Gemini AI"   ok={health?.geminiConfigured ?? false} />
          <StatusPill label={`DroidCam · ${health?.droidcamUrl ?? '…'}`} ok warn />
        </div>

        {/* Two columns */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

          {/* Recent recordings */}
          <div className="card" style={{ overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)',
              display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <h3 style={{ fontSize:14, fontWeight:600 }}>Recent Recordings</h3>
              <Link href="/recordings" className="btn btn-ghost" style={{ fontSize:12, padding:'4px 8px',
                display:'flex', alignItems:'center', gap:4, color:'var(--green)' }}>
                View all <ChevronRight size={13} />
              </Link>
            </div>
            <div style={{ maxHeight:300, overflowY:'auto' }}>
              {loading ? <ShimmerList /> : groups.length === 0
                ? <Empty label="No recordings found" sub="Add files to surveillance-videos/YYYY-MM-DD/" />
                : groups.flatMap(g => g.videos).slice(0,8).map(v => (
                  <Link key={v.id} href={`/recordings?v=${v.id}`}
                    style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 20px',
                      borderBottom:'1px solid var(--border)', textDecoration:'none',
                      transition:'background .1s', color:'inherit' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background='var(--bg-muted)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background='transparent'}
                  >
                    <div style={{ width:32, height:32, borderRadius:6, background:'var(--green-light)',
                      display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <Film size={14} color="var(--green)" />
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)' }}>
                        {v.date} · {v.displayTime}
                      </p>
                      <p style={{ fontSize:11, color:'var(--text-muted)',
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {v.filename}
                      </p>
                    </div>
                    {(v.moments?.length ?? 0) > 0 && (
                      <span className="badge badge-amber">{v.moments!.length} events</span>
                    )}
                  </Link>
                ))}
            </div>
          </div>

          {/* Detected moments */}
          <div className="card" style={{ overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)',
              display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <h3 style={{ fontSize:14, fontWeight:600 }}>Detected Moments</h3>
              <span className="badge badge-gray">AI Scanned</span>
            </div>
            <div style={{ maxHeight:300, overflowY:'auto' }}>
              {loading ? <ShimmerList /> : moments.length === 0
                ? <Empty label="No moments detected yet" sub="Click Scan on a recording to analyse it" />
                : moments.map(m => {
                  const color = m.tags.includes('anomaly') ? 'var(--red)' :
                                m.tags.includes('person')  ? 'var(--green)' : 'var(--amber)';
                  const bg    = m.tags.includes('anomaly') ? 'var(--red-light)' :
                                m.tags.includes('person')  ? 'var(--green-light)' : 'var(--amber-light)';
                  return (
                    <div key={m.id} style={{ padding:'11px 20px', borderBottom:'1px solid var(--border)',
                      display:'flex', gap:10, alignItems:'flex-start' }}>
                      <div style={{ width:28, height:28, borderRadius:6, background:bg, flexShrink:0,
                        display:'flex', alignItems:'center', justifyContent:'center', marginTop:1 }}>
                        <Zap size={13} color={color} />
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)', marginBottom:2 }}>
                          {m.label}
                        </p>
                        <p style={{ fontSize:11, color:'var(--text-secondary)',
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {m.description}
                        </p>
                        <p style={{ fontSize:10, color:'var(--text-muted)', marginTop:3 }}>
                          {m.videoDate} · {m.videoTime}
                        </p>
                      </div>
                      <span style={{ fontSize:11, fontWeight:600, color, flexShrink:0 }}>
                        {Math.round(m.confidence * 100)}%
                      </span>
                    </div>
                  );
                })
              }
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatusPill({ label, ok, warn }: { label:string; ok:boolean; warn?:boolean }) {
  const color = warn ? 'var(--amber)' : ok ? 'var(--green)' : 'var(--red)';
  const bg    = warn ? 'var(--amber-light)' : ok ? 'var(--green-light)' : 'var(--red-light)';
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 10px',
      background:bg, borderRadius:999 }}>
      <div style={{ width:6, height:6, borderRadius:'50%', background:color, flexShrink:0 }} />
      <span style={{ fontSize:11, fontWeight:500, color:'var(--text-secondary)' }}>{label}</span>
    </div>
  );
}

function ShimmerList() {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
      {[1,2,3,4].map(i => (
        <div key={i} style={{ padding:'11px 20px', borderBottom:'1px solid var(--border)',
          display:'flex', gap:10, alignItems:'center' }}>
          <div className="shimmer" style={{ width:32, height:32, borderRadius:6, flexShrink:0 }} />
          <div style={{ flex:1, display:'flex', flexDirection:'column', gap:5 }}>
            <div className="shimmer" style={{ height:11, width:'55%' }} />
            <div className="shimmer" style={{ height:9, width:'35%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty({ label, sub }: { label:string; sub?:string }) {
  return (
    <div style={{ padding:'32px 20px', textAlign:'center' }}>
      <p style={{ fontSize:13, fontWeight:500, color:'var(--text-secondary)', marginBottom:4 }}>{label}</p>
      {sub && <p style={{ fontSize:11, color:'var(--text-muted)' }}>{sub}</p>}
    </div>
  );
}

function formatBytes(b:number):string {
  if (b > 1e9) return (b/1e9).toFixed(1)+' GB';
  if (b > 1e6) return (b/1e6).toFixed(1)+' MB';
  if (b > 1e3) return (b/1e3).toFixed(0)+' KB';
  return '0 KB';
}
