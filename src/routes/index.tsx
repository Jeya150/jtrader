import {createFileRoute} from '@tanstack/react-router';import {useEffect,useState} from 'react';import Admin from '../components/admin-dashboard';import OfferCycleBanner from '../components/offer-cycle-banner';import WatermarkedVideo from '../components/watermarked-video';import SocialProofPopup from '../components/social-proof-popup';import '../admin-public.css';import '../course-security.css';
export const Route=createFileRoute('/')({component:Home});
const api=(p:string,o?:RequestInit)=>fetch(p,o).then(async r=>{const x=await r.json().catch(()=>({}));if(!r.ok)throw Error(x.error||'Request failed');return x});

function Home(){
  const [me,setMe]=useState<any>();
  const [tab,setTab]=useState("auth");
  const [authChecked,setAuthChecked]=useState(false);
  const [auth,setAuth]=useState<"login"|"register">("login");
  const [admin,setAdmin]=useState(false);
  const [adminIn,setAdminIn]=useState(false);
  const [f,setF]=useState({name:"",email:"",password:"",city:"",contactNumber:""});
  const [courseList,setCourseList]=useState<any[]>([]);
  const [lessons,setLessons]=useState<any[]>([]);
  const [basicLessons,setBasicLessons]=useState<any[]>([]);
  const [broadcast,setBroadcast]=useState<string>('');
  const [completedBasic,setCompletedBasic]=useState<Set<string>>(new Set());
  const [completedOption,setCompletedOption]=useState<Set<string>>(new Set());
  const [basicPurchased,setBasicPurchased]=useState(false);
  const [optionPurchased,setOptionPurchased]=useState(false);
  const [coursePurchased,setCoursePurchased]=useState(false);
  const [posts,setPosts]=useState<any[]>([]);
  const [note,setNote]=useState("");
  const [chartFile,setChartFile]=useState<File|null>(null);
  const [adminNote,setAdminNote]=useState("");
  const [adminChartFile,setAdminChartFile]=useState<File|null>(null);
  const [communityTab,setCommunityTab]=useState<'admin'|'student'>('admin');
  const [lastSeenAdmin,setLastSeenAdmin]=useState(()=>Number(typeof window!=='undefined'?localStorage.getItem('lsAdmin')||0:0));
  const [lastSeenStudent,setLastSeenStudent]=useState(()=>Number(typeof window!=='undefined'?localStorage.getItem('lsStudent')||0:0));
  const [loginError,setLoginError]=useState("");
  const [toast,setToast]=useState<{msg:string;type:'success'|'error'}|null>(null);
  function showToast(msg:string,type:'success'|'error'='success'){
    setToast({msg,type});
    setTimeout(()=>setToast(null),4000);
  }
  const [showPassword,setShowPassword]=useState(false);
  const [forgotPw,setForgotPw]=useState(false);
  const [fpStep,setFpStep]=useState<'email'|'otp'>('email');
  const [fpEmail,setFpEmail]=useState('');
  const [fpOtp,setFpOtp]=useState('');
  const [fpNewPw,setFpNewPw]=useState('');
  const [fpMsg,setFpMsg]=useState('');
  const [fpError,setFpError]=useState('');
  const [selectedLesson,setSelectedLesson]=useState<any>(null);
  const [viewCourse,setViewCourse]=useState<'basic-share-market'|'option-trading'>('option-trading');
  const [dashCourseTab,setDashCourseTab]=useState<'basic-share-market'|'option-trading'>('basic-share-market');

  useEffect(()=>{
    api("/api/auth").then(x=>{
      setMe(x);
      if(x?.broadcast) setBroadcast(x.broadcast);
      if(x?.user) setTab("dashboard");
      else setTab("home");
      setAuthChecked(true);
    }).catch(()=>{setAuthChecked(true);});
    api("/api/courses").then(x=>{
      if(Array.isArray(x?.courses)) setCourseList(x.courses);
    }).catch(()=>{});
  },[]);

  useEffect(()=>{
    if(me?.user){
      const bOk=!!me.courses?.basic;
      const oOk=!!me.courses?.option;
      setBasicPurchased(bOk);
      setOptionPurchased(oOk);
      setCoursePurchased(oOk);
      if(oOk){
        api("/api/data?type=lessons&courseId=option-trading")
          .then(x=>setLessons(Array.isArray(x.lessons)?x.lessons:[]))
          .catch(()=>setLessons([]));
        api("/api/data?type=progress&courseId=option-trading")
          .then(x=>setCompletedOption(new Set(Array.isArray(x.completed)?x.completed:[])))
          .catch(()=>{});
      }
      if(bOk){
        api("/api/data?type=lessons&courseId=basic-share-market")
          .then(x=>setBasicLessons(Array.isArray(x.lessons)?x.lessons:[]))
          .catch(()=>setBasicLessons([]));
        api("/api/data?type=progress&courseId=basic-share-market")
          .then(x=>setCompletedBasic(new Set(Array.isArray(x.completed)?x.completed:[])))
          .catch(()=>{});
      }
    }
    if(me?.user && tab==="community"){
      api("/api/data?type=community")
        .then(x=>setPosts(Array.isArray(x.posts)?x.posts:[]))
        .catch(()=>setPosts([]));
    }
  },[me,tab]);

  async function submit(e:any){
    e.preventDefault();
    setLoginError("");

    if(auth==="register"){
      if(!f.city){
        setLoginError("Please select your city");
        return;
      }
      if(!f.contactNumber.trim()){
        setLoginError("Please enter your phone number");
        return;
      }
    }

    try{
      const result=await api("/api/auth?action="+auth,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(f)
      });

      if(!result?.ok){
        throw Error(result?.error||"Login failed");
      }

      const fresh=await api("/api/auth");

      if(!fresh?.user){
        throw Error("Login successful but session not found");
      }

      setMe(fresh);
      setLoginError("");
      setTab("dashboard");

    }catch(x:any){
      setLoginError(x?.message||"Login failed");
    }
  }

  async function logout(){
    try{
      await api("/api/auth?action=logout",{method:"POST"});
    }finally{
      location.reload();
    }
  }

  async function startPayment(courseId:string){
    if(!me?.user){
      setTab("auth");
      return;
    }

    try{
      const r=await api("/api/payment?action=create-order",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({courseId})
      });

      if(!r?.ok){
        throw Error(r?.error||"Payment failed");
      }

      if(!(window as any).Razorpay){
        const script=document.createElement("script");
        script.src="https://checkout.razorpay.com/v1/checkout.js";

        await new Promise((resolve,reject)=>{
          script.onload=resolve;
          script.onerror=reject;
          document.body.appendChild(script);
        });
      }

      const RP=(window as any).Razorpay;

      const razorpay=new RP({
        key:r.keyId,
        amount:r.amountPaise,
        currency:r.currency,
        name:"JTrader Academy",
        description:r.courseTitle,
        order_id:r.orderId,
        prefill:{
          name:me?.user?.name||"",
          email:me?.user?.email||"",
          contact:me?.user?.contact_number||""
        },
        theme:{color:"#111111"},
        config:{
          display:{
            blocks:{
              utib:{
                name:"Pay via UPI",
                instruments:[
                  {method:"upi",flows:["collect"],apps:[]},
                  {method:"card"},
                  {method:"netbanking"}
                ]
              }
            },
            sequence:["block.utib"],
            preferences:{show_default_blocks:true}
          }
        },
        handler:async function(response:any){
          try{
            await api("/api/payment?action=verify-payment",{
              method:"POST",
              headers:{"Content-Type":"application/json"},
              body:JSON.stringify({
                razorpay_order_id:response.razorpay_order_id,
                razorpay_payment_id:response.razorpay_payment_id,
                razorpay_signature:response.razorpay_signature,
                courseId:r.courseId
              })
            });
            showToast("🎉 Payment successful! Your course is now unlocked.");
            setTimeout(()=>location.reload(),2000);
          }catch(err:any){
            showToast("Payment verification failed: "+(err?.message||"Please contact support"),"error");
          }
        }
      });

      razorpay.open();

    }catch(e:any){
      showToast(e?.message||"Payment failed","error");
    }
  }
  function getCourse(id:'basic-share-market'|'option-trading'){
    const row=courseList.find(c=>c.id===id);
    const defaults:{[k:string]:{title:string;subtitle:string;tag:string;features:string[]}}={
      'basic-share-market':{title:'Basic of Share Market',subtitle:'Start your trading journey with strong fundamentals.',tag:'BEGINNER',features:['Share market fundamentals','Key concepts and terminology','How to read stock prices','Lifetime access']},
      'option-trading':{title:'Option Trading Course',subtitle:'Complete structured learning path.',tag:'MOST POPULAR',features:['Options strategies','Practical examples','Risk management','Lifetime access']}
    };
    const d=defaults[id];
    const price=Number(row?.price??(id==='basic-share-market'?1500:9999));
    const oldPrice=row?.old_price?Number(row.old_price):undefined;
    const status=row?.status||'active';
    // Hide from unpurchased students when absent (hidden) OR coming_soon
    const hidden=courseList.length>0&&(!row||row.status==='coming_soon');
    return {id,title:row?.title||d.title,subtitle:row?.description||d.subtitle,tag:d.tag,features:d.features,price,oldPrice,priceStr:`Rs.${price.toLocaleString('en-IN')}`,status,hidden};
  }
  const COURSES={
    'basic-share-market':getCourse('basic-share-market'),
    'option-trading':getCourse('option-trading')
  };

  async function sendOtp(){
    setFpError('');setFpMsg('');
    try{
      await api("/api/auth?action=forgot-password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:fpEmail})});
      setFpStep('otp');setFpMsg('OTP sent to your email. Check your inbox.');
    }catch(e:any){setFpError(e?.message||'Failed to send OTP');}
  }
  async function resetPw(){
    setFpError('');
    try{
      await api("/api/auth?action=reset-password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:fpEmail,otp:fpOtp,newPassword:fpNewPw})});
      setFpMsg('Password reset! You can now login.');
      setTimeout(()=>{setForgotPw(false);setFpStep('email');setFpEmail('');setFpOtp('');setFpNewPw('');setFpMsg('');},2000);
    }catch(e:any){setFpError(e?.message||'Invalid OTP');}
  }

  async function toggleComplete(lessonId:string,courseId:string,isBasic:boolean){
    try{
      const r=await fetch("/api/data",{
        method:"PATCH",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({lessonId,courseId})
      });
      const d=await r.json() as any;
      if(d.ok){
        if(isBasic){
          setCompletedBasic(prev=>{
            const next=new Set(prev);
            d.completed?next.add(lessonId):next.delete(lessonId);
            return next;
          });
        }else{
          setCompletedOption(prev=>{
            const next=new Set(prev);
            d.completed?next.add(lessonId):next.delete(lessonId);
            return next;
          });
        }
      }
    }catch(e){}
  }

  async function postNote(section:'student'|'admin',text:string,file:File|null){
    if(!text.trim() && !file) return;
    try{
      const form=new FormData();
      form.append('body',text.trim());
      form.append('section',section);
      if(file) form.append('image',file);
      await fetch("/api/data",{method:"POST",body:form}).then(async r=>{
        const x=await r.json().catch(()=>({}));
        if(!r.ok) throw Error((x as any).error||'Failed to post');
      });
      if(section==='student'){setNote("");setChartFile(null);}
      else{setAdminNote("");setAdminChartFile(null);}
      const x=await api("/api/data?type=community");
      setPosts(Array.isArray(x.posts)?x.posts:[]);
    }catch(e:any){
      alert(e?.message||"Failed to post");
    }
  }

  function getDuration(l:any){
    const d=l?.duration ?? l?.video_duration ?? l?.duration_seconds;

    if(d===undefined || d===null || d==="") return "Video";

    const n=Number(d);

    if(!Number.isNaN(n)){
      const m=Math.floor(n/60);
      const s=Math.floor(n%60);
      return m+":"+String(s).padStart(2,"0");
    }

    return String(d);
  }

  function getProgress(){
    const u=me?.user||{};

    const values=[
      u.progress,
      u.course_progress,
      u.progress_percent,
      u.progressPercentage
    ];

    for(const value of values){
      const n=Number(value);
      if(!Number.isNaN(n)){
        return Math.min(100,Math.max(0,n));
      }
    }

    return 0;
  }

  const progress=getProgress();
  const completed=lessons.length
    ? Math.round(lessons.length*progress/100)
    : 0;

  if(!authChecked){
    return (
      <div style={{minHeight:"100vh",background:"#07090d",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"16px"}}>
        <img src="/assets/jtrader-logo.png" alt="JTrader" style={{width:"56px",height:"56px",objectFit:"contain",opacity:.8}}/>
        <div style={{width:"32px",height:"32px",border:"3px solid #1a2635",borderTop:"3px solid #4d8fff",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if(admin){
    return <Admin in={adminIn} close={()=>setAdmin(false)}/>;
  }

  if(tab==="dashboard" && me?.user){
    const name=me.user.name || "Student";

    return (
      <div className="jt">
        <style>{css+heroCss+videoCss+glassCss+toastCss+responsiveCss}</style>
        {toast&&<div className={`jtToast ${toast.type}`}>{toast.msg}</div>}
        {broadcast&&<div style={{background:'linear-gradient(135deg,rgba(30,70,160,.3),rgba(10,50,25,.3))',borderBottom:'1px solid rgba(80,130,255,.2)',padding:'10px max(4%,calc((100% - 1160px)/2))',display:'flex',justifyContent:'space-between',alignItems:'center',gap:'12px',fontSize:'12px',color:'#c8d3de'}}><span>📢 {broadcast}</span><button onClick={()=>setBroadcast('')} style={{background:'none',border:'none',color:'#596778',cursor:'pointer',fontSize:'16px',lineHeight:1}}>×</button></div>}

        {selectedLesson && (
          <div className="videoModal" onClick={()=>setSelectedLesson(null)}>
            <div className="videoModalInner" onClick={e=>e.stopPropagation()}>
              <div className="videoModalHeader">
                <h3>{selectedLesson.title||"Lesson"}</h3>
                <button className="videoModalClose" onClick={()=>setSelectedLesson(null)}>✕</button>
              </div>
              <div className="videoModalBody">
                <WatermarkedVideo lessonId={selectedLesson.id} title={selectedLesson.title||""}/>
              </div>
            </div>
          </div>
        )}

        <div className="bar">
          JTRADER ACADEMY <b>TRADING EDUCATION</b>
        </div>

        <nav className="topnav">
          <button
            className="brand"
            onClick={()=>setTab("dashboard")}
          >
            <img src="/assets/jtrader-logo.png" alt="JTrader"/>
            <span>JTRADER ACADEMY</span>
          </button>

          <div className="links">
            <button onClick={()=>setTab("dashboard")}>
              Dashboard
            </button>
            <button onClick={()=>setTab("course-options")}>
              Courses
            </button>
            <button onClick={()=>setTab("community")}>
              Community
            </button>
          </div>

          <div className="navRight">
            <button className="navBtn" onClick={logout}>
              Logout
            </button>
          </div>
        </nav>

        <main className="page">

          <section className="welcomeDashboard">
            <small>JTRADER ACADEMY</small>

            <h1>
              Welcome, {name}!
            </h1>

            <p>
              Welcome back. Continue your learning journey from your dashboard.
            </p>
          </section>

          <section className="stats">

            <div>
              <small>BASIC COURSE</small>
              <b>Basic of Share Market</b>
              <span style={{color:basicPurchased?"#55e0d0":"#f0b45d"}}>{basicPurchased?`${completedBasic.size}/${basicLessons.length} done`:"Not purchased"}</span>
              {basicPurchased&&me?.courses?.basic&&<small style={{color:"#94a3b8",fontSize:"9px",display:"block",marginTop:"3px"}}>Valid till {new Date(me.courses.basic).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</small>}
            </div>

            {(optionPurchased||!COURSES['option-trading'].hidden)&&<div>
              <small>OPTION COURSE</small>
              <b>Option Trading Course</b>
              <span style={{color:optionPurchased?"#55e0d0":"#f0b45d"}}>{optionPurchased?`${completedOption.size}/${lessons.length} done`:"Not purchased"}</span>
              {optionPurchased&&me?.courses?.option&&<small style={{color:"#94a3b8",fontSize:"9px",display:"block",marginTop:"3px"}}>Valid till {new Date(me.courses.option).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</small>}
            </div>}

            <div>
              <small>TOTAL VIDEOS</small>
              <b>{basicLessons.length+(optionPurchased?lessons.length:0)}</b>
              <span>{completedBasic.size+completedOption.size} completed</span>
            </div>

          </section>

          {(()=>{
            const basicVisible=basicPurchased||!COURSES['basic-share-market'].hidden;
            const optionVisible=optionPurchased||!COURSES['option-trading'].hidden;
            const activeTab=(dashCourseTab==='option-trading'&&optionVisible)?'option-trading':basicVisible?'basic-share-market':'option-trading';
            return(<>
              {basicVisible&&optionVisible&&(
                <div style={{display:"flex",gap:"8px",marginBottom:"16px"}}>
                  {basicVisible&&<button onClick={()=>setDashCourseTab('basic-share-market')} style={{padding:"9px 18px",borderRadius:"9px",border:activeTab==='basic-share-market'?"none":"1px solid rgba(255,255,255,0.1)",background:activeTab==='basic-share-market'?"#fff":"rgba(255,255,255,0.04)",color:activeTab==='basic-share-market'?"#080a0d":"#9aa6b4",fontWeight:900,fontSize:"11px",cursor:"pointer"}}>Basic Course</button>}
                  {optionVisible&&<button onClick={()=>setDashCourseTab('option-trading')} style={{padding:"9px 18px",borderRadius:"9px",border:activeTab==='option-trading'?"none":"1px solid rgba(255,255,255,0.1)",background:activeTab==='option-trading'?"#fff":"rgba(255,255,255,0.04)",color:activeTab==='option-trading'?"#080a0d":"#9aa6b4",fontWeight:900,fontSize:"11px",cursor:"pointer"}}>Option Trading</button>}
                </div>
              )}

              {activeTab==='basic-share-market'&&basicVisible&&(
                <section className="lessonList" style={{marginBottom:"14px"}}>
                  <header>
                    <div><small>BASIC OF SHARE MARKET</small><h2>Basic Course</h2></div>
                    <span style={{display:"flex",alignItems:"center",gap:"10px"}}>
                      <span>{basicLessons.length} Videos</span>
                      {!basicPurchased&&<button className="primary" style={{fontSize:"10px",padding:"8px 14px"}} onClick={()=>{setViewCourse('basic-share-market');setTab("course");}}>Buy – {COURSES['basic-share-market'].priceStr}</button>}
                    </span>
                  </header>
                  {!basicPurchased?(
                    <div className="locked"><h3>Not purchased</h3><p>Buy the Basic of Share Market course to unlock lessons.</p></div>
                  ):basicLessons.length===0?(
                    <div className="locked"><h3>No videos yet</h3><p>Videos will appear here once uploaded by the admin.</p></div>
                  ):(
                    basicLessons.map((lesson:any,index:number)=>{const done=completedBasic.has(lesson.id);return(
                      <div className="lesson" key={lesson.id||index}>
                        <button onClick={()=>toggleComplete(lesson.id,'basic-share-market',true)} style={{width:"32px",height:"32px",borderRadius:"50%",border:`2px solid ${done?"#55e0d0":"#27313d"}`,background:done?"#55e0d0":"transparent",color:done?"#020408":"#55e0d0",fontSize:"14px",flexShrink:0,transition:"all .2s",cursor:"pointer"}}>{done?"✓":""}</button>
                        <div style={{flex:1,cursor:"pointer"}} onClick={()=>setSelectedLesson(lesson)}>
                          <h3 style={{textDecoration:done?"line-through":"none",opacity:done?.6:1}}>{lesson.title||"Untitled Lesson"}</h3>
                          <p>{lesson.description||"Course lesson"}</p>
                          <small style={{color:"#5f8fff",fontSize:"10px",marginTop:"3px",display:"block"}}>▶ {getDuration(lesson)}</small>
                        </div>
                      </div>
                    );})
                  )}
                </section>
              )}

              {activeTab==='option-trading'&&optionVisible&&(
                <section className="lessonList">
                  <header>
                    <div><small>OPTION TRADING COURSE</small><h2>Option Trading</h2></div>
                    <span style={{display:"flex",alignItems:"center",gap:"10px"}}>
                      {optionPurchased&&<span>{lessons.length} Videos</span>}
                      {!optionPurchased&&<button className="primary" style={{fontSize:"10px",padding:"8px 14px"}} onClick={()=>{setViewCourse('option-trading');setTab("course");}}>Buy – {COURSES['option-trading'].priceStr}</button>}
                    </span>
                  </header>
                  {!optionPurchased?(
                    <div className="locked"><h3>Not purchased</h3><p>Buy the Option Trading Course to unlock lessons.</p></div>
                  ):lessons.length===0?(
                    <div className="locked"><h3>No videos yet</h3><p>Videos will appear here once uploaded by the admin.</p></div>
                  ):(
                    lessons.map((lesson:any,index:number)=>{const done=completedOption.has(lesson.id);return(
                      <div className="lesson" key={lesson.id||index}>
                        <button onClick={()=>toggleComplete(lesson.id,'option-trading',false)} style={{width:"32px",height:"32px",borderRadius:"50%",border:`2px solid ${done?"#55e0d0":"#27313d"}`,background:done?"#55e0d0":"transparent",color:done?"#020408":"#55e0d0",fontSize:"14px",flexShrink:0,transition:"all .2s",cursor:"pointer"}}>{done?"✓":""}</button>
                        <div style={{flex:1,cursor:"pointer"}} onClick={()=>setSelectedLesson(lesson)}>
                          <h3 style={{textDecoration:done?"line-through":"none",opacity:done?.6:1}}>{lesson.title||"Untitled Lesson"}</h3>
                          <p>{lesson.description||"Course lesson"}</p>
                          <small style={{color:"#5f8fff",fontSize:"10px",marginTop:"3px",display:"block"}}>▶ {getDuration(lesson)}</small>
                        </div>
                      </div>
                    );})
                  )}
                </section>
              )}
            </>);
          })()}

          <section className="cta">

            <div>
              <small>KEEP LEARNING</small>

              <h2>
                Build your trading knowledge.
              </h2>

              <p>
                Follow the lessons step by step and improve your market understanding.
              </p>
            </div>

            <button
              className="primary"
              onClick={()=>setTab("course-options")}
            >
              View Course
            </button>

          </section>

        </main>

        <footer>
          <b>JTRADER</b>
          <small>
            Trading education built around discipline, practical learning and real market examples.
          </small>
          <span>© 2026 JTrader Academy</span>
        </footer>

      </div>
    );
  }

  if(tab==="course-options"){
    return (
      <div className="jt">
        <style>{css+heroCss+animCss+glassCss+responsiveCss}</style>

        <div className="bar">
          JTRADER ACADEMY <b>TRADING EDUCATION</b>
        </div>

        <nav className="topnav">

          <button
            className="brand"
            onClick={()=>setTab(me?.user?"dashboard":"home")}
          >
            <img src="/assets/jtrader-logo.png" alt="JTrader"/>
            <span>JTRADER ACADEMY</span>
          </button>

          <div className="links">
            <button onClick={()=>setTab(me?.user?"dashboard":"home")}>
              {me?.user?"Dashboard":"Home"}
            </button>

            <button onClick={()=>setTab("course-options")}>
              Courses
            </button>
          </div>

          <div className="navRight">
            {me?.user ? (
              <button className="navBtn" onClick={logout}>Logout</button>
            ) : (
              <>
                <button className="navBtn" onClick={()=>{setAuth("login");setTab("auth");}}>Login</button>
                <button className="primary" style={{fontSize:"11px",padding:"10px 16px"}} onClick={()=>{setAuth("register");setTab("auth");}}>Register →</button>
              </>
            )}
          </div>

        </nav>

        <main className="page">

          <section className="pageHero">
            <small>COURSES</small>
            <h1>
              Choose your <em>learning path.</em>
            </h1>
            <p>
              Learn the market from basics to practical options trading.
            </p>
          </section>

          <OfferCycleBanner
            basicPrice={basicPurchased||COURSES['basic-share-market'].status==='coming_soon'?undefined:COURSES['basic-share-market'].price}
            optionPrice={optionPurchased||COURSES['option-trading'].status==='coming_soon'?undefined:COURSES['option-trading'].price}
            basicOldPrice={COURSES['basic-share-market'].oldPrice}
            optionOldPrice={COURSES['option-trading'].oldPrice}
          />

          <div className="courseCardsNew">

            {courseList.some(c=>c.id==='basic-share-market') && (()=>{const c=COURSES['basic-share-market'];return(
            <article className="courseNew basicCourse">
              <div className="courseVisual">
                <span>{c.status==='coming_soon'?'COMING SOON':'BEGINNER FRIENDLY'}</span>
                <div className="miniChart greenChart">↗</div>
              </div>
              <div className="courseBody">
                <h3>BASIC OF<br/>SHARE MARKET</h3>
                <p>Understand how the share market works, key concepts, how to read stock prices and analysis basics.</p>
                <div className="courseBottom">
                  {c.status==='coming_soon'
                    ? <b style={{color:'#f5c842',fontSize:"16px"}}>Coming Soon</b>
                    : basicPurchased
                      ? <button onClick={()=>{setDashCourseTab('basic-share-market');setTab("dashboard");}}>Start Learning →</button>
                      : <><b>{c.priceStr}</b><button onClick={()=>{setViewCourse('basic-share-market');setTab("course");}}>View Course →</button></>
                  }
                </div>
              </div>
            </article>
            );})()}

            {courseList.some(c=>c.id==='option-trading') && (()=>{const c=COURSES['option-trading'];return(
            <article className="courseNew optionCourse">
              <div className="courseVisual">
                <span>{c.status==='coming_soon'?'COMING SOON':'MOST POPULAR'}</span>
                <div className="miniChart redChart">⚡</div>
              </div>
              <div className="courseBody">
                <h3>OPTION<br/>TRADING COURSE</h3>
                <p>Learn options, strategies, risk management and practical trade execution with real market examples.</p>
                <div className="courseBottom">
                  {c.status==='coming_soon'
                    ? <b style={{color:'#f5c842',fontSize:"16px"}}>Coming Soon</b>
                    : optionPurchased
                      ? <button onClick={()=>{setDashCourseTab('option-trading');setTab("dashboard");}}>Start Learning →</button>
                      : <><b>{c.priceStr}</b><button onClick={()=>{setViewCourse('option-trading');setTab("course");}}>View Course →</button></>
                  }
                </div>
              </div>
            </article>
            );})()}

          </div>

        </main>

        <footer>
          <b>JTRADER</b>
          <small>
            Trading education built around discipline, practical learning and real market examples.
          </small>
          <span>© 2026 JTrader Academy</span>
        </footer>

      </div>
    );
  }

  if(tab==="course"){
    return (
      <div className="jt">
        <style>{css+heroCss+glassCss+toastCss+responsiveCss}</style>
        {toast&&<div className={`jtToast ${toast.type}`}>{toast.msg}</div>}

        <div className="bar">
          JTRADER ACADEMY <b>TRADING EDUCATION</b>
        </div>

        <nav className="topnav">

          <button
            className="brand"
            onClick={()=>setTab(me?.user?"dashboard":"home")}
          >
            <img src="/assets/jtrader-logo.png" alt="JTrader"/>
            <span>JTRADER ACADEMY</span>
          </button>

          <div className="links">
            <button onClick={()=>setTab(me?.user?"dashboard":"home")}>
              Dashboard
            </button>
            <button onClick={()=>setTab("course-options")}>
              Courses
            </button>
          </div>

        </nav>

        <main className="page">

          {(()=>{
            const c=COURSES[viewCourse];
            return <>
              <section className="pageHero">
                <small>COURSE CONTENT</small>
                <h1>{c.title.split(' ').slice(0,-1).join(' ')} <em>{c.title.split(' ').slice(-1)[0]}.</em></h1>
                <p>{c.subtitle}</p>
              </section>

              <section className="courseGrid">

                <div className="lessonList">
                  <header>
                    <div>
                      <small>VIDEO LESSONS</small>
                      <h2>{viewCourse==='option-trading'?lessons.length:0} Lessons</h2>
                    </div>
                  </header>

                  {viewCourse==='option-trading' && lessons.map((lesson:any,index:number)=>(
                    <div className="lesson" key={lesson.id||index}>
                      <strong>{String(index+1).padStart(2,"0")}</strong>
                      <div>
                        <h3>{lesson.title||"Untitled Lesson"}</h3>
                        <p>{lesson.description||"Course lesson"}</p>
                      </div>
                      <small>{getDuration(lesson)}</small>
                    </div>
                  ))}

                  {viewCourse==='basic-share-market' && (
                    <div className="locked">
                      <h3>Enroll to access lessons</h3>
                      <p>Purchase this course to unlock all video content.</p>
                    </div>
                  )}
                </div>

                <aside className="enroll">
                  <small>{c.tag}</small>
                  <h2>{c.title}</h2>
                  <div className="price">{c.priceStr}</div>
                  <p>{c.subtitle}</p>
                  <ul>
                    {c.features.map(f=><li key={f}>{f}</li>)}
                  </ul>
                  <button
                    className="primary full"
                    onClick={()=>startPayment(c.id)}
                  >
                    {me?.user?`Buy Now - ${c.priceStr}`:"Login to Continue"}
                  </button>
                </aside>

              </section>
            </>;
          })()}

        </main>

        <footer>
          <b>JTRADER</b>
          <small>
            Trading education built around discipline, practical learning and real market examples.
          </small>
          <span>© 2026 JTrader Academy</span>
        </footer>

      </div>
    );
  }

  if(tab==="community"){
    return (
      <div className="jt">
        <style>{css+heroCss+animCss+glassCss+responsiveCss}</style>

        <div className="bar">
          JTRADER ACADEMY <b>TRADING EDUCATION</b>
        </div>

        <nav className="topnav">

          <button
            className="brand"
            onClick={()=>setTab(me?.user?"dashboard":"home")}
          >
            <img src="/assets/jtrader-logo.png" alt="JTrader"/>
            <span>JTRADER ACADEMY</span>
          </button>

          <div className="links">
            <button onClick={()=>setTab(me?.user?"dashboard":"home")}>
              Dashboard
            </button>
            <button onClick={()=>setTab("course-options")}>
              Courses
            </button>
          </div>

          <div className="navRight">
            {me?.user && (
              <button className="navBtn" onClick={logout}>
                Logout
              </button>
            )}
          </div>

        </nav>

        <main className="page">

          <section className="pageHero">
            <small>PRIVATE COMMUNITY</small>
            <h1>
              Learn. Share. <em>Improve.</em>
            </h1>
          </section>

          {!me?.user ? (
            <section className="locked">
              <h3>Login required</h3>
              <p>Please login to access the community.</p>
            </section>
          ) : (!me.courses?.option && me.user.role!=='admin') ? (
            <section className="locked">
              <h3>Option Trading Course required</h3>
              <p>The community is exclusive to Option Trading Course students.</p>
              <button className="primary" style={{marginTop:"16px"}} onClick={()=>{setViewCourse('option-trading');setTab("course");}}>
                Buy Option Trading Course →
              </button>
            </section>
          ) : (()=>{
            const adminPosts=posts.filter((p:any)=>p.section==='admin');
            const studentPosts=posts.filter((p:any)=>p.section!=='admin');
            const hasNewAdmin=adminPosts.some((p:any)=>new Date(p.created_at+' UTC').getTime()>lastSeenAdmin);
            const hasNewStudent=studentPosts.some((p:any)=>new Date(p.created_at+' UTC').getTime()>lastSeenStudent);

            function switchTab(t:'admin'|'student'){
              setCommunityTab(t);
              const now=Date.now();
              if(t==='admin'){setLastSeenAdmin(now);localStorage.setItem('lsAdmin',String(now));}
              else{setLastSeenStudent(now);localStorage.setItem('lsStudent',String(now));}
            }

            return (
              <>
                {/* Tab switcher */}
                <div style={{display:"flex",gap:"10px",marginBottom:"22px"}}>
                  {([['admin','📊 JTrader Charts'],['student','👥 Our People Charts']] as const).map(([key,label])=>{
                    const isActive=communityTab===key;
                    const hasNew=key==='admin'?hasNewAdmin:hasNewStudent;
                    return (
                      <button key={key} onClick={()=>switchTab(key)} style={{position:"relative",padding:"11px 22px",borderRadius:"10px",border:isActive?"none":"1px solid rgba(255,255,255,0.1)",background:isActive?"#fff":"rgba(255,255,255,0.04)",color:isActive?"#080a0d":"#9aa6b4",fontWeight:900,fontSize:"12px",cursor:"pointer",backdropFilter:"blur(10px)",transition:"all .2s"}}>
                        {label}
                        {hasNew&&!isActive&&<span style={{position:"absolute",top:"-5px",right:"-5px",width:"12px",height:"12px",borderRadius:"50%",background:"#ff3b3b",border:"2px solid #020408",display:"block"}}/>}
                      </button>
                    );
                  })}
                </div>

                {/* Admin section */}
                {communityTab==='admin' && (
                  <section className="community">
                    <div style={{marginBottom:"14px"}}>
                      <small style={{color:"#5f8fff",fontSize:"9px",letterSpacing:"2px",fontWeight:900}}>JTRADER</small>
                      <h2 style={{margin:"4px 0 0",fontSize:"18px"}}>JTrader Charts</h2>
                    </div>

                    {me.user.role==='admin' && (
                      <div style={{marginBottom:"16px",padding:"16px",border:"1px solid #263342",borderRadius:"10px",background:"rgba(9,14,21,0.6)"}}>
                        <textarea placeholder="Post a market analysis or chart note..." value={adminNote} onChange={e=>setAdminNote(e.target.value)} style={{width:"100%",marginBottom:"8px"}}/>
                        <label style={{display:"block",border:"1px dashed #344253",borderRadius:"8px",padding:"10px",cursor:"pointer",fontSize:"11px",color:"#7a8799",marginBottom:"8px"}}>
                          {adminChartFile?`📎 ${adminChartFile.name}`:"Attach chart image (optional)"}
                          <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>setAdminChartFile(e.target.files?.[0]||null)}/>
                        </label>
                        <button className="primary" style={{fontSize:"11px"}} disabled={!adminNote.trim()&&!adminChartFile} onClick={()=>postNote('admin',adminNote,adminChartFile)}>
                          Post Analysis
                        </button>
                      </div>
                    )}

                    {adminPosts.length===0
                      ? <p style={{color:"#596778",fontSize:"12px"}}>No market analysis posted yet.</p>
                      : adminPosts.map((p:any,i:number)=>(
                        <article key={p.id||i} style={{borderTop:"1px solid #202a36",padding:"16px 0"}}>
                          <div style={{display:"flex",gap:"10px",alignItems:"center",marginBottom:"8px"}}>
                            <div style={{width:"30px",height:"30px",borderRadius:"50%",background:"#1d467c",color:"#9dc8ff",display:"grid",placeItems:"center",fontSize:"11px",fontWeight:900}}>JA</div>
                            <div><b style={{fontSize:"13px",display:"block"}}>JTrader Analysis</b><small style={{color:"#667384",fontSize:"9px"}}>{new Date(p.created_at).toLocaleDateString('en-IN')}</small></div>
                          </div>
                          {p.image_key&&<img src={`/api/media?key=${encodeURIComponent(p.image_key)}`} alt="chart" style={{width:"100%",maxWidth:"620px",borderRadius:"8px",marginBottom:"8px",border:"1px solid #27313d"}}/>}
                          {p.body&&<p style={{margin:0,color:"#c8d3de",fontSize:"13px",lineHeight:1.6}}>{p.body}</p>}
                        </article>
                      ))
                    }
                  </section>
                )}

                {/* Student section */}
                {communityTab==='student' && (
                  <section className="community">
                    <div style={{marginBottom:"14px"}}>
                      <small style={{color:"#5f8fff",fontSize:"9px",letterSpacing:"2px",fontWeight:900}}>COMMUNITY</small>
                      <h2 style={{margin:"4px 0 0",fontSize:"18px"}}>Our People Charts</h2>
                    </div>

                    <textarea placeholder="Share a chart, trade note or market observation..." value={note} onChange={e=>setNote(e.target.value)}/>
                    <label style={{display:"block",border:"1px dashed #344253",borderRadius:"8px",padding:"10px",cursor:"pointer",fontSize:"11px",color:"#7a8799",margin:"8px 0"}}>
                      {chartFile?`📎 ${chartFile.name}`:"Attach chart image (optional)"}
                      <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>setChartFile(e.target.files?.[0]||null)}/>
                    </label>
                    <button className="primary" style={{marginBottom:"20px"}} disabled={!note.trim()&&!chartFile} onClick={()=>postNote('student',note,chartFile)}>
                      Post
                    </button>

                    {studentPosts.length===0
                      ? <p style={{color:"#596778",fontSize:"12px"}}>No student posts yet. Be the first to share!</p>
                      : studentPosts.map((p:any,i:number)=>(
                        <article key={p.id||i} style={{borderTop:"1px solid #202a36",padding:"16px 0"}}>
                          <div style={{display:"flex",gap:"10px",alignItems:"center",marginBottom:"8px"}}>
                            <div style={{width:"30px",height:"30px",borderRadius:"50%",background:p.user_role==='admin'?"#1d467c":"#1b2e48",color:p.user_role==='admin'?"#9dc8ff":"#91bdf1",display:"grid",placeItems:"center",fontSize:"9px",fontWeight:900}}>{(p.name||'S').slice(0,2).toUpperCase()}</div>
                            <div style={{display:"flex",alignItems:"center",gap:"7px"}}>
                              <b style={{fontSize:"13px"}}>{p.name||"Student"}</b>
                              {p.user_role==='admin'&&<span style={{background:"#1d3a6b",color:"#75a9e9",fontSize:"8px",fontWeight:900,padding:"2px 7px",borderRadius:"10px",letterSpacing:"0.5px"}}>JTrader</span>}
                              <small style={{color:"#667384",fontSize:"9px"}}>{new Date(p.created_at).toLocaleDateString('en-IN')}</small>
                            </div>
                          </div>
                          {p.image_key&&<img src={`/api/media?key=${encodeURIComponent(p.image_key)}`} alt="chart" style={{width:"100%",maxWidth:"620px",borderRadius:"8px",marginBottom:"8px",border:"1px solid #27313d"}}/>}
                          {p.body&&<p style={{margin:0,color:"#c8d3de",fontSize:"13px",lineHeight:1.6}}>{p.body}</p>}
                        </article>
                      ))
                    }
                  </section>
                )}
              </>
            );
          })()}

        </main>

        <footer>
          <b>JTRADER</b>
          <small>
            Trading education built around discipline, practical learning and real market examples.
          </small>
          <span>© 2026 JTrader Academy</span>
        </footer>

      </div>
    );
  }

  if(tab==="auth"){
    return (
      <div className="jt">
        <style>{css+heroCss+animCss+glassCss+responsiveCss}</style>

        <div className="bar">
          JTRADER ACADEMY <b>TRADING EDUCATION</b>
        </div>

        <nav className="topnav">

          <button
            className="brand"
            onClick={()=>setTab("home")}
          >
            <img src="/assets/jtrader-logo.png" alt="JTrader"/>
            <span>JTRADER ACADEMY</span>
          </button>

        </nav>

        <main className="page">

          <section className="pageHero">
            <small>STUDENT LOGIN</small>

            <h1>
              Welcome <em>back.</em>
            </h1>

            <p>
              Login to access your JTrader student dashboard.
            </p>
          </section>

          <section className="signup">

            <div>
              <small>JTRADER ACADEMY</small>

              <h2>
                {auth==="login"
                  ? "Student Login"
                  : "Create Student Account"}
              </h2>

              <p>
                After login, you will be taken directly to your dashboard.
              </p>
            </div>

            <form onSubmit={submit}>

              {auth==="register" && (
                <input
                  placeholder="Full name"
                  value={f.name}
                  onChange={e=>setF({...f,name:e.target.value})}
                />
              )}

              <input
                placeholder="Email"
                type="email"
                value={f.email}
                onChange={e=>setF({...f,email:e.target.value})}
              />

              <div style={{position:"relative"}}>
                <input
                  placeholder="Password"
                  type={showPassword?"text":"password"}
                  value={f.password}
                  onChange={e=>setF({...f,password:e.target.value})}
                  style={{width:"100%",paddingRight:"42px"}}
                />
                <button
                  type="button"
                  onClick={()=>setShowPassword(s=>!s)}
                  style={{position:"absolute",right:"12px",top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#7a8799",fontSize:"16px",padding:"2px",lineHeight:1}}
                  title={showPassword?"Hide password":"Show password"}
                >
                  {showPassword
                    ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>

              {auth==="register" && (
                <select
                  value={f.city}
                  onChange={e=>setF({...f,city:e.target.value})}
                  style={{background:"#090d13",border:"1px solid #27313d",borderRadius:"8px",padding:"12px",color:f.city?"#fff":"#6b7a8d",outline:0,width:"100%",fontSize:"inherit"}}
                >
                  <option value="" disabled>Select your city</option>
                  {["Ahmedabad","Amritsar","Aurangabad","Bengaluru","Bhopal","Bhubaneswar","Chandigarh","Chennai","Coimbatore","Delhi","Faridabad","Ghaziabad","Gurgaon","Guwahati","Hyderabad","Indore","Jaipur","Jalandhar","Jodhpur","Kanpur","Kochi","Kolkata","Lucknow","Ludhiana","Madurai","Meerut","Mumbai","Mysuru","Nagpur","Nashik","Navi Mumbai","Noida","Patna","Pune","Raipur","Rajkot","Ranchi","Surat","Thane","Tiruchirappalli","Vadodara","Varanasi","Vijayawada","Visakhapatnam"].map(c=>(
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}

              {auth==="register" && (
                <input
                  placeholder="Phone number"
                  type="tel"
                  value={f.contactNumber}
                  onChange={e=>setF({...f,contactNumber:e.target.value})}
                />
              )}

              <button className="primary">
                {auth==="login" ? "Login →" : "Create Account →"}
              </button>

              <button
                type="button"
                className="outline"
                onClick={()=>{
                  setAuth(auth==="login"?"register":"login");
                  setLoginError("");
                }}
              >
                {auth==="login"
                  ? "Create account"
                  : "I already have an account"}
              </button>

              {loginError && (
                <div className="note">
                  {loginError}
                </div>
              )}

              {auth==="login" && !forgotPw && (
                <button type="button" style={{background:"none",border:"none",color:"#5f8fff",fontSize:"11px",cursor:"pointer",textAlign:"left",padding:0}} onClick={()=>{setForgotPw(true);setFpStep('email');setFpError('');setFpMsg('');}}>
                  Forgot password?
                </button>
              )}

              {forgotPw && (
                <div style={{border:"1px solid #27313d",borderRadius:"10px",padding:"18px",marginTop:"8px",background:"#090d13"}}>
                  <b style={{fontSize:"13px",display:"block",marginBottom:"12px"}}>Reset Password</b>
                  {fpMsg&&<div style={{color:"#55e0d0",fontSize:"11px",marginBottom:"8px"}}>{fpMsg}</div>}
                  {fpError&&<div style={{color:"#ff8a8a",fontSize:"11px",marginBottom:"8px"}}>{fpError}</div>}
                  {fpStep==='email'&&<>
                    <input placeholder="Enter your registered email" type="email" value={fpEmail} onChange={e=>setFpEmail(e.target.value)} style={{marginBottom:"8px"}}/>
                    <button type="button" className="primary" style={{width:"100%"}} onClick={sendOtp} disabled={!fpEmail.trim()}>Send OTP →</button>
                  </>}
                  {fpStep==='otp'&&<>
                    <input placeholder="Enter 6-digit OTP" value={fpOtp} onChange={e=>setFpOtp(e.target.value)} style={{marginBottom:"8px"}} maxLength={6}/>
                    <input placeholder="New password (min 8 chars)" type="password" value={fpNewPw} onChange={e=>setFpNewPw(e.target.value)} style={{marginBottom:"8px"}}/>
                    <button type="button" className="primary" style={{width:"100%",marginBottom:"8px"}} onClick={resetPw} disabled={!fpOtp||!fpNewPw}>Reset Password →</button>
                    <button type="button" style={{background:"none",border:"none",color:"#5f8fff",fontSize:"11px",cursor:"pointer"}} onClick={()=>setFpStep('email')}>← Resend OTP</button>
                  </>}
                  <button type="button" style={{display:"block",background:"none",border:"none",color:"#596778",fontSize:"10px",cursor:"pointer",marginTop:"8px"}} onClick={()=>setForgotPw(false)}>Cancel</button>
                </div>
              )}

            </form>

          </section>

        </main>

        <footer>
          <b>JTRADER</b>
          <small>
            Trading education built around discipline, practical learning and real market examples.
          </small>
          <span>© 2026 JTrader Academy</span>
        </footer>

      </div>
    );
  }

  return (
    <div className="jt">
      <style>{css+heroCss+glassCss}</style>

      <div className="bar">
        JTRADER ACADEMY <b>TRADING EDUCATION</b>
      </div>

      <nav className="topnav">

        <button
          className="brand"
          onClick={()=>setTab("home")}
        >
          <img src="/assets/jtrader-logo.png" alt="JTrader"/>
          <span>JTRADER ACADEMY</span>
        </button>

        <div className="links">
          <button onClick={()=>setTab("home")}>Home</button>
          <button onClick={()=>setTab("course-options")}>Courses</button>
          <button onClick={()=>setTab("community")}>Community</button>
        </div>

        <div className="navRight" style={{gap:"8px"}}>
          <button className="navBtn" onClick={()=>{setAuth("login");setTab("auth");}}>Login</button>
          <button className="primary" style={{fontSize:"11px",padding:"10px 16px"}} onClick={()=>{setAuth("register");setTab("auth");}}>Register →</button>
        </div>

      </nav>

      <section className="heroNew">

        <div className="heroCopy">

          <small>LEARN · EARN · GROW</small>

          <h1>
            JTRADER<br/>
            <span>ACADEMY</span>
          </h1>

          <p className="heroLead">
            Stop chasing strategies. Start trading with one that works.
          </p>

          <p>
            One simple strategy. No confusion. No information overload.
            Learn it, apply it, and let your money work for you.
          </p>

          <div className="heroActions">

            <button
              className="heroPrimary"
              onClick={()=>setTab("course-options")}
            >
              Explore Courses →
            </button>

            <button
              className="heroGhost"
              onClick={()=>{setAuth("register");setTab("auth");}}
            >
              Create Account
            </button>

          </div>

        </div>

        <div className="founderStage">

          <div className="founderGlow"/>

          <div className="founderFrame" style={{display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#0d1f3c,#0a1a0d)"}}>
            <div style={{textAlign:"center",color:"rgba(255,255,255,0.15)"}}>
              <div style={{fontSize:"64px",marginBottom:"12px"}}>📸</div>
              <div style={{fontSize:"11px",letterSpacing:"2px"}}>PHOTO COMING SOON</div>
            </div>
          </div>

          <div className="founderLogo">
            <img
              src="/assets/jtrader-logo.png"
              alt="JTrader logo"
            />
          </div>

        </div>

      </section>

      <section
        className="coursesNew"
        id="courses"
      >

        <OfferCycleBanner
          basicPrice={basicPurchased||COURSES['basic-share-market'].status==='coming_soon'?undefined:COURSES['basic-share-market'].price}
          optionPrice={optionPurchased||COURSES['option-trading'].status==='coming_soon'?undefined:COURSES['option-trading'].price}
          basicOldPrice={COURSES['basic-share-market'].oldPrice}
          optionOldPrice={COURSES['option-trading'].oldPrice}
        />

        <div className="sectionHeadNew">
          <div>
            <small>LEARN AT YOUR PACE</small>
            <h2>Our Courses</h2>
          </div>
        </div>

        <div className="courseCardsNew">

          {courseList.some(c=>c.id==='basic-share-market') && <article className="courseNew basicCourse">

            <div className="courseVisual">
              <span>{COURSES['basic-share-market'].status==='coming_soon'?'COMING SOON':'BEGINNER FRIENDLY'}</span>
            </div>

            <div className="courseBody">

              <h3>
                BASIC OF<br/>
                SHARE MARKET
              </h3>

              <p>
                Understand how the share market works,
                key concepts and analysis basics.
              </p>

              <div className="courseBottom">
                {COURSES['basic-share-market'].status==='coming_soon'
                  ? <b style={{color:'#f5c842',fontSize:'16px'}}>Coming Soon</b>
                  : <><b>{COURSES['basic-share-market'].priceStr}</b><button onClick={()=>setTab("course-options")}>View Course</button></>
                }
              </div>

            </div>

          </article>}

          {courseList.some(c=>c.id==='option-trading') && <article className="courseNew optionCourse">

            <div className="courseVisual">
              <span>{COURSES['option-trading'].status==='coming_soon'?'COMING SOON':'MOST POPULAR'}</span>
            </div>

            <div className="courseBody">

              <h3>
                OPTION<br/>
                TRADING COURSE
              </h3>

              <p>
                Learn options, strategies,
                risk management and practical trading.
              </p>

              <div className="courseBottom">
                {COURSES['option-trading'].status==='coming_soon'
                  ? <b style={{color:'#f5c842',fontSize:'16px'}}>Coming Soon</b>
                  : <><b>{COURSES['option-trading'].priceStr}</b><button onClick={()=>setTab("course-options")}>View Course</button></>
                }
              </div>

            </div>

          </article>}

        </div>

      </section>

      {/* About / Founder Section */}
      <section className="aboutSection" style={{width:"min(1160px,92%)",margin:"0 auto 80px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:"60px",alignItems:"center"}}>
        <div>
          <small style={{color:"#5f8fff",fontSize:"9px",letterSpacing:"2.5px",fontWeight:900}}>ABOUT THE FOUNDER</small>
          <h2 style={{fontSize:"clamp(28px,4vw,42px)",letterSpacing:"-1.5px",margin:"12px 0 20px",lineHeight:1.1}}>Jeya Akash</h2>
          <p style={{color:"#2c1a0e",lineHeight:1.8,fontSize:"15px",marginBottom:"16px"}}>
            Three years. Every popular strategy. Countless hours watching charts.
          </p>
          <p style={{color:"#2c1a0e",lineHeight:1.8,fontSize:"15px",marginBottom:"16px"}}>
            That was my journey — until I stopped overcomplicating everything and committed to one simple approach. No confusion, no juggling ten indicators, no second-guessing. Just one strategy, understood deeply and applied consistently.
          </p>
          <p style={{color:"#2c1a0e",lineHeight:1.8,fontSize:"15px",marginBottom:"24px"}}>
            The day I stopped switching was the day I started winning. JTrader Academy is built on that one method — simple enough to learn in days, powerful enough to trade for a lifetime.
          </p>
          <div style={{borderLeft:"3px solid #2563eb",paddingLeft:"18px"}}>
            <p style={{margin:0,fontSize:"17px",fontWeight:800,color:"#2c1a0e",lineHeight:1.7}}>
              Learn and earn.<br/>
              <span style={{color:"#78685a",fontWeight:500,fontSize:"15px"}}>Don't work for money — let the money work for you.</span>
            </p>
          </div>
        </div>
        <div style={{background:"linear-gradient(135deg,#0d1f3c,#0a1a0d)",borderRadius:"20px",height:"380px",display:"flex",alignItems:"center",justifyContent:"center",border:"1px solid rgba(255,255,255,0.07)",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",inset:0,background:"radial-gradient(circle at 60% 40%,rgba(30,70,180,.2),transparent 65%)"}}/>
          <div style={{textAlign:"center",position:"relative",zIndex:1}}>
            <div style={{fontSize:"56px",marginBottom:"12px"}}>📸</div>
            <div style={{fontSize:"11px",letterSpacing:"2px",color:"rgba(255,255,255,0.2)"}}>PHOTO COMING SOON</div>
          </div>
        </div>
      </section>

      <footer>
        <b>JTRADER</b>
        <small>
          Learn and earn — don't work for money, let the money work for you.
        </small>
        <span>© 2026 JTrader Academy</span>
      </footer>

      <SocialProofPopup/>
    </div>
  );
}

const animCss=`
/* ── Floating orbs in hero ── */
@keyframes floatOrb{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-18px) scale(1.04)}}
@keyframes floatOrb2{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(14px) scale(.97)}}
@keyframes shimmerBorder{0%,100%{opacity:.5}50%{opacity:1}}
@keyframes pulseGlow{0%,100%{box-shadow:0 0 30px rgba(80,130,255,.08),0 8px 36px rgba(0,0,0,.52)}50%{box-shadow:0 0 60px rgba(80,130,255,.18),0 8px 36px rgba(0,0,0,.52)}}
@keyframes pulseGoldGlow{0%,100%{box-shadow:0 0 30px rgba(200,130,0,.08),0 8px 36px rgba(0,0,0,.52)}50%{box-shadow:0 0 60px rgba(200,130,0,.22),0 8px 36px rgba(0,0,0,.52)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
@keyframes tickerScroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes chartDraw{from{stroke-dashoffset:400}to{stroke-dashoffset:0}}
@keyframes countUp{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:scale(1)}}

/* Apply animations */
.heroNew{position:relative;overflow:hidden}
.heroNew::before{content:'';position:absolute;width:500px;height:500px;border-radius:50%;background:radial-gradient(circle,rgba(30,70,180,.18) 0%,transparent 70%);top:-120px;left:-100px;animation:floatOrb 7s ease-in-out infinite;pointer-events:none}
.heroNew::after{content:'';position:absolute;width:350px;height:350px;border-radius:50%;background:radial-gradient(circle,rgba(100,200,150,.1) 0%,transparent 70%);bottom:-80px;right:5%;animation:floatOrb2 9s ease-in-out infinite;pointer-events:none}
.basicCourse{animation:pulseGlow 4s ease-in-out infinite}
.optionCourse{animation:pulseGoldGlow 4s ease-in-out infinite}
.offerCycleBanner{animation:pulseGlow 5s ease-in-out infinite}
.courseNew{transition:transform .3s cubic-bezier(.16,1,.3,1),box-shadow .3s!important}
.metricCard,.stats>div{animation:fadeUp .5s cubic-bezier(.16,1,.3,1) both}
.stats>div:nth-child(2){animation-delay:.1s}
.stats>div:nth-child(3){animation-delay:.2s}
.heroCopy>*{animation:fadeUp .6s cubic-bezier(.16,1,.3,1) both}
.heroCopy small{animation-delay:.05s}
.heroCopy h1{animation-delay:.12s}
.heroCopy p{animation-delay:.2s}
.heroActions{animation-delay:.28s!important}
.miniChart{animation:floatOrb 5s ease-in-out infinite}
.featureStrip>div{animation:fadeUp .5s cubic-bezier(.16,1,.3,1) both}
.featureStrip>div:nth-child(2){animation-delay:.08s}
.featureStrip>div:nth-child(3){animation-delay:.16s}
.featureStrip>div:nth-child(4){animation-delay:.24s}
`;

const responsiveCss=`
/* ── Tablet (≤768px) ── */
@media(max-width:768px){
  .aboutSection{grid-template-columns:1fr!important;gap:30px!important}
  nav{padding:0 4%}
  .brand span{font-size:11px}
  .page{padding:60px 0}
  .pageHero h1{font-size:36px;letter-spacing:-1.5px}
  .pageHero{padding:16px 0 36px}
  .welcomeDashboard h1{font-size:36px;letter-spacing:-1.5px}
  .lessonList header{flex-wrap:wrap;gap:8px}
  .lessonList header span{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .courseGrid{grid-template-columns:1fr}
  .enroll{position:static}
  .stats{grid-template-columns:1fr}
  .courseCardsNew{grid-template-columns:1fr}
  .locked{padding:40px 20px}
  .signup{grid-template-columns:1fr;gap:20px;padding:20px}
  .community{padding:14px}
  .offerCycleBanner{display:block;padding:18px}
  .offerCyclePrices{min-width:0;margin-top:14px;grid-template-columns:1fr 1fr;gap:8px}
}

/* ── Phone (≤480px) ── */
@media(max-width:480px){
  .bar{font-size:7px;letter-spacing:1px}
  nav{height:64px;padding:0 4%}
  .brand img{width:34px;height:34px;filter:brightness(0)}
  .brand span{font-size:10px;letter-spacing:1px}
  .navBtn{padding:8px 12px;font-size:10px}
  .primary,.heroPrimary{padding:12px 16px;font-size:11px}
  .page{padding:40px 0}
  .pageHero h1{font-size:30px;letter-spacing:-1px}
  .pageHero p{font-size:13px}
  .welcomeDashboard h1{font-size:28px}
  .hero h1{font-size:38px;letter-spacing:-2px}
  .stats>div{padding:14px}
  .stats>div b{font-size:22px}
  .lessonList header{padding:14px}
  .lessonList header h2{font-size:18px}
  .lesson{grid-template-columns:32px 1fr;gap:8px;padding:14px}
  .lesson>small{display:none}
  .courseBody h3{font-size:22px}
  .courseBody>b,.courseBottom>b{font-size:22px}
  .courseVisual{height:140px}
  .enroll{padding:16px}
  .price{font-size:24px}
  .locked{padding:28px 16px}
  .locked h3{font-size:18px}
  .signup{padding:16px;gap:14px}
  .signup input{padding:10px}
  .community{padding:12px}
  .community textarea{height:80px}
  footer{padding:24px 4%}
  footer b{font-size:15px}
  .cta{padding:24px 16px}
  .cta h2{font-size:28px;letter-spacing:-1px}
  .lessonList,.enroll,.signup,.community{border-radius:10px}
  .heroNew{min-height:auto;padding:40px 0}
  .heroCopy h1{font-size:clamp(42px,12vw,72px);letter-spacing:-3px}
  .heroActions{flex-direction:column;gap:8px}
  .heroPrimary,.heroGhost{width:100%;text-align:center;padding:14px}
  .joinBand{padding:20px}
  .joinBand h2{font-size:22px}
  .sectionHeadNew h2{font-size:28px}
}

/* ── Small phone (≤360px) ── */
@media(max-width:360px){
  .brand span{display:none}
  .pageHero h1{font-size:26px}
  .welcomeDashboard h1{font-size:24px}
  .hero h1{font-size:34px}
  .heroCopy h1{font-size:38px}
}

/* ── Video modal mobile ── */
@media(max-width:600px){
  .videoModal{padding:0;align-items:flex-end}
  .videoModalInner{width:100vw;max-height:95vh;border-radius:16px 16px 0 0}
  .videoModalHeader{padding:14px 16px}
  .videoModalHeader h3{font-size:14px}
  .videoModalBody{padding:12px}
}

/* ── Toast mobile ── */
@media(max-width:500px){
  .jtToast{min-width:calc(100vw - 32px);max-width:calc(100vw - 32px);left:16px;transform:none;bottom:16px;font-size:12px}
}

/* ── Community tabs mobile ── */
@media(max-width:520px){
  .communityTabs{flex-direction:column}
  .communityTabs button{width:100%;justify-content:center}
}

/* ── Disable heavy hover animations on touch ── */
@media(hover:none){
  .courseNew:hover{transform:none!important;box-shadow:none!important}
  .metricCard:hover{transform:none!important}
  .lessonClickable:hover{transform:none!important}
  .primary:hover,.heroPrimary:hover{transform:none!important;box-shadow:none!important}
}
`;

const toastCss=`
@keyframes toastIn{from{opacity:0;transform:translateY(30px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes toastOut{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(10px)}}
.jtToast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:9999;min-width:300px;max-width:520px;padding:15px 22px;border-radius:12px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:12px;box-shadow:0 20px 60px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.08);backdrop-filter:blur(20px);animation:toastIn .35s cubic-bezier(.16,1,.3,1)}
.jtToast.success{background:rgba(15,45,30,.92);color:#7de8b0;border:1px solid rgba(80,200,120,.25)}
.jtToast.error{background:rgba(45,15,20,.92);color:#ff9eaa;border:1px solid rgba(200,80,80,.25)}
`;

const glassCss=`
/* ── Slide-in transition ── */
@keyframes jtIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.jt{animation:jtIn .38s cubic-bezier(.16,1,.3,1)}

/* ── Light ambient background ── */
body{background:#faf6f0}
.jt{background:radial-gradient(ellipse 70% 50% at 10% -5%,rgba(232,223,208,.5) 0%,transparent 60%),radial-gradient(ellipse 55% 45% at 90% 105%,rgba(210,196,178,.3) 0%,transparent 60%),#faf6f0}

/* ── Light nav ── */
nav{background:rgba(250,246,240,.97)!important;backdrop-filter:blur(20px)!important;border-bottom:1px solid #e8dfd0!important;box-shadow:0 1px 20px rgba(0,0,0,.06)!important}
.bar{background:rgba(250,246,240,.96)!important;backdrop-filter:blur(12px)!important}

/* ── White panels with shadow ── */
.lessonList,.enroll,.signup,.community,.locked,.table,.stats>div,.card,.feature,.step,.courseGrid aside,.manageCard,.settingsCard{background:#fffdf9!important;border:1px solid #e9f0f8!important;box-shadow:0 2px 16px rgba(0,0,0,.06),0 1px 4px rgba(0,0,0,.04)!important}
.lessonList header{background:transparent!important;box-shadow:none!important}

/* ── Offer banner — light ── */
.offerCycleBanner{background:linear-gradient(135deg,#faf6f0,#fffdf9)!important;border:1px solid rgba(120,104,90,.2)!important;box-shadow:0 4px 20px rgba(59,130,246,.08)!important}

/* ── Buttons — blue, lift on hover ── */
.primary{background:#2563eb!important;color:#fff!important;box-shadow:0 4px 14px rgba(37,99,235,.3)!important;transition:transform .2s cubic-bezier(.16,1,.3,1),box-shadow .2s!important}
.primary:hover{transform:translateY(-2px)!important;box-shadow:0 8px 24px rgba(37,99,235,.4)!important;background:#1d4ed8!important}
.heroPrimary{background:#2563eb!important;color:#fff!important;box-shadow:0 4px 14px rgba(37,99,235,.3)!important;transition:transform .2s cubic-bezier(.16,1,.3,1),box-shadow .2s!important}
.heroPrimary:hover{transform:translateY(-2px)!important;box-shadow:0 8px 24px rgba(37,99,235,.4)!important;background:#1d4ed8!important}
.navBtn{transition:transform .18s,box-shadow .18s!important;background:#fffdf9!important;border:1px solid #e8dfd0!important;color:#1a2332!important}
.navBtn:hover{transform:translateY(-2px)!important;box-shadow:0 4px 12px rgba(0,0,0,.1)!important;border-color:#cbd5e1!important}
.outline:hover{transform:translateY(-2px)!important;border-color:#94a3b8!important}

/* ── Course cards — highlighted lift ── */
.courseNew{transition:transform .3s cubic-bezier(.16,1,.3,1),box-shadow .3s!important}
.courseNew:hover{transform:translateY(-8px) scale(1.012)!important}
.basicCourse:hover{box-shadow:0 24px 60px rgba(37,99,235,.18)!important}
.optionCourse:hover{box-shadow:0 24px 60px rgba(217,119,6,.18)!important}
.courseNew .courseBottom button{transition:transform .2s,box-shadow .2s!important}
.courseNew .courseBottom button:hover{transform:translateY(-2px)!important;box-shadow:0 4px 12px rgba(0,0,0,.2)!important}

/* ── Lesson rows — slide right on hover ── */
.lessonClickable{transition:transform .18s cubic-bezier(.16,1,.3,1),background .18s!important}
.lessonClickable:hover{transform:translateX(5px)!important;background:rgba(232,223,208,.5)!important}

/* ── Stats cards hover ── */
.stats>div{transition:border-color .25s,box-shadow .25s,transform .25s!important}
.stats>div:hover{border-color:rgba(120,104,90,.3)!important;box-shadow:0 8px 24px rgba(120,104,90,.1)!important;transform:translateY(-2px)!important}

/* ── Gradient headings — dark ── */
.welcomeDashboard h1,.pageHero h1{background:linear-gradient(120deg,#2c1a0e 30%,#3b82f6 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.hero h1{background:linear-gradient(110deg,#0f172a 20%,#2563eb 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}

/* ── Input glow on focus ── */
input:focus,textarea:focus,select:focus{border-color:rgba(37,99,235,.5)!important;box-shadow:0 0 0 3px rgba(37,99,235,.1)!important;outline:none!important}

/* ── Video modal ── */
.videoModal{backdrop-filter:blur(6px)!important}
.videoModalInner{background:#fffdf9!important;border:1px solid #e8dfd0!important;box-shadow:0 24px 80px rgba(0,0,0,.15)!important}

/* ── Footer ── */
footer{background:rgba(250,246,240,.96)!important;backdrop-filter:blur(12px)!important;border-top:1px solid #e8dfd0!important;color:#2c1a0e!important}
footer b{color:#2c1a0e!important;font-size:19px}
footer small,footer span{color:#78685a!important;opacity:1!important}

/* ── Classy price amount ── */
.courseBottom>b{background:linear-gradient(135deg,#2c1a0e,#2563eb,#0ea5e9)!important;-webkit-background-clip:text!important;-webkit-text-fill-color:transparent!important;background-clip:text!important;font-size:34px!important;letter-spacing:-1px!important;text-shadow:none!important}
.optionCourse .courseBottom>b{background:linear-gradient(135deg,#92400e,#d97706,#fbbf24)!important;-webkit-background-clip:text!important;-webkit-text-fill-color:transparent!important;background-clip:text!important}

/* ── 3-D text on all headings ── */
h1,h2,h3{text-shadow:1px 1px 0 rgba(0,0,0,.15),2px 2px 0 rgba(0,0,0,.09),3px 3px 0 rgba(0,0,0,.05),4px 4px 7px rgba(0,0,0,.10)!important}
.brand span,.logo,.logo b{text-shadow:1px 1px 0 rgba(0,0,0,.18),2px 2px 3px rgba(0,0,0,.12)!important}

/* ── Logo image always black ── */
.brand img,.logo img,.mobileBrand img,.adminLoginBrand img{filter:brightness(0)!important}

`;

const videoCss=`.videoModal{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px}.videoModalInner{background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;width:min(860px,96vw);max-height:92vh;overflow-y:auto;box-shadow:0 24px 80px rgba(0,0,0,.15)}.videoModalHeader{display:flex;justify-content:space-between;align-items:center;padding:16px 22px;border-bottom:1px solid #e8dfd0}.videoModalHeader h3{margin:0;font-size:17px;font-weight:700;color:#0f172a}.videoModalClose{font-size:20px;color:#94a3b8;line-height:1;padding:4px 8px;border-radius:6px}.videoModalClose:hover{background:#f1f5f9;color:#1a2332}.videoModalBody{padding:18px}.protectedVideo{position:relative;width:100%}.protectedVideo video{width:100%;border-radius:8px;background:#000;display:block}.videoWatermark{position:absolute;font-size:10px;color:rgba(255,255,255,.55);pointer-events:none;line-height:1.5;user-select:none;transition:top .6s ease,left .6s ease}.videoWatermark b{display:block;font-size:11px;font-weight:700}.videoWatermark span{display:block;opacity:.8}.watermarkNote{display:block;margin-top:8px;color:#94a3b8;font-size:9px;letter-spacing:.5px}.lessonClickable{cursor:pointer;transition:background .15s}.lessonClickable:hover{background:#eff6ff}`;

const heroCss=`.topnav{height:78px}.brand{display:flex;align-items:center;gap:10px;text-align:left}.brand img{width:45px;height:45px;object-fit:contain;filter:brightness(0)}.brand span{font-size:13px;font-weight:900;letter-spacing:1.8px;color:#000}.navRight{display:flex;align-items:center;gap:10px}.navBtn{border:1px solid #e8dfd0;padding:11px 17px;border-radius:8px;font-size:11px;background:#fff;color:#1a2332;font-weight:900}.heroNew{width:min(1160px,92%);margin:auto;display:grid;grid-template-columns:1fr .95fr;gap:35px;align-items:center;min-height:650px;padding:65px 0}.heroCopy>small,.sectionHeadNew small,.joinBand small{color:#2563eb;font-size:9px;letter-spacing:2.5px;font-weight:900}.heroCopy h1{font-size:clamp(62px,8vw,102px);line-height:.86;letter-spacing:-5px;margin:18px 0 24px;font-weight:950;color:#0f172a}.heroCopy h1 span{background:linear-gradient(110deg,#2563eb,#0ea5e9);-webkit-background-clip:text;color:transparent}.heroLead{font-size:21px!important;color:#1e293b!important;font-weight:700;margin-bottom:3px}.heroCopy p{max-width:580px;color:#64748b;line-height:1.7;font-size:14px}.heroActions{display:flex;gap:10px;margin-top:28px}.heroPrimary{background:#2563eb;color:#fff;padding:15px 21px;border-radius:10px;font-size:12px;font-weight:900}.heroPrimary b{margin-left:14px}.heroGhost{border:1px solid #e8dfd0;border-radius:10px;padding:14px 20px;color:#2c1a0e;font-size:12px;background:#fffdf9}.heroStats{display:flex;gap:30px;margin-top:35px}.heroStats div{padding-right:28px;border-right:1px solid #e8dfd0}.heroStats div:last-child{border:0}.heroStats b,.heroStats span{display:block}.heroStats b{font-size:16px;color:#0f172a}.heroStats span{color:#94a3b8;font-size:9px;margin-top:5px}.founderStage{height:570px;position:relative;display:flex;align-items:end;justify-content:center}.founderGlow{position:absolute;width:430px;height:430px;border-radius:50%;background:radial-gradient(circle,#d4c4a8 0,transparent 68%);filter:blur(18px);top:60px}.founderFrame{position:relative;width:410px;height:540px;border-radius:25px 25px 8px 8px;overflow:hidden;border:1px solid #e2e8f0;background:#fffdf9;box-shadow:0 20px 60px rgba(0,0,0,.1)}.founderFrame img{width:100%;height:100%;object-fit:cover;object-position:center 32%}.founderLogo{position:absolute;right:5px;top:40px;width:125px;height:125px;padding:18px;border-radius:18px;background:rgba(250,246,240,.96);border:1px solid #e8dfd0;backdrop-filter:blur(12px)}.founderLogo img{width:100%;height:100%;object-fit:contain}.quote{position:absolute;left:5px;top:150px;color:#94a3b8;font-size:23px;line-height:1.1;font-style:italic;transform:rotate(-7deg)}.quote i{color:#1e40af}.featureStrip{width:min(1160px,92%);margin:0 auto 15px;display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.featureStrip>div{min-height:90px;border:1px solid #e8dfd0;background:#fffdf9;border-radius:11px;padding:17px;display:grid;grid-template-columns:34px 1fr;align-content:center;box-shadow:0 2px 8px rgba(0,0,0,.04)}.featureStrip strong{grid-row:span 2;font-size:23px;color:#2563eb}.featureStrip b{font-size:11px;color:#1a2332}.featureStrip span{font-size:9px;color:#94a3b8;margin-top:4px}.coursesNew{width:min(1160px,92%);margin:auto;padding:80px 0 100px}.sectionHeadNew{display:flex;justify-content:space-between;align-items:end;margin-bottom:28px}.sectionHeadNew h2{font-size:42px;letter-spacing:-2px;margin:7px 0 0;color:#0f172a}.sectionHeadNew>button{font-size:11px;color:#64748b}.courseCardsNew{display:grid;grid-template-columns:1fr 1fr;gap:20px}.courseNew{border:2px solid #e2e8f0;border-radius:18px;overflow:hidden;background:#fffdf9;position:relative;box-shadow:0 4px 20px rgba(0,0,0,.07)}.basicCourse{border-color:#3b82f6;box-shadow:0 6px 28px rgba(59,130,246,.14)}.optionCourse{border-color:#f59e0b;box-shadow:0 6px 28px rgba(245,158,11,.14)}.courseVisual{height:190px;padding:20px;position:relative;overflow:hidden}.basicCourse .courseVisual{background:linear-gradient(135deg,#1d4ed8 0%,#3b82f6 55%,#60a5fa 100%)}.optionCourse .courseVisual{background:linear-gradient(135deg,#92400e 0%,#d97706 50%,#f59e0b 100%)}.courseVisual>span{font-size:8px;letter-spacing:1.4px;border-radius:30px;padding:8px 12px;font-weight:900;background:rgba(255,255,255,.2);backdrop-filter:blur(8px);color:#fff}.miniChart{position:absolute;right:20px;bottom:-15px;font-size:130px;font-weight:900;line-height:1;transform:rotate(-8deg)}.greenChart{color:rgba(255,255,255,.18)}.redChart{color:rgba(255,255,255,.12)}.courseBody{padding:24px}.courseBody h3{font-size:26px;line-height:.95;margin:0 0 12px;letter-spacing:-1px;color:#0f172a}.courseBody p{color:#64748b;font-size:11px;line-height:1.65;max-width:430px;min-height:48px}.courseMeta{display:flex;gap:15px;flex-wrap:wrap;color:#94a3b8;font-size:9px;margin:16px 0}.courseBottom{display:flex;justify-content:space-between;align-items:center;margin-top:16px}.courseBottom>b{font-size:30px;font-weight:900}.basicCourse .courseBottom>b{color:#2563eb}.optionCourse .courseBottom>b{color:#d97706}.courseBottom button{background:#0f172a;color:#fff;padding:12px 18px;border-radius:9px;font-size:10px;font-weight:900}.courseBottom button:hover{background:#1e293b}.courseQuote{margin:32px 0 0;color:#94a3b8;font-style:italic;font-size:12px}.courseQuote b{display:block;color:#1a2332;margin-top:8px}.joinBand{width:min(1160px,92%);margin:0 auto 90px;border:1px solid #e2e8f0;border-radius:18px;background:linear-gradient(135deg,#faf6f0 0%,#fffdf9 100%);padding:38px 48px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 4px 20px rgba(37,99,235,.07)}.joinBand h2{font-size:31px;letter-spacing:-1px;margin:8px 0;color:#0f172a}.joinBand p{color:#64748b;font-size:11px}.joinBand .heroPrimary{white-space:nowrap}@media(max-width:850px){.heroNew{grid-template-columns:1fr;padding:50px 0}.founderStage{height:500px}.founderFrame{width:min(360px,90%);height:470px}.founderLogo{right:0}.quote{left:0}.featureStrip,.courseCardsNew{grid-template-columns:1fr}.sectionHeadNew{display:block}.sectionHeadNew>button{margin-top:10px}.joinBand{display:block;padding:28px}.joinBand .heroPrimary{margin-top:15px}.heroStats{gap:15px}.heroStats div{padding-right:14px}}`;


const css=`*{box-sizing:border-box}body{margin:0;background:#faf6f0;color:#2c1a0e;font-family:Inter,system-ui,sans-serif}.jt{min-height:100vh;background:#faf6f0}button{font:inherit;cursor:pointer;color:inherit;background:none;border:0}.bar{height:32px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b;font-size:9px;letter-spacing:1.5px;padding:9px;background:#faf6f0}.bar b{color:#2c1a0e;margin-left:12px}nav{height:78px;border-bottom:1px solid #e2e8f0;background:rgba(250,246,240,.96);backdrop-filter:blur(15px);display:flex;align-items:center;justify-content:space-between;padding:0 max(4%,calc((100% - 1160px)/2));position:sticky;top:0;z-index:20;box-shadow:0 1px 16px rgba(0,0,0,.06)}.logo{text-align:left;font-size:23px;font-weight:900;color:#1a2332}.logo small{display:block;color:#94a3b8;font-size:7px;letter-spacing:2px}.logo span{color:#000}.links{display:flex;gap:30px}.links button,.admin{color:#475569;font-size:12px}.outline{border:1px solid #e2e8f0;padding:10px 14px;border-radius:8px;font-size:12px;color:#1a2332;background:#fff}.admin{margin-right:10px}.hero{width:min(1160px,92%);margin:auto;display:grid;grid-template-columns:1.05fr .95fr;gap:65px;align-items:center;padding:90px 0}.ey{color:#2563eb;font-size:9px;letter-spacing:2px}.hero h1{font-size:clamp(50px,7vw,82px);line-height:.93;letter-spacing:-4px;margin:18px 0;color:#0f172a}.hero h1 em,.pageHero em,.cta em{font-style:normal;color:#2563eb}.hero p,.pageHero p{max-width:620px;color:#64748b;line-height:1.7;font-size:16px}.acts{display:flex;gap:10px;margin-top:27px;flex-wrap:wrap}.primary{background:#2563eb;color:#fff;padding:14px 20px;border-radius:9px;font-weight:900;font-size:12px}.trust{color:#94a3b8;font-size:9px;margin-top:20px}.terminal{border:1px solid #e2e8f0;background:#fffdf9;border-radius:15px;padding:12px;box-shadow:0 4px 24px rgba(0,0,0,.06)}.term{height:34px;color:#94a3b8;font-size:8px;border-bottom:1px solid #e8dfd0}.term b{margin-left:10px;color:#475569}.term span{float:right}.chart{height:290px;margin-top:13px;border:1px solid #e2e8f0;border-radius:8px;background:repeating-linear-gradient(0deg,transparent 0 47px,#e8dfd0 48px),repeating-linear-gradient(90deg,transparent 0 65px,#e8dfd0 66px);color:#2563eb;position:relative}.chart svg{width:100%;height:100%}.chart i{position:absolute;right:10px;top:10px;color:#94a3b8;font-size:8px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:7px}.metrics b{font-size:8px;color:#64748b;background:#faf6f0;border:1px solid #e8dfd0;border-radius:7px;padding:9px}.metrics strong{color:#1a2332;font-size:10px}.ticker{border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;text-align:center;padding:15px;color:#94a3b8;font-size:9px;letter-spacing:1px}.ticker b{color:#1a2332}.section,.page{width:min(1160px,92%);margin:auto;padding:90px 0}.head{display:flex;justify-content:space-between;align-items:end;gap:30px;margin-bottom:35px}.head small,.pageHero small,.enroll>small,.signup small,.adminLogin>small,.dashboard small{font-size:8px;color:#2563eb;letter-spacing:2px;font-weight:900}.head h2,.dashboard h2{font-size:42px;line-height:1;letter-spacing:-2px;margin:8px 0;color:#0f172a}.head p{max-width:430px;color:#64748b;font-size:12px;line-height:1.7}.features,.courses{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.feature,.step,.card{border:1px solid #e9f0f8;background:#fffdf9;border-radius:12px;padding:25px;box-shadow:0 2px 8px rgba(0,0,0,.04)}.feature{min-height:220px}.feature>small,.step small{color:#2563eb}.feature h3{margin-top:55px;color:#0f172a}.feature p,.feature a,.step p,.card p{color:#64748b;font-size:12px;line-height:1.6}.dark{border-block:1px solid #e2e8f0;background:#e8dfd0;padding:90px max(4%,calc((100% - 1160px)/2))}.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.step h3{margin-top:40px;color:#0f172a}.cover{height:190px;border-radius:9px;position:relative;padding:15px;overflow:hidden}.cover.blue{background:linear-gradient(135deg,#1d4ed8,#3b82f6)}.cover.green{background:linear-gradient(135deg,#059669,#10b981)}.cover.gold{background:linear-gradient(135deg,#b45309,#f59e0b)}.cover small{color:rgba(255,255,255,.8);font-size:8px;letter-spacing:2px}.cover b{position:absolute;left:15px;bottom:15px;font-size:22px;line-height:1;color:#fff}.card{padding:8px;text-align:left}.courseChoice{display:block;width:100%;border:1px solid #e2e8f0;border-radius:8px;background:#fff}.courseChoice>strong{display:block;padding:8px 8px 4px;font-size:22px;color:#1a2332}.courseChoice p{min-height:38px}.card h3,.card p,.card>strong{margin-left:8px}.card h3{color:#0f172a}.card>button{float:right;margin:0 8px 8px;width:35px;height:35px;background:#2563eb;color:#fff;border-radius:8px}.cta{width:min(1160px,92%);margin:0 auto 90px;border:1px solid #e2e8f0;border-radius:15px;padding:50px;background:linear-gradient(135deg,#faf6f0,#fffdf9);display:flex;justify-content:space-between;align-items:center}.cta h2{font-size:40px;letter-spacing:-2px;color:#0f172a}.pageHero{padding:20px 0 55px}.pageHero h1{font-size:54px;letter-spacing:-3px;line-height:1;color:#0f172a}.courseGrid{display:grid;grid-template-columns:1.5fr .7fr;gap:15px}.lessonList,.enroll,.signup,.community,.locked,.table{border:1px solid #e9f0f8;background:#fffdf9;border-radius:13px}.lessonList header{display:flex;justify-content:space-between;padding:22px;border-bottom:1px solid #e8dfd0}.lessonList header h2{margin:8px 0;font-size:23px;color:#0f172a}.lesson{display:grid;grid-template-columns:40px 1fr;gap:12px;padding:18px 22px;border-bottom:1px solid #e8dfd0}.lesson:last-child{border:0}.lesson>strong{color:#2563eb}.lesson h3{margin:5px 0;font-size:15px;color:#1a2332}.lesson p{margin:0;color:#64748b;font-size:11px}.lesson small{color:#94a3b8;font-size:8px}.enroll{padding:23px;height:max-content;position:sticky;top:105px}.enroll h2{font-size:22px;color:#0f172a}.price{font-size:30px;color:#0f172a}.price s{font-size:12px;color:#94a3b8}.enroll p,.enroll li{color:#64748b;font-size:11px;line-height:1.7}.enroll ul{padding-left:17px}.full{width:100%;margin-top:10px}.signup{margin-top:15px;padding:25px;display:grid;grid-template-columns:1fr 1fr;gap:40px}.signup form{display:grid;gap:8px}.signup input,.adminLogininput,.tableHead input{background:#faf6f0;border:1px solid #e8dfd0;border-radius:8px;padding:12px;color:#2c1a0e;outline:0}.community{padding:20px}.community textarea{width:100%;height:110px;background:#faf6f0;border:1px solid #e8dfd0;border-radius:8px;color:#2c1a0e;padding:12px}.community article{border-top:1px solid #e8dfd0;padding:16px 0}.community article small{color:#94a3b8;margin-left:10px}.locked{text-align:center;padding:70px;color:#94a3b8}.adminNav{display:flex;gap:8px;align-items:center;margin:28px 0}.adminNav button{padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px;color:#64748b;font-size:11px;background:#fff}.adminNav .active{background:#2563eb;color:#fff;border-color:#2563eb}.managerGrid{display:grid;grid-template-columns:1fr 1.2fr;gap:14px}.manageCard{border:1px solid #e8dfd0;background:#fffdf9;border-radius:13px;padding:24px}.manageCard h2{font-size:25px;margin:8px 0 20px;color:#0f172a}.manageCard input,.manageCard textarea,.settingsCard input,.settingsCard textarea{width:100%;background:#faf6f0;border:1px solid #e8dfd0;border-radius:8px;padding:12px;color:#2c1a0e;outline:0;margin:5px 0}.manageCard textarea,.settingsCard textarea{min-height:100px;resize:vertical}.upload{display:block;border:1px dashed #cbd5e1;border-radius:9px;padding:15px;margin:10px 0;cursor:pointer}.upload b,.upload span{display:block;font-size:11px}.upload b{color:#1a2332}.upload span{color:#94a3b8;margin-top:5px}.upload input{display:none}.lessonAdmin{display:flex;justify-content:space-between;gap:12px;border-top:1px solid #e8dfd0;padding:14px 0}.lessonAdmin b,.lessonAdmin small{display:block}.lessonAdmin b{color:#1a2332}.lessonAdmin small{color:#94a3b8;margin-top:5px}.lessonAdmin button{font-size:10px;color:#64748b;margin-left:12px}.settingsGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.settingsCard>label{display:block;color:#64748b;font-size:10px;margin-top:10px}.notice.error{color:#ef4444}@media(max-width:850px){.managerGrid,.settingsGrid{grid-template-columns:1fr}.adminNav{overflow:auto}}.accessBar{width:min(1160px,92%);margin:0 auto 15px;border:1px solid #e9f0f8;background:#fffdf9;border-radius:10px;padding:13px 16px;display:flex;justify-content:space-between;gap:12px;font-size:10px;color:#64748b}.accessBar span{color:#10b981;font-weight:900}.lockedBar span{color:#f59e0b}.lessonVideo{display:block;width:100%;max-width:620px;margin-top:14px;border:1px solid #e2e8f0;border-radius:8px;background:#faf6f0}.videoPending{display:block;margin-top:12px;color:#94a3b8}.adminPage{min-height:calc(100vh - 32px);padding:30px 4%;background:#faf6f0}.adminTop{display:flex;justify-content:space-between;border-bottom:1px solid #e2e8f0;padding-bottom:20px;color:#64748b;font-size:11px}.adminLogin{width:min(430px,100%);margin:80px auto;border:1px solid #e2e8f0;background:#fffdf9;border-radius:15px;padding:35px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.06)}.lock{font-size:25px;margin-bottom:15px;color:#2563eb}.adminLoginh1{font-size:31px;margin:10px;color:#0f172a}.adminLoginp,.demo{color:#64748b;font-size:11px;line-height:1.6}.adminLogininput{width:100%;margin:5px 0}.demo{display:block;margin-top:16px}.dashboard{width:min(1180px,100%);margin:45px auto}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:25px 0 15px}.stats div{border:1px solid #e9f0f8;background:#fffdf9;border-radius:11px;padding:20px;box-shadow:0 2px 10px rgba(0,0,0,.05)}.stats b{display:block;font-size:27px;margin-top:8px;color:#0f172a}.table{overflow:hidden}.tableHead{display:flex;justify-content:space-between;align-items:center;padding:18px;border-bottom:1px solid #e8dfd0}.tableHead input{width:280px}.row{min-width:850px;display:grid;grid-template-columns:1.1fr 1.35fr 1fr 1fr .7fr .7fr;gap:12px;padding:15px 18px;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:10px}.row:last-child{border:0}.row b{color:#1a2332}.th{color:#94a3b8;font-size:8px;letter-spacing:1px}.paid{color:#10b981}footer{border-top:1px solid #e2e8f0;padding:38px max(4%,calc((100% - 1160px)/2));display:flex;gap:25px;justify-content:space-between;color:#2c1a0e;font-size:10px}footer b{font-size:19px;color:#2c1a0e}footer small{max-width:330px;color:#78685a}@media(max-width:850px){.links{display:none}.hero,.courseGrid,.signup{grid-template-columns:1fr}.hero{padding:60px 0}.hero h1{font-size:50px}.features,.courses,.steps,.stats{grid-template-columns:1fr}.head{display:block}.head p{margin-top:15px}.cta{display:block;padding:35px 25px}.cta .primary{margin-top:20px}.enroll{position:static}.pageHero h1{font-size:43px}.tableHead{display:block}.tableHead input{width:100%;margin-top:10px}footer{display:block}.admin{display:none}}`;












