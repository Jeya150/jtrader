import {useEffect,useState} from 'react';

type Entry={name:string;city:string;course:string;starts_at:string};

function timeAgo(iso:string):string{
  const ms=Date.now()-new Date(iso.replace(' ','T')+'Z').getTime();
  const m=Math.floor(ms/60000);
  if(m<60) return m<=1?'just now':`${m} min ago`;
  const h=Math.floor(m/60);
  if(h<24) return h===1?'1 hr ago':`${h} hrs ago`;
  const d=Math.floor(h/24);
  if(d===1) return 'a day ago';
  if(d<7) return `${d} days ago`;
  const w=Math.floor(d/7);
  return w===1?'a week ago':`${w} weeks ago`;
}

const COURSE_SHORT:Record<string,string>={
  'basic-share-market':'Basic Share Market',
  'option-trading':'Option Trading Course',
};

export default function SocialProofPopup(){
  const [items,setItems]=useState<Entry[]>([]);
  const [current,setCurrent]=useState<Entry|null>(null);
  const [visible,setVisible]=useState(false);
  const [idx,setIdx]=useState(0);

  useEffect(()=>{
    fetch('/api/social-proof').then(r=>r.json()).then((d:any)=>{
      if(Array.isArray(d?.items)&&d.items.length>0){
        // Shuffle so order feels random on each visit
        const shuffled=[...d.items].sort(()=>Math.random()-.5);
        setItems(shuffled);
      }
    }).catch(()=>{});
  },[]);

  useEffect(()=>{
    if(items.length===0) return;
    // First popup after 4s, then every 9s (4s visible + 5s gap)
    const firstDelay=4000;
    const SHOW=4500;
    const GAP=5000;

    let t:ReturnType<typeof setTimeout>;

    function show(i:number){
      setCurrent(items[i%items.length]);
      setVisible(true);
      t=setTimeout(()=>{
        setVisible(false);
        t=setTimeout(()=>{
          setIdx(prev=>{const next=(prev+1)%items.length;return next;});
        },GAP);
      },SHOW);
    }

    t=setTimeout(()=>show(idx),firstDelay);
    return ()=>clearTimeout(t);
  },[items]);

  // Trigger next popup when idx changes (after the first)
  useEffect(()=>{
    if(items.length===0||idx===0) return;
    let t:ReturnType<typeof setTimeout>;
    const SHOW=4500;
    const GAP=5000;

    function show(){
      setCurrent(items[idx%items.length]);
      setVisible(true);
      t=setTimeout(()=>{
        setVisible(false);
        t=setTimeout(()=>setIdx(prev=>(prev+1)%items.length),GAP);
      },SHOW);
    }
    show();
    return ()=>clearTimeout(t);
  },[idx,items]);

  if(!current) return null;

  return (
    <div style={{
      position:'fixed',
      bottom:'24px',
      left:'18px',
      zIndex:9000,
      maxWidth:'300px',
      width:'calc(100vw - 36px)',
      background:'rgba(10,16,28,0.95)',
      backdropFilter:'blur(16px)',
      border:'1px solid rgba(255,255,255,0.1)',
      borderRadius:'14px',
      padding:'13px 15px',
      display:'flex',
      gap:'12px',
      alignItems:'center',
      boxShadow:'0 8px 40px rgba(0,0,0,0.5)',
      opacity:visible?1:0,
      transform:visible?'translateY(0)':'translateY(16px)',
      transition:'opacity 0.45s ease, transform 0.45s ease',
      pointerEvents:visible?'auto':'none',
    }}>
      {/* Avatar circle */}
      <div style={{
        width:'40px',height:'40px',borderRadius:'50%',flexShrink:0,
        background:'linear-gradient(135deg,#1d467c,#0f2a4a)',
        color:'#9dc8ff',display:'grid',placeItems:'center',
        fontWeight:900,fontSize:'14px',border:'1px solid rgba(80,140,255,0.25)',
      }}>
        {current.name.slice(0,1).toUpperCase()}
      </div>
      <div style={{minWidth:0}}>
        <div style={{fontSize:'12px',fontWeight:700,color:'#edf2f7',lineHeight:1.3,marginBottom:'3px'}}>
          <span style={{color:'#7bbfff'}}>{current.name}</span>
          {' '}from{' '}
          <span style={{color:'#7bbfff'}}>{current.city}</span>
          {' '}enrolled in
        </div>
        <div style={{fontSize:'11px',color:'#c8d8ea',fontWeight:600,marginBottom:'3px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
          {COURSE_SHORT[current.course]||current.course}
        </div>
        <div style={{fontSize:'10px',color:'#5f7a95',display:'flex',alignItems:'center',gap:'5px'}}>
          <span style={{
            display:'inline-block',width:'6px',height:'6px',borderRadius:'50%',
            background:'#55e0d0',flexShrink:0,
          }}/>
          {timeAgo(current.starts_at)}
        </div>
      </div>
    </div>
  );
}
