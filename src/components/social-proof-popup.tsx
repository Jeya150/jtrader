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

const COURSES=['Option Trading Course','Basic of Share Market'];

const TIMES=[
  'just now','10 min ago','25 min ago','1 hr ago','2 hrs ago','4 hrs ago',
  '6 hrs ago','9 hrs ago','12 hrs ago','a day ago','2 days ago','3 days ago',
  '4 days ago','5 days ago','a week ago',
];

function rand<T>(arr:T[]):T{return arr[Math.floor(Math.random()*arr.length)];}

function makeEntry(){
  return {
    name:rand(NAMES),
    city:rand(DISTRICTS),
    course:rand(COURSES),
    time:rand(TIMES),
  };
}

// Pre-generate a shuffled list so the same session doesn't repeat immediately
function makeList(n=30){
  const list=[];
  for(let i=0;i<n;i++) list.push(makeEntry());
  return list;
}

type Entry=ReturnType<typeof makeEntry>;

export default function SocialProofPopup(){
  const listRef=useRef<Entry[]>(makeList());
  const [current,setCurrent]=useState<Entry|null>(null);
  const [visible,setVisible]=useState(false);
  const idxRef=useRef(0);

  useEffect(()=>{
    const SHOW=4500;   // ms the popup stays visible
    const GAP=5500;    // ms between popups
    const FIRST=3500;  // delay before first popup

    let t:ReturnType<typeof setTimeout>;

    function next(){
      const entry=listRef.current[idxRef.current%listRef.current.length];
      idxRef.current++;
      setCurrent(entry);
      setVisible(true);
      t=setTimeout(()=>{
        setVisible(false);
        t=setTimeout(next,GAP);
      },SHOW);
    }

    t=setTimeout(next,FIRST);
    return ()=>clearTimeout(t);
  },[]);

  if(!current) return null;

  return (
    <div style={{
      position:'fixed',
      bottom:'24px',
      left:'18px',
      zIndex:9000,
      maxWidth:'300px',
      width:'calc(100vw - 36px)',
      background:'rgba(8,14,26,0.96)',
      backdropFilter:'blur(18px)',
      border:'1px solid rgba(255,255,255,0.09)',
      borderRadius:'14px',
      padding:'13px 15px',
      display:'flex',
      gap:'12px',
      alignItems:'center',
      boxShadow:'0 8px 40px rgba(0,0,0,0.55)',
      opacity:visible?1:0,
      transform:visible?'translateY(0)':'translateY(14px)',
      transition:'opacity 0.4s ease, transform 0.4s ease',
      pointerEvents:'none',
    }}>
      {/* Avatar */}
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
        <div style={{
          fontSize:'11px',color:'#c2d6ec',fontWeight:600,marginBottom:'4px',
          whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',
        }}>
          {current.course}
        </div>
        <div style={{fontSize:'9.5px',color:'#526a84',display:'flex',alignItems:'center',gap:'5px'}}>
          <span style={{
            display:'inline-block',width:'6px',height:'6px',borderRadius:'50%',
            background:'#55e0d0',flexShrink:0,
          }}/>
          {current.time}
        </div>
      </div>
    </div>
  );
}
