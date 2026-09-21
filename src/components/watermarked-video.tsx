import {useEffect,useRef,useState} from 'react';

type Props={lessonId:string;title:string};
type Identity={name?:string;email?:string;contact_number?:string};

const ALL_POSITIONS=[
  {top:'8%',left:'6%'},{top:'8%',left:'55%'},
  {top:'30%',left:'4%'},{top:'30%',left:'58%'},
  {top:'55%',left:'6%'},{top:'55%',left:'52%'},
  {top:'78%',left:'5%'},{top:'78%',left:'57%'},
];

function WatermarkStamp({identity}:{identity:Identity}){
  const [posIdx,setPosIdx]=useState(0);
  useEffect(()=>{
    const t=window.setInterval(()=>{
      setPosIdx(i=>(i+1)%ALL_POSITIONS.length);
    },3000);
    return ()=>window.clearInterval(t);
  },[]);
  const pos=ALL_POSITIONS[posIdx];
  return (
    <div style={{
      position:'absolute',
      top:pos.top,left:pos.left,
      pointerEvents:'none',userSelect:'none',
      background:'rgba(0,0,0,0.3)',
      backdropFilter:'blur(2px)',
      border:'1px solid rgba(255,255,255,0.1)',
      borderRadius:'4px',
      padding:'3px 6px',
      fontSize:'7px',
      lineHeight:1.4,
      color:'rgba(255,255,255,0.55)',
      fontFamily:'monospace',
      transition:'top 1.2s ease, left 1.2s ease',
      zIndex:3,
      maxWidth:'120px',
      wordBreak:'break-all',
    }}>
      <div style={{fontWeight:700,color:'rgba(255,255,255,0.7)'}}>{identity.name||'Student'}</div>
      <div>{identity.email||''}</div>
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
