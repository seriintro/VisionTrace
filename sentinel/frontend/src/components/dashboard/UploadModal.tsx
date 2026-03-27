'use client';
import { useState, useRef, useCallback } from 'react';
import { Upload, X, Film, CheckCircle, AlertCircle } from 'lucide-react';
import { uploadVideo, refreshIndex } from '@/lib/api';

export default function UploadModal({ onClose, onSuccess }: { onClose:()=>void; onSuccess:()=>void }) {
  const [files,     setFiles]     = useState<File[]>([]);
  const _now = new Date();
  const [date, setDate] = useState(`${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`);
  const [progress,  setProgress]  = useState<Record<string,'idle'|'uploading'|'done'|'error'>>({});
  const [uploading, setUploading] = useState(false);
  const [drag,      setDrag]      = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((f:File[]) => setFiles(p=>[...p,...f.filter(x=>x.type.startsWith('video/'))]), []);
  const onDrop   = useCallback((e:React.DragEvent) => { e.preventDefault(); setDrag(false); addFiles(Array.from(e.dataTransfer.files)); }, [addFiles]);

  const doUpload = async () => {
    if (!files.length) return;
    setUploading(true);
    for (const f of files) {
      setProgress(p=>({...p,[f.name]:'uploading'}));
      try { await uploadVideo(f,date); setProgress(p=>({...p,[f.name]:'done'})); }
      catch { setProgress(p=>({...p,[f.name]:'error'})); }
    }
    await refreshIndex(); setUploading(false); onSuccess();
  };

  const allDone = files.length>0 && files.every(f=>progress[f.name]==='done');

  return (
    <div style={{ position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',
      justifyContent:'center',background:'rgba(0,0,0,.4)',backdropFilter:'blur(4px)' }}
      onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="card-lg"
        style={{ width:460,padding:24,display:'flex',flexDirection:'column',gap:16 }}>

        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          <h2 style={{ fontSize:17,fontWeight:600 }}>Upload Recordings</h2>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding:4 }}><X size={18}/></button>
        </div>

        <div>
          <label style={{ fontSize:12,fontWeight:500,color:'var(--text-secondary)',display:'block',marginBottom:5 }}>
            Recording Date
          </label>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}
            className="input" style={{ width:'100%' }} />
        </div>

        {/* Drop zone */}
        <div onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)}
          onDrop={onDrop} onClick={()=>inputRef.current?.click()}
          style={{ border:`2px dashed ${drag?'var(--green-mid)':'var(--border)'}`,
            borderRadius:'var(--radius-md)',padding:'28px 20px',display:'flex',
            flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,
            cursor:'pointer',background:drag?'var(--green-light)':'var(--bg-input)',transition:'all .15s' }}>
          <div style={{ width:40,height:40,borderRadius:10,background:drag?'var(--green-light)':'var(--bg-hover)',
            display:'flex',alignItems:'center',justifyContent:'center',transition:'all .15s' }}>
            <Upload size={20} color={drag?'var(--green)':'var(--text-secondary)'} />
          </div>
          <p style={{ fontSize:13,fontWeight:500,color:drag?'var(--green)':'var(--text-secondary)' }}>
            Drop video files or click to browse
          </p>
          <p style={{ fontSize:11,color:'var(--text-muted)' }}>MP4, MKV, AVI, MOV, WEBM</p>
          <input ref={inputRef} type="file" accept="video/*" multiple style={{ display:'none' }}
            onChange={e=>addFiles(Array.from(e.target.files??[]))} />
        </div>

        {files.length>0 && (
          <div style={{ display:'flex',flexDirection:'column',gap:4,maxHeight:150,overflowY:'auto' }}>
            {files.map(f => {
              const st = progress[f.name]??'idle';
              return (
                <div key={f.name} style={{ display:'flex',alignItems:'center',gap:8,padding:'7px 10px',
                  background:'var(--bg-hover)',borderRadius:8,border:'1px solid var(--border)' }}>
                  <Film size={13} color="var(--text-secondary)" style={{ flexShrink:0 }} />
                  <span style={{ flex:1,fontSize:12,color:'var(--text-primary)',overflow:'hidden',
                    textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{f.name}</span>
                  {st==='uploading'&&<span style={{ width:13,height:13,borderRadius:'50%',display:'inline-block',
                    border:'2px solid var(--green-mid)',borderTopColor:'transparent',
                    animation:'spin .8s linear infinite',flexShrink:0 }} />}
                  {st==='done'    &&<CheckCircle size={14} color="var(--green)" style={{ flexShrink:0 }} />}
                  {st==='error'   &&<AlertCircle size={14} color="var(--red)"   style={{ flexShrink:0 }} />}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display:'flex',justifyContent:'flex-end',gap:8 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={doUpload}
            disabled={uploading||!files.length||allDone}>
            {uploading?'Uploading…':allDone?'✓ Done':`Upload ${files.length} file${files.length!==1?'s':''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
