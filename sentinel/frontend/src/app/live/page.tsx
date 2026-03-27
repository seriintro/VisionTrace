'use client';
import { useCallback, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import Sidebar from '@/components/ui/Sidebar';
import LiveCamera from '@/components/camera/LiveCamera';
import ChatPanel from '@/components/chat/ChatPanel';
import UploadModal from '@/components/dashboard/UploadModal';
import { refreshIndex } from '@/lib/api';

const DROIDCAM_DISPLAY = process.env.NEXT_PUBLIC_DROIDCAM_URL?.replace('http://','') || '192.168.29.130:4747';

export default function LivePage() {
  const capturerRef = useRef<(()=>Promise<string[]>)|null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const onCameraReady = useCallback((fn:()=>Promise<string[]>) => { capturerRef.current = fn; }, []);
  const getFrames     = useCallback(async () => capturerRef.current ? capturerRef.current() : [], []);

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>
      <Sidebar />

      {showUpload && (
        <UploadModal onClose={()=>setShowUpload(false)}
          onSuccess={async()=>{ await refreshIndex(); setShowUpload(false); }} />
      )}

      <main style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        {/* Header */}
        <div style={{ padding:'14px 24px', background:'var(--bg-card)', borderBottom:'1px solid var(--border)',
          display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span className="status-dot live" />
            <h1 style={{ fontSize:16, fontWeight:600 }}>Live Surveillance</h1>
            <span className="tag tag-neutral" style={{ fontSize:11 }}>
              DroidCam · {DROIDCAM_DISPLAY}
            </span>
          </div>
          <button className="btn btn-secondary" onClick={()=>setShowUpload(true)}>
            <Upload size={13} /> Upload Recording
          </button>
        </div>

        {/* Body */}
        <div style={{ flex:1, display:'grid', gridTemplateColumns:'1fr 380px', overflow:'hidden' }}>
          {/* Camera */}
          <div style={{ borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <LiveCamera onFrameCapture={onCameraReady} />
            <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', background:'var(--bg-page)' }}>
              <p style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)', textTransform:'uppercase',
                letterSpacing:'.04em', marginBottom:10 }}>How to use</p>
              {[
                '1. Start DroidCam on your Android — connect to the same WiFi',
                '2. Click Start → DroidCam to connect the live feed',
                '3. Ask VisionTrace about what\'s happening in real-time',
                '4. Use Upload Recording to add surveillance footage',
                '5. Visit AI Chat to query recordings by date & time',
              ].map(s => (
                <p key={s} style={{ fontSize:13, color:'var(--text-secondary)', marginBottom:6, lineHeight:1.5 }}>{s}</p>
              ))}
            </div>
          </div>
          {/* Chat */}
          <ChatPanel mode="live" getFrames={getFrames} />
        </div>
      </main>
    </div>
  );
}
