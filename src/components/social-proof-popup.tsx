import {useEffect,useState,useRef} from 'react';

const NAMES=[
  'Arjun','Karthik','Vijay','Murugan','Selvam','Rajan','Prakash','Suresh',
  'Dinesh','Arun','Chandru','Deepak','Ganesh','Hari','Kannan','Manoj',
  'Naveen','Palani','Rajesh','Santhosh','Udhay','Venkat','Yogesh','Balan',
  'Ilango','Jayakumar','Lakshman','Tamil','Anitha','Bharathi','Chithra',
  'Divya','Gayathri','Hema','Kavitha','Lakshmi','Meena','Nithya','Priya',
  'Sangeetha','Rekha','Deepa','Saranya','Tamilselvi','Vimala','Yamuna',
  'Oviya','Padma','Radha','Indira','Eswari',
];

const DISTRICTS=[
  'Chennai','Coimbatore','Madurai','Tiruchirappalli','Salem','Tirunelveli',
  'Vellore','Erode','Thoothukudi','Tiruppur','Dindigul','Thanjavur',
  'Kancheepuram','Cuddalore','Nagercoil','Krishnagiri','Dharmapuri',
  'Namakkal','Karur','Pudukkottai','Ramanathapuram','Viluppuram',
  'Tiruvannamalai','Chengalpattu','Ranipet','Sivaganga','Virudhunagar',
  'Nagapattinam','Mayiladuthurai','Tenkasi','Perambalur','Ariyalur',
];

const COURSE_LABELS:Record<string,string>={
  'basic-share-market':'Basic of Share Market',
  'option-trading':'Option Trading Course',
};

const TIMES=[
  '10 min ago','25 min ago','45 min ago','1 hr ago','2 hrs ago','4 hrs ago',
  '6 hrs ago','9 hrs ago','12 hrs ago','a day ago','2 days ago','3 days ago',
  '4 days ago','5 days ago','a week ago',
];

function rand<T>(arr:T[]):T{return arr[Math.floor(Math.random()*arr.length)];}

type Entry={name:string;city:string;course:string;time:string};

// Pick an entry whose name+city combo hasn't appeared in the last `window` calls
function pickNext(recent:string[], courseFilter:string):Entry{
  const courses=courseFilter==='both'
    ?['basic-share-market','option-trading']
    :[courseFilter];
  let attempts=0;
  while(attempts<100){
    const name=rand(NAMES);
    const city=rand(DISTRICTS);
    const key=name+city;
    if(!recent.includes(key)){
      return {name,city,course:rand(courses),time:rand(TIMES)};
    }
    attempts++;
  }
  // fallback — pick freely if somehow stuck
  return {name:rand(NAMES),city:rand(DISTRICTS),course:rand(courses),time:rand(TIMES)};
}

const NO_REPEAT_WINDOW=15;

export default function SocialProofPopup(){
  const [enabled,setEnabled]=useState(true);
  const [course,setCourse]=useState('basic-share-market');
  const [settingsLoaded,setSettingsLoaded]=useState(false);
  const [current,setCurrent]=useState<Entry|null>(null);
  const [visible,setVisible]=useState(false);
  const recentRef=useRef<string[]>([]);

  // Fetch settings from /api/offer
  useEffect(()=>{
    fetch('/api/offer').then(r=>r.json()).then((d:any)=>{
      setEnabled(d.socialProofEnabled!==false);
      setCourse(d.socialProofCourse||'basic-share-market');
      setSettingsLoaded(true);
    }).catch(()=>setSettingsLoaded(true));
  },[]);

  useEffect(()=>{
    if(!settingsLoaded||!enabled) return;

    const SHOW=4500;
    const GAP=5500;
    const FIRST=3500;
    let t:ReturnType<typeof setTimeout>;

    function next(){
      const entry=pickNext(recentRef.current,course);
      const key=entry.name+entry.city;
      recentRef.current=[...recentRef.current.slice(-(NO_REPEAT_WINDOW-1)),key];
      setCurrent(entry);
      setVisible(true);
      t=setTimeout(()=>{
        setVisible(false);
        t=setTimeout(next,GAP);
      },SHOW);
    }

    t=setTimeout(next,FIRST);
    return ()=>clearTimeout(t);
  },[settingsLoaded,enabled,course]);

  if(!enabled||!current) return null;

  return (
    <div style={{
      position:'fixed',
      top:'88px',
      left:'50%',
      zIndex:9000,
      maxWidth:'360px',
      width:'calc(100vw - 36px)',
      background:'rgba(8,14,26,0.96)',
      backdropFilter:'blur(20px)',
      border:'1px solid rgba(212,175,55,0.25)',
      borderRadius:'14px',
      padding:'13px 16px',
      display:'flex',
      gap:'12px',
      alignItems:'center',
      boxShadow:'0 8px 40px rgba(0,0,0,0.6),0 0 0 1px rgba(212,175,55,0.1)',
      opacity:visible?1:0,
      transform:visible?'translateX(-50%) translateY(0)':'translateX(-50%) translateY(-12px)',
      transition:'opacity 0.4s ease, transform 0.4s ease',
      pointerEvents:'none',
    }}>
      <div style={{
        width:'40px',height:'40px',borderRadius:'50%',flexShrink:0,
        background:'linear-gradient(135deg,#1a3f74,#0e2546)',
        color:'#8ec5ff',display:'grid',placeItems:'center',
        fontWeight:900,fontSize:'15px',
        border:'1px solid rgba(80,150,255,0.2)',
      }}>
        {current.name[0]}
      </div>
      <div style={{minWidth:0}}>
        <div style={{fontSize:'12px',fontWeight:700,color:'#dde8f4',lineHeight:1.35,marginBottom:'3px'}}>
          <span style={{color:'#7bbfff'}}>{current.name}</span>
          {' from '}
          <span style={{color:'#7bbfff'}}>{current.city}</span>
          {' enrolled in'}
        </div>
        <div style={{fontSize:'11px',color:'#c2d6ec',fontWeight:600,marginBottom:'4px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
          {COURSE_LABELS[current.course]||current.course}
        </div>
        <div style={{fontSize:'9.5px',color:'#526a84',display:'flex',alignItems:'center',gap:'5px'}}>
          <span style={{display:'inline-block',width:'6px',height:'6px',borderRadius:'50%',background:'#55e0d0',flexShrink:0}}/>
          {current.time}
        </div>
      </div>
    </div>
  );
}
