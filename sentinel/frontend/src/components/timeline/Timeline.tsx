'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { Moment } from '@/types';

function fmt(s:number) { return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`; }

export default function Timeline({ duration, currentTime, moments, onSeek }:{
  duration:number; currentTime:number; moments:Moment[]; onSeek:(s:number)=>void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{x:number;time:number}|null>(null);
  const [dragging,setDragging] = useState(false);

  const posFromEvent = useCallback((e:MouseEvent|React.MouseEvent) => {
    if (!trackRef.current||!duration) return 0;
    const r = trackRef.current.getBoundingClientRect();
    return Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*duration;
  },[duration]);

  const onMouseMove = useCallback((e:React.MouseEvent) => {
    const t = posFromEvent(e);
    if (!trackRef.current) return;
    setTooltip({ x: e.clientX-trackRef.current.getBoundingClientRect().left, time:t });
    if (dragging) onSeek(t);
  },[posFromEvent,dragging,onSeek]);

  const onMouseDown = useCallback((e:React.MouseEvent) => { setDragging(true); onSeek(posFromEvent(e)); },[posFromEvent,onSeek]);

  useEffect(() => {
    if (!dragging) return;
    const up = () => setDragging(false);
    window.addEventListener('mouseup',up); return ()=>window.removeEventListener('mouseup',up);
  },[dragging]);

  const pct = duration>0?(currentTime/duration)*100:0;

  return (
    <div style={{ padding:'8px 0', userSelect:'none' }}>
      <div style={{ display:'flex',justifyContent:'space-between',marginBottom:6 }}>
        <span style={{ fontSize:11,color:'var(--text-secondary)',fontFamily:'var(--font-mono)' }}>{fmt(currentTime)}</span>
        <span style={{ fontSize:11,color:'var(--text-secondary)',fontFamily:'var(--font-mono)' }}>{fmt(duration)}</span>
      </div>

      <div ref={trackRef} onMouseMove={onMouseMove} onMouseDown={onMouseDown}
        onMouseLeave={()=>{setTooltip(null);}}
        style={{ position:'relative',height:24,cursor:'pointer' }}>

        {/* Track */}
        <div style={{ position:'absolute',top:'50%',transform:'translateY(-50%)',
          left:0,right:0,height:4,background:'var(--border)',borderRadius:4 }}>
          {/* Fill */}
          <div style={{ position:'absolute',left:0,top:0,bottom:0,width:`${pct}%`,
            background:'var(--green)',borderRadius:4,transition:dragging?'none':'width .1s' }} />
        </div>

        {/* Moment markers */}
        {moments.map(m => {
          const p = duration>0?(m.timestampSeconds/duration)*100:0;
          const c = m.tags.includes('anomaly')?'var(--red)':m.tags.includes('person')?'var(--green)':'var(--amber)';
          return (
            <div key={m.id} title={`${m.label} @ ${fmt(m.timestampSeconds)}`}
              onClick={e=>{e.stopPropagation();onSeek(m.timestampSeconds);}}
              style={{ position:'absolute',top:'50%',transform:'translate(-50%,-50%)',
                left:`${p}%`,width:10,height:10,borderRadius:2,background:c,
                border:'2px solid #fff',cursor:'pointer',zIndex:3,
                boxShadow:'0 1px 3px rgba(0,0,0,.2)' }} />
          );
        })}

        {/* Playhead */}
        <div style={{ position:'absolute',top:'50%',transform:'translate(-50%,-50%)',
          left:`${pct}%`,width:14,height:14,borderRadius:'50%',
          background:'#fff',border:'2px solid var(--green)',zIndex:4,
          boxShadow:'0 1px 4px rgba(0,0,0,.2)',transition:dragging?'none':'left .1s' }} />

        {/* Tooltip */}
        {tooltip && (
          <div style={{ position:'absolute',bottom:'calc(100% + 6px)',left:tooltip.x,
            transform:'translateX(-50%)',background:'var(--text-primary)',color:'#fff',
            fontSize:11,padding:'3px 8px',borderRadius:5,pointerEvents:'none',zIndex:10,
            whiteSpace:'nowrap',fontFamily:'var(--font-mono)' }}>
            {fmt(tooltip.time)}
          </div>
        )}
      </div>

      {/* Moment chips */}
      {moments.length>0 && (
        <div style={{ display:'flex',gap:4,flexWrap:'wrap',marginTop:8 }}>
          {moments.slice(0,5).map(m => (
            <button key={m.id} onClick={()=>onSeek(m.timestampSeconds)}
              className="tag tag-neutral"
              style={{ cursor:'pointer',fontSize:10,transition:'all .12s' }}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--green-mid)';(e.currentTarget as HTMLElement).style.color='var(--green)';}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--border)';(e.currentTarget as HTMLElement).style.color='var(--text-secondary)';}}>
              ▶ {m.label} · {fmt(m.timestampSeconds)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
