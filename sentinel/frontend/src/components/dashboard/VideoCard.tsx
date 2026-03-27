'use client';
import { useState, useEffect } from 'react';
import { Film, Clock, HardDrive, Zap } from 'lucide-react';
import { VideoFile } from '@/types';
import { getThumbnail, detectMoments } from '@/lib/api';

interface VideoCardProps {
  video: VideoFile; isSelected: boolean;
  onSelect: (v:VideoFile)=>void;
  onMomentsDetected?: (id:string, moments:import('@/types').Moment[])=>void;
}

function fmtBytes(b:number) { return b>1e9?(b/1e9).toFixed(1)+' GB':b>1e6?(b/1e6).toFixed(1)+' MB':(b/1e3).toFixed(0)+' KB'; }

export default function VideoCard({ video, isSelected, onSelect, onMomentsDetected }: VideoCardProps) {
  const [thumb,    setThumb]   = useState<string|null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanDone, setScanDone] = useState(false);

  useEffect(() => { getThumbnail(video.id).then(r=>setThumb(r.thumbnail)).catch(()=>{}); }, [video.id]);

  const scan = async (e: React.MouseEvent) => {
    e.stopPropagation(); setScanning(true);
    try {
      const { moments } = await detectMoments(video.id);
      setScanDone(true); onMomentsDetected?.(video.id, moments);
    } catch {} finally { setScanning(false); }
  };

  const hasMoments = (video.moments?.length??0) > 0;

  return (
    <div onClick={()=>onSelect(video)}
      className="card"
      style={{ cursor:'pointer', overflow:'hidden', transition:'all .15s',
        border:`1px solid ${isSelected?'var(--green-mid)':'var(--border)'}`,
        boxShadow: isSelected ? '0 0 0 2px rgba(64,145,108,.2), var(--shadow-sm)' : 'var(--shadow-sm)',
      }}>
      {/* Thumbnail */}
      <div style={{ position:'relative', aspectRatio:'16/9', background:'var(--bg-hover)', overflow:'hidden' }}>
        {thumb
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={thumb} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          : <div style={{ width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center' }}>
              <Film size={20} color="var(--text-muted)" />
            </div>
        }
        <div style={{ position:'absolute',bottom:4,right:4,
          background:'rgba(0,0,0,.6)',color:'#fff',fontSize:10,fontWeight:500,
          padding:'2px 6px',borderRadius:4 }}>{video.displayTime}</div>
        {hasMoments && (
          <div style={{ position:'absolute',top:4,left:4 }}>
            <span className="tag tag-amber" style={{ fontSize:9,padding:'1px 6px' }}>
              {video.moments!.length} events
            </span>
          </div>
        )}
      </div>
      {/* Info */}
      <div style={{ padding:'8px 10px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', gap:10 }}>
          <span style={{ fontSize:11,color:'var(--text-secondary)',display:'flex',alignItems:'center',gap:3 }}>
            <HardDrive size={10} />{fmtBytes(video.size)}
          </span>
          {video.duration && (
            <span style={{ fontSize:11,color:'var(--text-secondary)',display:'flex',alignItems:'center',gap:3 }}>
              <Clock size={10} />{Math.floor(video.duration/60)}m
            </span>
          )}
        </div>
        <button onClick={scan} disabled={scanning||scanDone}
          className={`btn ${scanDone?'btn-ghost':'btn-secondary'}`}
          style={{ fontSize:10,padding:'3px 8px',borderRadius:6 }}>
          {scanning
            ? <span style={{ width:10,height:10,borderRadius:'50%',display:'inline-block',
                border:'1.5px solid var(--text-muted)',borderTopColor:'transparent',
                animation:'spin .8s linear infinite' }} />
            : scanDone ? '✓ Scanned' : <><Zap size={10} />Scan</>}
        </button>
      </div>
    </div>
  );
}
