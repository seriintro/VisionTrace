'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { FlipHorizontal, Video, VideoOff, RefreshCw, Circle, Square, Upload } from 'lucide-react';
import { mjpegUrl, getStreamStatus, uploadVideo, refreshIndex } from '@/lib/api';

const DROIDCAM = process.env.NEXT_PUBLIC_DROIDCAM_URL || 'http://192.168.x.x:4747';
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

export default function LiveCamera({ onFrameCapture }:{ onFrameCapture:(fn:()=>Promise<string[]>)=>void }) {
  const [mode,   setMode]   = useState<'droidcam'|'device'>('droidcam');
  const [status, setStatus] = useState<'idle'|'connecting'|'live'|'error'>('idle');
  const [error,  setError]  = useState('');
  const [facing, setFacing] = useState<'environment'|'user'>('environment');

  // ── Recording state ──────────────────────────────────────────────────────
  const [recording,      setRecording]      = useState(false);
  const [recordingTime,  setRecordingTime]  = useState(0);
  const [uploadStatus,   setUploadStatus]   = useState<'idle'|'uploading'|'done'|'error'>('idle');
  const [uploadMsg,      setUploadMsg]      = useState('');
  const mediaRecorderRef  = useRef<MediaRecorder|null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerRef          = useRef<ReturnType<typeof setInterval>|null>(null);
  const drawLoopRef       = useRef<ReturnType<typeof setInterval>|null>(null);

  const imgRef       = useRef<HTMLImageElement>(null);
  const videoRef     = useRef<HTMLVideoElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const streamRef    = useRef<MediaStream|null>(null);
  const retryCount   = useRef(0);
  const retryTimer   = useRef<ReturnType<typeof setTimeout>|null>(null);
  const [imgKey, setImgKey] = useState(0);

  const connectDroidCam = useCallback(async () => {
    retryCount.current = 0;
    setStatus('connecting'); setError('');
    try {
      const s = await getStreamStatus();
      if (!s.connected) throw new Error('DroidCam not reachable at '+DROIDCAM);
      setImgKey(k => k + 1);
      setStatus('live');
    } catch(e) { setError(e instanceof Error?e.message:'Connection failed'); setStatus('error'); }
  },[]);

  const handleStreamError = useCallback(() => {
    if (retryCount.current < MAX_RETRIES) {
      retryCount.current += 1;
      setError(`Stream dropped — retrying (${retryCount.current}/${MAX_RETRIES})…`);
      setStatus('connecting');
      retryTimer.current = setTimeout(async () => {
        try {
          const s = await getStreamStatus();
          if (!s.connected) throw new Error('DroidCam not reachable');
          setImgKey(k => k + 1);
          setStatus('live');
          setError('');
        } catch {
          handleStreamError();
        }
      }, RETRY_DELAY_MS);
    } else {
      setStatus('error');
      setError('Stream disconnected — DroidCam unreachable after retries');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { if (retryTimer.current) clearTimeout(retryTimer.current); }, []);

  const connectDevice = useCallback(async (f:'environment'|'user'='environment') => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop());
    setStatus('connecting'); setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:f},audio:true});
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject=stream; await videoRef.current.play(); }
      setFacing(f); setStatus('live');
    } catch(e) { setError(e instanceof Error?e.message:'Camera denied'); setStatus('error'); }
  },[]);

  useEffect(()=>()=>{ streamRef.current?.getTracks().forEach(t=>t.stop()); },[]);

  const captureFrames = useCallback(async ():Promise<string[]> => {
    const canvas=canvasRef.current; if(!canvas) return [];
    const ctx=canvas.getContext('2d'); if(!ctx) return [];
    if (mode==='droidcam'&&imgRef.current&&imgRef.current.naturalWidth>0) {
      canvas.width=imgRef.current.naturalWidth; canvas.height=imgRef.current.naturalHeight;
      ctx.drawImage(imgRef.current,0,0); return [canvas.toDataURL('image/jpeg',.85)];
    }
    if (mode==='device'&&videoRef.current&&videoRef.current.readyState>=2) {
      const v=videoRef.current; canvas.width=v.videoWidth; canvas.height=v.videoHeight;
      const frames:string[]=[]; for(let i=0;i<3;i++){ctx.drawImage(v,0,0);frames.push(canvas.toDataURL('image/jpeg',.85));if(i<2)await new Promise(r=>setTimeout(r,500));} return frames;
    }
    return [];
  },[mode]);

  useEffect(()=>{ onFrameCapture(captureFrames); },[captureFrames,onFrameCapture]);

  // ── Recording helpers ────────────────────────────────────────────────────

  const formatTime = (secs: number) => {
    const m = Math.floor(secs/60).toString().padStart(2,'0');
    const s = (secs%60).toString().padStart(2,'0');
    return `${m}:${s}`;
  };

  const startRecording = useCallback(() => {
    recordedChunksRef.current = [];

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : 'video/webm';

    // ── Device cam: record directly from the live MediaStream ──────────────
    if (mode === 'device' && streamRef.current) {
      const mr = new MediaRecorder(streamRef.current, { mimeType });
      mr.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      mr.start(500); // chunk every 500ms — finer granularity, less data loss
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
      return;
    }

    // ── DroidCam: draw MJPEG img → canvas → captureStream ─────────────────
    if (mode === 'droidcam' && canvasRef.current) {
      const canvas = canvasRef.current;
      const img    = imgRef.current;

      // Set canvas size from the live image
      if (img && img.naturalWidth > 0) {
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
      } else {
        canvas.width  = 1280;
        canvas.height = 720;
      }

      const ctx = canvas.getContext('2d')!;

      // Use setInterval (not rAF) so we drive at a stable fps independently
      // of the browser paint cycle. 15fps = ~67ms interval.
      drawLoopRef.current = setInterval(() => {
        if (img && img.naturalWidth > 0 && img.complete) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
      }, 67);

      // captureStream(15) tells the browser the canvas produces 15fps
      const canvasStream = canvas.captureStream(15);
      const mr = new MediaRecorder(canvasStream, { mimeType });
      mr.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      mr.start(500); // chunk every 500ms
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    }
  }, [mode]);

  const stopRecording = useCallback(async () => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;

    // Stop droidcam draw loop
    if (drawLoopRef.current) { clearInterval(drawLoopRef.current); drawLoopRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecording(false);

    mr.stop();

    // Wait for final data
    await new Promise<void>(resolve => { mr.onstop = () => resolve(); });

    const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
    if (blob.size === 0) {
      setUploadMsg('Nothing recorded.');
      setUploadStatus('error');
      setTimeout(() => setUploadStatus('idle'), 3000);
      return;
    }

    // Build filename: HH-MM-SS.webm based on local time (not UTC)
    const now = new Date();
    const hms = now.toTimeString().slice(0,8).replace(/:/g,'-');
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const file = new File([blob], `${hms}.webm`, { type: 'video/webm' });

    setUploadStatus('uploading');
    setUploadMsg('Saving recording…');
    try {
      await uploadVideo(file, dateStr);
      await refreshIndex();
      setUploadMsg('Recording saved!');
      setUploadStatus('done');
    } catch (e) {
      setUploadMsg(e instanceof Error ? e.message : 'Upload failed');
      setUploadStatus('error');
    }
    setTimeout(() => { setUploadStatus('idle'); setUploadMsg(''); }, 3500);
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (drawLoopRef.current) clearInterval(drawLoopRef.current);
    mediaRecorderRef.current?.stop();
  }, []);

  const isLive = status==='live';

  return (
    <div style={{ background:'var(--bg-card)', borderBottom:'1px solid var(--border)' }}>
      {/* Feed */}
      <div style={{ position:'relative', aspectRatio:'16/9', background:'#111', overflow:'hidden', maxHeight:'42vh' }}>
        {mode==='droidcam'&&(isLive||status==='connecting')&&(
          // eslint-disable-next-line @next/next/no-img-element
          <img key={imgKey} ref={imgRef} src={mjpegUrl()} alt="live"
            style={{ width:'100%',height:'100%',objectFit:'cover',display:isLive?'block':'none' }}
            onLoad={()=>{ retryCount.current=0; setStatus('live'); setError(''); }}
            onError={handleStreamError} />
        )}
        {mode==='device'&&(
          <video ref={videoRef} playsInline muted autoPlay
            style={{ width:'100%',height:'100%',objectFit:'cover',display:isLive?'block':'none',
              transform:facing==='user'?'scaleX(-1)':'none' }} />
        )}
        <canvas ref={canvasRef} style={{ display:'none' }} />

        {/* Live badge */}
        {isLive && (
          <div style={{ position:'absolute',top:10,left:10,display:'flex',alignItems:'center',gap:6,
            background:'rgba(0,0,0,.55)',padding:'4px 10px',borderRadius:20 }}>
            <span className="status-dot live" />
            <span style={{ fontSize:11,fontWeight:500,color:'#fff' }}>
              {mode==='droidcam'?'DroidCam':'Device'}
            </span>
          </div>
        )}

        {/* Recording badge */}
        {recording && (
          <div style={{ position:'absolute',top:10,right:10,display:'flex',alignItems:'center',gap:6,
            background:'rgba(220,38,38,.85)',padding:'4px 10px',borderRadius:20,animation:'pulse-live 1.5s ease-in-out infinite' }}>
            <Circle size={8} fill="#fff" color="#fff" />
            <span style={{ fontSize:11,fontWeight:600,color:'#fff',fontFamily:'var(--font-mono)' }}>
              REC {formatTime(recordingTime)}
            </span>
          </div>
        )}

        {/* Status screens */}
        {status==='idle'&&<Center icon={<VideoOff size={28} color="var(--text-muted)"/>} label="Camera offline" />}
        {status==='connecting'&&<Center icon={<RefreshCw size={28} color="var(--green)" style={{animation:'spin .8s linear infinite'}}/>} label="Connecting…" />}
        {status==='error'&&<Center icon={<VideoOff size={28} color="var(--red)"/>} label={error||'Connection error'} color="var(--red)"
          action={<button className="btn btn-secondary" style={{fontSize:12}} onClick={()=>mode==='droidcam'?connectDroidCam():connectDevice(facing)}>Retry</button>} />}
      </div>

      {/* Controls */}
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',
        padding:'8px 14px',gap:8,flexWrap:'wrap' }}>
        {/* Mode selector */}
        <div style={{ display:'flex',gap:4 }}>
          {(['droidcam','device'] as const).map(m=>(
            <button key={m} onClick={()=>setMode(m)}
              className={`btn ${mode===m?'btn-primary':'btn-secondary'}`}
              style={{ fontSize:11,padding:'4px 10px' }}>
              {m==='droidcam'?'DroidCam':'Device Cam'}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div style={{ display:'flex',gap:4,alignItems:'center' }}>
          {mode==='device'&&isLive&&(
            <button className="btn btn-secondary" style={{ padding:'5px 8px' }}
              onClick={()=>connectDevice(facing==='environment'?'user':'environment')}>
              <FlipHorizontal size={13} />
            </button>
          )}

          {/* Start / Stop Camera */}
          <button onClick={()=>{
            if(isLive){
              if(recording) stopRecording();
              setStatus('idle');
              streamRef.current?.getTracks().forEach(t=>t.stop());
            }
            else mode==='droidcam'?connectDroidCam():connectDevice(facing);
          }}
            className={`btn ${isLive?'btn-danger':'btn-primary'}`}
            style={{ fontSize:11,padding:'4px 12px' }}>
            {isLive?<><VideoOff size={12}/>Stop</>:<><Video size={12}/>Start</>}
          </button>

          {/* Start / Stop Recording — only shown when live */}
          {isLive && (
            recording ? (
              <button
                className="btn btn-danger"
                style={{ fontSize:11,padding:'4px 12px',fontWeight:600 }}
                onClick={stopRecording}>
                <Square size={12} fill="currentColor" /> Stop Recording
              </button>
            ) : (
              <button
                className="btn btn-primary"
                style={{ fontSize:11,padding:'4px 12px',background:'var(--red)',borderColor:'var(--red)' }}
                onClick={startRecording}>
                <Circle size={12} fill="currentColor" /> Start Recording
              </button>
            )
          )}
        </div>
      </div>

      {/* Upload status banner */}
      {uploadStatus !== 'idle' && (
        <div style={{
          margin:'0 14px 10px',padding:'7px 12px',borderRadius:'var(--radius-md)',
          display:'flex',alignItems:'center',gap:8,fontSize:12,fontWeight:500,
          background: uploadStatus==='done' ? 'var(--green-light)'
                    : uploadStatus==='error' ? 'var(--red-light)'
                    : 'var(--bg-muted)',
          color: uploadStatus==='done' ? 'var(--green)'
               : uploadStatus==='error' ? 'var(--red)'
               : 'var(--text-secondary)',
          border: `1px solid ${uploadStatus==='done'?'#bbf7d0':uploadStatus==='error'?'#fecaca':'var(--border)'}`,
        }}>
          {uploadStatus==='uploading' && <RefreshCw size={12} style={{animation:'spin .8s linear infinite',flexShrink:0}} />}
          {uploadStatus==='done'      && <Upload size={12} style={{flexShrink:0}} />}
          {uploadMsg}
        </div>
      )}
    </div>
  );
}

function Center({icon,label,color='var(--text-secondary)',action}:{icon:React.ReactNode;label:string;color?:string;action?:React.ReactNode}) {
  return (
    <div style={{ position:'absolute',inset:0,display:'flex',flexDirection:'column',
      alignItems:'center',justifyContent:'center',gap:10,background:'rgba(0,0,0,.85)' }}>
      {icon}
      <p style={{ fontSize:12,color,fontWeight:500 }}>{label}</p>
      {action}
    </div>
  );
}
