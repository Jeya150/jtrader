import {useEffect,useRef,useState} from 'react';

type Props={lessonId:string;title:string};
type Identity={name?:string;email?:string;contact_number?:string};

function WatermarkStamp({identity}:{identity:Identity}){
  const [pos,setPos]=useState({top:50,left:50});
  const startRef=useRef(performance.now());
  // Random phase so every viewer's watermark drifts on a different path,
  // not a shared, predictable loop.
  const phaseRef=useRef({x:Math.random()*Math.PI*2,y:Math.random()*Math.PI*2});

  useEffect(()=>{
    let frame:number;
    const tick=(now:number)=>{
      const t=(now-startRef.current)/1000;
      // Two sine waves on different periods trace a continuously moving
      // Lissajous-style path — always in motion, never resting at a fixed
      // point, so it can't look like it "disappears and reappears".
      const left=50+34*Math.sin(t/11+phaseRef.current.x);
      const top=50+30*Math.cos(t/13+phaseRef.current.y);
      setPos({top,left});
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(frame);
  },[]);

  return (
    <div style={{
      position:'absolute',
      top:`${pos.top}%`,left:`${pos.left}%`,
      pointerEvents:'none',userSelect:'none',
      background:'rgba(0,0,0,0.32)',
      backdropFilter:'blur(2px)',
      border:'1px solid rgba(255,255,255,0.1)',
      borderRadius:'5px',
      padding:'5px 9px',
      fontSize:'10px',
      lineHeight:1.5,
      color:'rgba(255,255,255,0.6)',
      fontFamily:'monospace',
      zIndex:3,
      maxWidth:'190px',
      wordBreak:'break-all',
      willChange:'top,left',
    }}>
      <div style={{fontWeight:700,color:'rgba(255,255,255,0.75)'}}>{identity.name||'Student'}</div>
      <div>{identity.email||''}</div>
      {identity.contact_number&&<div>{identity.contact_number}</div>}
    </div>
  );
}

export default function WatermarkedVideo({lessonId,title}:Props){
  const containerRef=useRef<HTMLDivElement>(null);
  const videoRef=useRef<HTMLVideoElement>(null);
  const [identity,setIdentity]=useState<Identity|null>(null);
  const [isFullscreen,setIsFullscreen]=useState(false);

  useEffect(()=>{
    let active=true;
    fetch('/api/auth').then(r=>r.json()).then((d:any)=>{
      if(active && d?.user?.role==='student') setIdentity(d.user);
    }).catch(()=>{});

    const vid=videoRef.current;
    if(vid){
      (vid as any).disablePictureInPicture=true;
      vid.addEventListener('enterpictureinpicture',e=>e.preventDefault());
    }

    /*
     * The browser's built-in fullscreen button fullscreens the <video>
     * element itself. The watermark divs are siblings of <video>, not
     * descendants, so they simply aren't part of that fullscreen element
     * and vanish. If the video ever ends up fullscreened directly, swap it
     * for fullscreening the wrapping container instead, which holds both
     * the video and the watermark.
     */
    function onFullscreenChange(){
      const el=document.fullscreenElement;
      setIsFullscreen(!!el && el===containerRef.current);
      if(el && el===videoRef.current){
        document.exitFullscreen().then(()=>containerRef.current?.requestFullscreen()).catch(()=>{});
      }
    }
    document.addEventListener('fullscreenchange',onFullscreenChange);

    return ()=>{
      active=false;
      document.removeEventListener('fullscreenchange',onFullscreenChange);
    };
  },[]);

  function toggleFullscreen(){
    if(document.fullscreenElement) document.exitFullscreen().catch(()=>{});
    else containerRef.current?.requestFullscreen().catch(()=>{});
  }

  return (
    <div ref={containerRef} style={{position:'relative',width:'100%',background:'#000',borderRadius:'8px',overflow:'hidden',userSelect:'none'}}>
      <video
        ref={videoRef}
        controls
        preload="metadata"
        controlsList="nodownload noremoteplayback nofullscreen"
        disablePictureInPicture
        src={`/api/video?lesson=${encodeURIComponent(lessonId)}`}
        aria-label={title}
        onContextMenu={e=>e.preventDefault()}
        style={isFullscreen?{width:'100%',height:'100%',display:'block',objectFit:'contain'}:{width:'100%',display:'block'}}
      />

      {identity&&<WatermarkStamp identity={identity}/>}

      <button
        onClick={toggleFullscreen}
        aria-label={isFullscreen?'Exit fullscreen':'Enter fullscreen'}
        style={{
          position:'absolute',bottom:'44px',right:'10px',zIndex:4,
          background:'rgba(0,0,0,0.5)',border:'1px solid rgba(255,255,255,0.15)',
          borderRadius:'6px',color:'#fff',fontSize:'13px',
          width:'28px',height:'28px',display:'grid',placeItems:'center',
          cursor:'pointer',
        }}
      >{isFullscreen?'⤡':'⛶'}</button>
    </div>
  );
}
