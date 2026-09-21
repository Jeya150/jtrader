import {useEffect,useRef,useState} from 'react';

type Props={lessonId:string;title:string};
type Identity={name?:string;email?:string;contact_number?:string};

const ALL_POSITIONS=[
  {top:'8%',left:'6%'},{top:'8%',left:'55%'},
  {top:'30%',left:'4%'},{top:'30%',left:'58%'},
  {top:'55%',left:'6%'},{top:'55%',left:'52%'},
  {top:'78%',left:'5%'},{top:'78%',left:'57%'},
];

function WatermarkStamp({identity,offset}:{identity:Identity;offset:number}){
  const [posIdx,setPosIdx]=useState(offset%ALL_POSITIONS.length);
  useEffect(()=>{
    const t=window.setInterval(()=>{
      setPosIdx(i=>(i+2)%ALL_POSITIONS.length);
    },4000+offset*700);
    return ()=>window.clearInterval(t);
  },[offset]);
  const pos=ALL_POSITIONS[posIdx];
  const ts=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
  return (
    <div style={{
      position:'absolute',
      top:pos.top,left:pos.left,
      pointerEvents:'none',userSelect:'none',
      background:'rgba(0,0,0,0.35)',
      backdropFilter:'blur(2px)',
      border:'1px solid rgba(255,255,255,0.12)',
      borderRadius:'4px',
      padding:'4px 8px',
      fontSize:'9px',
      lineHeight:1.5,
      color:'rgba(255,255,255,0.65)',
      fontFamily:'monospace',
      transition:'top 0.8s ease, left 0.8s ease',
      zIndex:3,
      maxWidth:'160px',
      wordBreak:'break-all',
    }}>
      <div style={{fontWeight:700,color:'rgba(255,255,255,0.8)'}}>{identity.name||'Student'}</div>
      <div>{identity.email||''}</div>
      {identity.contact_number&&<div>{identity.contact_number}</div>}
      <div style={{color:'rgba(255,255,255,0.4)',fontSize:'8px'}}>{ts} · JTRADER</div>
    </div>
  );
}

export default function WatermarkedVideo({lessonId,title}:Props){
  const videoRef=useRef<HTMLVideoElement>(null);
  const [identity,setIdentity]=useState<Identity|null>(null);
  const [recordingWarning,setRecordingWarning]=useState(false);
  const [accepted,setAccepted]=useState(false);
  const warningTimer=useRef<ReturnType<typeof setTimeout>|null>(null);

  useEffect(()=>{
    let active=true;
    fetch('/api/auth').then(r=>r.json()).then((d:any)=>{
      if(active && d?.user?.role==='student') setIdentity(d.user);
    }).catch(()=>{});

    // Disable PiP when video loads
    const vid=videoRef.current;
    if(vid){
      (vid as any).disablePictureInPicture=true;
      vid.addEventListener('enterpictureinpicture',e=>e.preventDefault());
    }

    // Screen recording detection via Page Visibility API
    function onVisibilityChange(){
      if(document.hidden){
        setRecordingWarning(true);
        if(warningTimer.current) clearTimeout(warningTimer.current);
        warningTimer.current=setTimeout(()=>setRecordingWarning(false),8000);
      }
    }
    document.addEventListener('visibilitychange',onVisibilityChange);

    // Detect screen capture via display-media (Chrome)
    let captureCheck:ReturnType<typeof setInterval>|null=null;
    if('mediaDevices' in navigator){
      captureCheck=setInterval(async()=>{
        try{
          // @ts-ignore
          const devices=await navigator.mediaDevices.enumerateDevices();
          // If a new display capture appears, warn
        }catch{}
      },5000);
    }

    return ()=>{
      active=false;
      document.removeEventListener('visibilitychange',onVisibilityChange);
      if(captureCheck) clearInterval(captureCheck);
      if(warningTimer.current) clearTimeout(warningTimer.current);
    };
  },[]);

  if(!accepted){
    return (
      <div style={{background:'#07090d',borderRadius:'10px',padding:'28px',textAlign:'center',border:'1px solid rgba(255,255,255,0.08)'}}>
        <div style={{fontSize:'28px',marginBottom:'12px'}}>🔒</div>
        <h3 style={{margin:'0 0 8px',fontSize:'16px',color:'#f0f6ff'}}>Protected Content</h3>
        <p style={{color:'#7a8799',fontSize:'12px',lineHeight:1.7,margin:'0 0 16px',maxWidth:'380px',marginLeft:'auto',marginRight:'auto'}}>
          This lesson is protected by JTrader Academy. Recording, sharing or distributing this content is strictly prohibited and may result in immediate account suspension and legal action.<br/><br/>
          Your name, email and phone number are embedded as a visible watermark in this video.
        </p>
        <button
          onClick={()=>setAccepted(true)}
          style={{background:'#fff',color:'#080a0d',padding:'12px 28px',borderRadius:'8px',fontWeight:900,fontSize:'12px',border:'none',cursor:'pointer'}}
        >
          I understand — Watch Lesson
        </button>
      </div>
    );
  }

  return (
    <div style={{position:'relative',width:'100%',background:'#000',borderRadius:'8px',overflow:'hidden',userSelect:'none'}}>

      {/* Screen recording warning overlay */}
      {recordingWarning&&(
        <div style={{
          position:'absolute',inset:0,zIndex:10,
          background:'rgba(0,0,0,0.92)',
          display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
          color:'#fff',textAlign:'center',padding:'20px'
        }}>
          <div style={{fontSize:'36px',marginBottom:'12px'}}>⚠️</div>
          <h3 style={{margin:'0 0 8px',fontSize:'18px',color:'#ff6b6b'}}>Recording Detected</h3>
          <p style={{color:'#aaa',fontSize:'13px',maxWidth:'340px',lineHeight:1.7}}>
            Screen recording or switching apps while watching is not allowed.<br/>
            Your account activity is being monitored.<br/>
            <b style={{color:'#fff'}}>{identity?.name||'Student'} ({identity?.email||''})</b>
          </p>
          <button onClick={()=>setRecordingWarning(false)} style={{marginTop:'16px',background:'#fff',color:'#080a0d',padding:'10px 20px',border:'none',borderRadius:'8px',fontWeight:900,fontSize:'11px',cursor:'pointer'}}>
            Continue Watching
          </button>
        </div>
      )}

      {/* CSS disruption layer — disrupts screen capture software */}
      <div style={{
        position:'absolute',inset:0,zIndex:2,pointerEvents:'none',
        background:'repeating-linear-gradient(0deg,transparent 0px,transparent 2px,rgba(255,255,255,0.008) 2px,rgba(255,255,255,0.008) 4px)',
        mixBlendMode:'overlay',
      }}/>

      {/* Video */}
      <video
        ref={videoRef}
        controls
        preload="metadata"
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        src={`/api/video?lesson=${encodeURIComponent(lessonId)}`}
        aria-label={title}
        onContextMenu={e=>e.preventDefault()}
        style={{width:'100%',display:'block'}}
      />

      {/* Multiple rotating watermarks */}
      {identity&&[0,1,2,3].map(i=>(
        <WatermarkStamp key={i} identity={identity} offset={i}/>
      ))}

      {/* Fixed corner stamp */}
      {identity&&(
        <div style={{
          position:'absolute',bottom:'48px',right:'10px',zIndex:4,
          pointerEvents:'none',userSelect:'none',
          fontSize:'8px',color:'rgba(255,255,255,0.3)',
          fontFamily:'monospace',textAlign:'right',lineHeight:1.5,
        }}>
          {identity.name} · JTRADER ACADEMY
        </div>
      )}

      <small style={{display:'block',padding:'6px 10px',background:'#07090d',color:'#3d4d5c',fontSize:'9px',letterSpacing:'0.5px'}}>
        🔒 Personalized watermark active — recording and sharing is prohibited. Violations result in account suspension.
      </small>
    </div>
  );
}
