import {useEffect, useState} from 'react';

type Props = {in: boolean; close: () => void};
type Course = {id: string; title: string; price: number; old_price?: number; description?: string; thumbnail_key?: string; access?: string; hidden?: number; status?: string};
type Lesson = {id: string; course_id: string; title: string; module: string; description: string; position: number; available: boolean};
type Student = {id?: string; name: string; email: string; city?: string; created_at: string; amount?: number; status: string; blocked?: number};

const api = (path: string, options?: RequestInit) => fetch(path, options).then(async response => {
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};
  if (!response.ok) {
    if (response.status === 403) throw Error('Session expired — log out and log back in at jtrader.in, then return here.');
    throw Error(data.error || `Request failed (${response.status})`);
  }
  return data;
});

/*
 * jtrader.in sits behind a gateway that rejects any request body over
 * 100KiB before it reaches the Worker at all, so the video cannot be
 * posted to our own API in any form, chunked or not. Instead the browser
 * PUTs the file straight to R2 using a short-lived presigned URL — that
 * request goes to R2's own endpoint, not jtrader.in, so the gateway never
 * sees it.
 *
 * fetch cannot report upload progress, so the PUT goes over XHR — that is
 * the only way to drive a real percentage rather than a bar that jumps
 * from 0 to 100.
 */
const putWithProgress = (url: string, file: File, onPercent: (pct: number) => void) =>
  new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onPercent(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(Error('Network error during upload'));
    xhr.onabort = () => reject(Error('Upload cancelled'));
    xhr.send(file);
  });

/*
 * Ask the server for a presigned URL, upload directly to R2, and return
 * the finished object key.
 */
async function uploadVideo(file: File, onPercent: (pct: number) => void) {
  const {key, uploadUrl} = await api('/api/upload?action=presign', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({contentType: file.type, size: file.size}),
  }) as {key: string; uploadUrl: string};

  try {
    await putWithProgress(uploadUrl, file, onPercent);
    onPercent(100);
    return key;
  } catch (cause) {
    // The object may have landed in R2 even though the browser saw the
    // request fail (e.g. a timeout after the bytes finished sending), so
    // don't leave it orphaned with no lesson pointing at it.
    void api('/api/upload?action=discard', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({key}),
    }).catch(() => {});
    throw cause;
  }
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(isFinite(v.duration) ? v.duration : 0); };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    v.src = url;
  });
}

const navItems = [
  ['overview', '⌂', 'Dashboard'],
  ['courses', '◈', 'Courses'],
  ['course', '▤', 'Video Lessons'],
  ['students', '♙', 'Students'],
  ['payments', '◌', 'Payments'],
  ['community', '◉', 'Community'],
  ['offer', '◷', 'Offer Timing'],
  ['settings', '⚙', 'Settings'],
  ['account', '◎', 'Account'],
] as const;

export default function Admin({in: initiallyEntered, close}: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [forgotPw, setForgotPw] = useState(false);
  const [fpStep, setFpStep] = useState<'email'|'otp'>('email');
  const [fpEmail, setFpEmail] = useState('');
  const [fpOtp, setFpOtp] = useState('');
  const [fpNewPw, setFpNewPw] = useState('');
  const [fpMsg, setFpMsg] = useState('');
  const [fpErr, setFpErr] = useState('');
  const [entered, setEnteredState] = useState(initiallyEntered);
  const setEntered = (value: boolean) => { if (!value) void api('/api/auth?action=logout', {method: 'POST'}); setEnteredState(value); };
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [rows, setRows] = useState<Student[]>([]);
  const [settings, setSettings] = useState<any>({title: 'JTrader Core Course', price: 499, oldPrice: 999, access: '6 months', description: ''});
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [tab, setTab] = useState('overview');
  const [form, setForm] = useState<any>({id: '', title: '', module: 'Module 1', description: '', position: 1});
  const [file, setFile] = useState<File | null>(null);
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<any[]>([]);
  const [lessonCounts, setLessonCounts] = useState<Record<string,number>>({});
  const [newPayments, setNewPayments] = useState<any[]>([]);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [activeBroadcast, setActiveBroadcast] = useState<any>(null);
  const [offerSettings, setOfferSettings] = useState({enabled:true,cycleHours:9,basicOldPrice:2000,optionOldPrice:13000,bannerTitle:'Build your market edge.',socialProofEnabled:true,socialProofCourse:'basic-share-market'});
  const courseLessons = lessons.filter(lesson => lesson.course_id === selectedCourse);
  const selected = courses.find(course => course.id === selectedCourse);
  const paid = rows.filter(row => row.status === 'Paid').length;
  const revenue = rows.reduce((total, row) => total + Number(row.amount || 0), 0);

  async function load() {
    const data = await api('/api/admin');
    setCourses(data.courses || []);
    setSelectedCourse(current => current || data.courses?.[0]?.id || '');
    setLessons(data.lessons || []);
    setRows(data.students || []);
    setSettings(data.settings || settings);
    setProgress(data.progress || []);
    const counts: Record<string,number> = {};
    (data.lessons || []).forEach((l: any) => { counts[l.course_id] = (counts[l.course_id]||0)+1; });
    setLessonCounts(counts);

    // Detect new payments since last admin visit
    const lastSeen = localStorage.getItem('adminLastVisit') || '2000-01-01';
    const fresh = (data.students || []).filter((s: any) =>
      s.status === 'Paid' && s.created_at && s.created_at > lastSeen
    );
    if (fresh.length > 0) setNewPayments(fresh);
    localStorage.setItem('adminLastVisit', new Date().toISOString().replace('T',' ').slice(0,19));
    setActiveBroadcast(data.broadcast || null);
  }
  async function loadOffer() {
    const data = await api('/api/offer');
    if(data && typeof data.cycleHours === 'number') setOfferSettings({
      enabled: !!data.enabled,
      cycleHours: data.cycleHours,
      basicOldPrice: data.basicOldPrice,
      optionOldPrice: data.optionOldPrice,
      bannerTitle: data.bannerTitle,
      socialProofEnabled: data.socialProofEnabled !== false,
      socialProofCourse: data.socialProofCourse || 'basic-share-market',
    });
  }
  async function saveOffer() {
    setLoading(true);
    try {
      await api('/api/offer', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(offerSettings)});
      setNotice('Offer settings saved.');
    } catch(cause:any) { setError(cause.message); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    if (initiallyEntered) {
      load().catch(cause => setError(cause.message));
      loadOffer().catch(() => {});
    }
  }, [initiallyEntered]);
  async function sendAdminOtp() {
    setFpErr(''); setFpMsg('');
    try {
      const r = await fetch('/api/auth?action=forgot-password', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email: fpEmail})});
      const d = await r.json() as any;
      if (!r.ok) throw Error(d.error||'Failed');
      setFpStep('otp'); setFpMsg('OTP sent to your email.');
    } catch(e:any) { setFpErr(e.message||'Failed to send OTP'); }
  }
  async function resetAdminPw() {
    setFpErr('');
    try {
      const r = await fetch('/api/auth?action=reset-password', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email: fpEmail, otp: fpOtp, newPassword: fpNewPw})});
      const d = await r.json() as any;
      if (!r.ok) throw Error(d.error||'Failed');
      setFpMsg('Password reset! Please login.'); setForgotPw(false); setFpStep('email'); setFpOtp(''); setFpNewPw('');
    } catch(e:any) { setFpErr(e.message||'Invalid OTP'); }
  }

  async function enter() {
    setError(''); setLoading(true);
    try {
      await api('/api/auth?action=login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email, password})});
      const me = await api('/api/auth');
      if (me?.user?.role !== 'admin') throw Error('Admin access only');
      await load(); setEntered(true);
    } catch (cause: any) { setError(cause.message || 'Invalid admin login'); }
    finally { setLoading(false); }
  }
  function resetForm(position = 1) { setForm({id: '', title: '', module: 'Module 1', description: '', position}); setFile(null); }
  async function saveLesson() {
    if (!selectedCourse) return setError('Select a course first');
    setError(''); setLoading(true);
    try {
      /*
       * The video goes to R2 in chunks before the lesson row is written, so
       * the save request itself stays small regardless of the file size.
       */
      let videoKey = '';
      if (file) { setUploadPct(0); videoKey = await uploadVideo(file, setUploadPct); }

      const body = new FormData();
      body.append('action', form.id ? 'lesson-update' : 'lesson-create'); body.append('id', form.id); body.append('courseId', selectedCourse); body.append('title', form.title); body.append('module', form.module); body.append('description', form.description); body.append('position', String(form.position));
      if (videoKey) body.append('videoKey', videoKey);
      if (fileDuration) body.append('duration', String(fileDuration));

      await api('/api/admin', {method: 'POST', body}); setFileDuration(null); resetForm(courseLessons.length + 1); await load(); setNotice('Lesson saved successfully.');
    } catch (cause: any) { setError(cause.message); }
    finally { setLoading(false); setUploadPct(null); }
  }
  async function removeLesson(id: string) {
    if (!confirm('Delete this lesson?')) return;
    setLoading(true);
    try { await api('/api/admin', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'lesson-delete', id})}); await load(); setNotice('Lesson deleted.'); } catch (cause: any) { setError(cause.message); }
    finally { setLoading(false); }
  }
  async function toggleBlockStudent(userId: string) {
    try { await api('/api/admin', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'student-toggle-block',userId})}); await load(); setNotice('Student access updated.'); }
    catch(cause:any) { setError(cause.message); }
  }

  async function sendBroadcast() {
    if (!broadcastMsg.trim()) return;
    setLoading(true);
    try { await api('/api/admin', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'broadcast',message:broadcastMsg})}); setBroadcastMsg(''); await load(); setNotice('Broadcast sent to all students!'); }
    catch(cause:any) { setError(cause.message); }
    finally { setLoading(false); }
  }

  async function clearBroadcast() {
    try { await api('/api/admin', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'broadcast-clear'})}); setActiveBroadcast(null); setNotice('Broadcast cleared.'); }
    catch(cause:any) { setError(cause.message); }
  }

  function exportCSV() {
    const headers = ['Name','Email','City','Joined','Amount','Status'];
    const csvRows = [headers.join(','), ...rows.map(r => [r.name,r.email,r.city||'',r.created_at,r.amount||0,r.status].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','))];
    const blob = new Blob([csvRows.join('\n')], {type:'text/csv'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `jtrader-students-${new Date().toISOString().slice(0,10)}.csv`; a.click();
  }

  async function setCourseStatus(courseId: string, status: string) {
    setLoading(true);
    try {
      await api('/api/admin', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'course-set-status', courseId, status})});
      await load();
      setNotice('Course status updated.');
    } catch(cause: any) { setError(cause.message); }
    finally { setLoading(false); }
  }
  async function saveCourse(courseId: string, updates: {title: string; price: number; oldPrice: number; description: string}) {
    setLoading(true);
    const body = new FormData();
    body.append('action', 'course-update');
    body.append('courseId', courseId);
    body.append('title', updates.title);
    body.append('price', String(updates.price));
    body.append('oldPrice', String(updates.oldPrice));
    body.append('access', 'lifetime');
    body.append('description', updates.description);
    try { await api('/api/admin', {method: 'POST', body}); await load(); setNotice('Course updated successfully.'); }
    catch(cause: any) { setError(cause.message); }
    finally { setLoading(false); }
  }
  async function saveSettings() {
    setLoading(true);
    const body = new FormData(); body.append('action', 'settings'); body.append('title', settings.title); body.append('price', String(settings.price)); body.append('oldPrice', String(settings.old_price ?? settings.oldPrice)); body.append('access', settings.access); body.append('description', settings.description); if (thumbnail) body.append('thumbnail', thumbnail);
    try { const data = await api('/api/admin', {method: 'POST', body}); setSettings(data.settings); setThumbnail(null); setNotice('Course settings saved.'); } catch (cause: any) { setError(cause.message); }
    finally { setLoading(false); }
  }
  async function logout() {
    await api('/api/auth?action=logout', {method: 'POST'}).catch(() => undefined);
    setEntered(false);
  }
  function openCourse(id: string) { setSelectedCourse(id); resetForm(); setTab('course'); }

  if (!entered) return <div className="adminPage adminLoginPage"><style>{adminStyles}</style><div className="adminLoginShell"><button className="adminBack" onClick={close}>← Back to website</button><div className="adminLoginBrand"><img src="/assets/jtrader-logo.png" alt="JTrader Academy"/><span>JTRADER<br/><small>ACADEMY</small></span></div><div className="adminLoginCard"><div className="loginMark">⌁</div><small className="eyebrow">PRIVATE ADMIN AREA</small><h1>Welcome back.</h1><p>Sign in to manage your courses, lessons and student activity.</p><label>Email address<input type="email" placeholder="admin@example.com" value={email} onChange={event => setEmail(event.target.value)}/></label><label>Password<div style={{position:'relative'}}><input placeholder="Enter your password" type={showPw?'text':'password'} value={password} onChange={event => setPassword(event.target.value)} onKeyDown={event => event.key === 'Enter' && enter()} style={{paddingRight:'42px'}}/><button type="button" onClick={()=>setShowPw(s=>!s)} style={{position:'absolute',right:'12px',top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'#7a8799',fontSize:'16px',padding:'2px',lineHeight:1}}>{showPw
  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
}</button></div></label><button className="adminPrimary adminWide" onClick={enter} disabled={loading}>{loading ? 'Checking access...' : 'Enter dashboard  →'}</button>
            {error && <div className="adminError">{error}</div>}
            {!forgotPw && <button type="button" onClick={()=>{setForgotPw(true);setFpEmail('');setFpStep('email');setFpMsg('');setFpErr('');}} style={{background:'none',border:'none',color:'#5f8fff',fontSize:'10px',cursor:'pointer',marginTop:'10px',display:'block'}}>Forgot password?</button>}
            {forgotPw && <div style={{marginTop:'14px',padding:'14px',border:'1px solid #24384d',borderRadius:'8px',background:'#08101a'}}>
              <b style={{fontSize:'11px',display:'block',marginBottom:'10px',color:'#d7e8fa'}}>Reset Admin Password</b>
              {fpMsg&&<div style={{color:'#6ed9aa',fontSize:'10px',marginBottom:'8px'}}>{fpMsg}</div>}
              {fpErr&&<div style={{color:'#ff9eaa',fontSize:'10px',marginBottom:'8px'}}>{fpErr}</div>}
              {fpStep==='email'&&<><input placeholder="Admin email" type="email" value={fpEmail} onChange={e=>setFpEmail(e.target.value)} style={{display:'block',width:'100%',background:'#08101a',border:'1px solid #294158',borderRadius:'8px',color:'#fff',padding:'11px',marginBottom:'8px',font:'inherit',fontSize:'11px'}}/><button className="adminPrimary adminWide" onClick={sendAdminOtp} disabled={!fpEmail.trim()}>Send OTP →</button></>}
              {fpStep==='otp'&&<><input placeholder="6-digit OTP" value={fpOtp} onChange={e=>setFpOtp(e.target.value)} maxLength={6} style={{display:'block',width:'100%',background:'#08101a',border:'1px solid #294158',borderRadius:'8px',color:'#fff',padding:'11px',marginBottom:'8px',font:'inherit',fontSize:'11px'}}/><input placeholder="New password" type="password" value={fpNewPw} onChange={e=>setFpNewPw(e.target.value)} style={{display:'block',width:'100%',background:'#08101a',border:'1px solid #294158',borderRadius:'8px',color:'#fff',padding:'11px',marginBottom:'8px',font:'inherit',fontSize:'11px'}}/><button className="adminPrimary adminWide" onClick={resetAdminPw} disabled={!fpOtp||!fpNewPw}>Reset Password →</button></>}
              <button type="button" onClick={()=>setForgotPw(false)} style={{background:'none',border:'none',color:'#526b84',fontSize:'9px',cursor:'pointer',marginTop:'8px'}}>Cancel</button>
            </div>}
          </div><span className="loginFoot">JTrader Academy · Built around discipline</span></div></div>;

  return <div className="adminPage"><style>{adminStyles}</style><aside className="adminSidebar"><button className="sidebarBrand" onClick={() => setTab('overview')}><img src="/assets/jtrader-logo.png" alt="JTrader Academy"/><span>JTRADER<small>ACADEMY</small></span></button><div className="sidebarLabel">WORKSPACE</div><nav>{navItems.map(([key, icon, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}><i>{icon}</i>{label}{key === 'course' && lessons.length > 0 && <b>{lessons.length}</b>}</button>)}</nav><div className="sidebarBottom"><div className="sidebarTip"><span>◒</span><div><b>Keep learning moving</b><small>Manage every lesson in one place.</small></div></div><button className="sidebarLogout" onClick={() => setEntered(false)}>↪ <span>Logout</span></button></div></aside><main className="adminMain"><header className="adminHeader"><div className="mobileBrand"><img src="/assets/jtrader-logo.png" alt="JTrader"/><b>JTRADER</b></div><div className="headerTitle"><span className="headerCrumb">JTRADER ACADEMY <b>/</b></span><h1>Admin Dashboard</h1></div><div className="headerProfile"><div className="profileAvatar">JA</div><div><b>JTrader Admin</b><small>Administrator</small></div><button onClick={() => setEntered(false)}>⌄</button></div></header>{newPayments.length > 0 && <div className="adminAlert success" style={{flexDirection:'column',alignItems:'flex-start',gap:'6px'}}><div style={{display:'flex',justifyContent:'space-between',width:'100%'}}><b>🔔 {newPayments.length} new payment{newPayments.length>1?'s':''} since your last visit!</b><button onClick={()=>setNewPayments([])}>×</button></div>{newPayments.map((s:any,i:number)=><div key={i} style={{fontSize:'9px',opacity:.85}}>💰 {s.name||s.email} — ₹{Number(s.amount||0).toLocaleString('en-IN')}</div>)}</div>}{error && <div className="adminAlert error">{error}<button onClick={() => setError('')}>×</button></div>}{notice && <div className="adminAlert success">{notice}<button onClick={() => setNotice('')}>×</button></div>}{tab === 'overview' && <Overview courses={courses} lessons={lessons} rows={rows} paid={paid} revenue={revenue} openCourse={openCourse}/>} {tab === 'courses' && <Courses courses={courses} lessons={lessons} openCourse={openCourse} saveCourse={saveCourse} setCourseStatus={setCourseStatus} loading={loading}/>} {tab === 'course' && <CourseManager courses={courses} selectedCourse={selectedCourse} setSelectedCourse={(id: string) => {setSelectedCourse(id); resetForm()}} selected={selected} courseLessons={courseLessons} form={form} setForm={setForm} file={file} setFile={setFile} setFileDuration={setFileDuration} saveLesson={saveLesson} removeLesson={removeLesson} resetForm={() => resetForm(courseLessons.length + 1)} loading={loading} uploadPct={uploadPct}/>} {tab === 'students' && <Students rows={rows} progress={progress} lessonCounts={lessonCounts} toggleBlock={toggleBlockStudent} exportCSV={exportCSV} activeBroadcast={activeBroadcast} broadcastMsg={broadcastMsg} setBroadcastMsg={setBroadcastMsg} sendBroadcast={sendBroadcast} clearBroadcast={clearBroadcast} loading={loading}/>} {tab === 'payments' && <Payments rows={rows} paid={paid} revenue={revenue}/>} {tab === 'community' && <CommunityManager/>} {tab === 'offer' && <OfferSettings offerSettings={offerSettings} setOfferSettings={setOfferSettings} saveOffer={saveOffer} loading={loading}/>} {tab === 'settings' && <Settings settings={settings} setSettings={setSettings} thumbnail={thumbnail} setThumbnail={setThumbnail} saveSettings={saveSettings} loading={loading}/>} {tab === 'account' && <AccountSettings/>}</main></div>;
}

function Overview({courses, lessons, rows, paid, revenue, openCourse}: {courses: Course[]; lessons: Lesson[]; rows: Student[]; paid: number; revenue: number; openCourse: (id: string) => void}) {
  return <div className="adminContent"><div className="welcomeRow"><div><span className="eyebrow">{new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}).toUpperCase()}</span><h2>Good morning, Admin.</h2><p>Here is what is happening across your academy today.</p></div><button className="adminPrimary" onClick={() => openCourse(courses[0]?.id || '')}>+ Add video lesson</button></div><section className="metricGrid"><Metric icon="◈" label="Total courses" value={courses.length} tone="blue"/><Metric icon="▤" label="Video lessons" value={lessons.length} tone="violet"/><Metric icon="♙" label="Total students" value={rows.length} tone="cyan"/><Metric icon="◌" label="Paid enrollments" value={paid} tone="green"/><Metric icon="₹" label="Revenue" value={`₹${revenue.toLocaleString('en-IN')}`} tone="gold"/></section><section className="sectionHeading"><div><span className="eyebrow">YOUR CATALOGUE</span><h3>Courses overview</h3></div><button className="textButton" onClick={() => openCourse(courses[0]?.id || '')}>Manage lessons →</button></section><div className="courseCardGrid">{courses.map((course, index) => <CourseCard key={course.id} course={course} lessonCount={lessons.filter(lesson => lesson.course_id === course.id).length} accent={index === 0 ? 'green' : 'blue'} openCourse={openCourse}/>)}</div><section className="lowerGrid"><div className="panel activityPanel"><div className="panelHeader"><div><span className="eyebrow">LATEST</span><h3>Recent enrollments</h3></div><button className="iconButton" aria-label="View students">•••</button></div>{rows.length === 0 ? <EmptyState icon="♙" text="No student enrollments yet"/> : rows.slice(0, 5).map(row => <StudentRow key={row.email} row={row}/>)}</div><div className="panel pulsePanel"><div className="panelHeader"><div><span className="eyebrow">ACADEMY PULSE</span><h3>Course activity</h3></div><span className="liveDot">● Live</span></div><div className="pulseChart"><span className="chartLine"/><span className="chartLine second"/><div className="chartLabels"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span></div></div><div className="pulseStats"><div><b>{lessons.filter(lesson => lesson.available).length}</b><small>Videos ready</small></div><div><b>{lessons.length - lessons.filter(lesson => lesson.available).length}</b><small>Awaiting video</small></div></div></div></section></div>;
}

function Metric({icon, label, value, tone}: {icon: string; label: string; value: string | number; tone: string}) { return <div className="metricCard"><span className={`metricIcon ${tone}`}>{icon}</span><div><small>{label}</small><strong>{value}</strong></div><span className="metricArrow">↗</span></div>; }
function CourseCard({course, lessonCount, accent, openCourse}: {course: Course; lessonCount: number; accent: string; openCourse: (id: string) => void}) { return <article className={`catalogueCard ${accent}`}><div className="catalogueVisual" style={{backgroundImage: `url('/assets/jtrader-cover.svg')`}}><span className="courseTag">{accent === 'green' ? 'FOUNDATIONS' : 'ADVANCED STRATEGY'}</span><span className="visualMark">↗</span></div><div className="catalogueBody"><div><span className="statusPill"><i/> Active</span><small>{lessonCount} video lessons</small></div><h4>{course.title}</h4><p>{course.description || 'Structured trading education with practical market examples.'}</p><div className="catalogueFooter"><b>₹{Number(course.price || 0).toLocaleString('en-IN')}</b><button className="manageButton" onClick={() => openCourse(course.id)}>Manage Course <span>→</span></button></div></div></article>; }
function CourseEditPanel({course, saveCourse, setCourseStatus, loading}: {course: Course; saveCourse: any; setCourseStatus: any; loading: boolean}) {
  const [form, setForm] = useState({title: course.title, price: course.price, oldPrice: course.old_price||0, description: course.description||'', access: course.access||'lifetime'});
  const [thumb, setThumb] = useState<File|null>(null);
  const [thumbUploading, setThumbUploading] = useState(false);
  const set = (k: string, v: any) => setForm(f => ({...f, [k]: v}));

  async function saveWithThumb() {
    if (thumb) {
      setThumbUploading(true);
      try {
        const fd = new FormData();
        fd.append('action','course-thumbnail');
        fd.append('courseId', course.id);
        fd.append('thumbnail', thumb);
        await api('/api/admin', {method:'POST', body: fd});
        setThumb(null);
      } catch(e:any) { /* thumbnail upload failed silently, continue */ }
      finally { setThumbUploading(false); }
    }
    saveCourse(course.id, form);
  }
  return (
    <section className="panel" style={{marginTop: '14px', padding: '20px'}}>
      <div className="panelHeader" style={{marginBottom: '14px'}}><div><span className="eyebrow">EDIT COURSE</span><h3>{course.title}</h3></div></div>
      <div className="settingsFields">
        <label style={{display:'block',color:'#8194a9',fontSize:'9px'}}>Course title
          <input value={form.title} onChange={e => set('title', e.target.value)} style={{display:'block',width:'100%',background:'#09111b',border:'1px solid #24384d',borderRadius:'7px',color:'#edf5ff',padding:'10px',marginTop:'5px',font:'inherit',fontSize:'11px'}}/>
        </label>
        <label style={{display:'block',color:'#8194a9',fontSize:'9px'}}>Description
          <input value={form.description} onChange={e => set('description', e.target.value)} style={{display:'block',width:'100%',background:'#09111b',border:'1px solid #24384d',borderRadius:'7px',color:'#edf5ff',padding:'10px',marginTop:'5px',font:'inherit',fontSize:'11px'}}/>
        </label>
        <label style={{display:'block',color:'#8194a9',fontSize:'9px'}}>Current price (₹)
          <input type="number" min="0" value={form.price} onChange={e => set('price', Number(e.target.value))} style={{display:'block',width:'100%',background:'#09111b',border:'1px solid #24384d',borderRadius:'7px',color:'#6ed9aa',padding:'10px',marginTop:'5px',font:'inherit',fontSize:'13px',fontWeight:700}}/>
        </label>
        <label style={{display:'block',color:'#8194a9',fontSize:'9px'}}>Original / crossed-out price (₹)
          <input type="number" min="0" value={form.oldPrice} onChange={e => set('oldPrice', Number(e.target.value))} style={{display:'block',width:'100%',background:'#09111b',border:'1px solid #24384d',borderRadius:'7px',color:'#8a9fb8',padding:'10px',marginTop:'5px',font:'inherit',fontSize:'13px'}}/>
        </label>
      </div>
      <label style={{display:'block',color:'#8194a9',fontSize:'9px',marginTop:'12px'}}>Access duration (applies to new purchases)
        <select value={form.access} onChange={e => set('access', e.target.value)} style={{display:'block',width:'100%',background:'#09111b',border:'1px solid #24384d',borderRadius:'7px',color:'#edf5ff',padding:'10px',marginTop:'5px',font:'inherit',fontSize:'11px'}}>
          <option value="lifetime">Lifetime access</option>
          <option value="1 year">1 Year</option>
          <option value="6 months">6 Months</option>
          <option value="3 months">3 Months</option>
          <option value="1 month">1 Month</option>
          <option value="30 days">30 Days</option>
          <option value="7 days">7 Days</option>
        </select>
        <small style={{color:'#4e6070',fontSize:'9px',marginTop:'4px',display:'block'}}>After this period expires, the student loses access to lessons and community.</small>
      </label>
      <label style={{display:'block',color:'#8194a9',fontSize:'9px',marginTop:'14px'}}>Course visibility
        <div style={{display:'flex',gap:'8px',marginTop:'6px'}}>
          {([['active','✅ Active','#275e44','rgba(21,52,38,.6)','#83ddb1'],['coming_soon','🔔 Coming Soon','#5a4a00','rgba(42,34,0,.6)','#f5c842'],['hidden','🚫 Hidden','#65303b','rgba(53,28,38,.6)','#ff9eaa']] as const).map(([val,label,border,bg,color])=>(
            <button key={val} onClick={()=>setCourseStatus(course.id,val)} disabled={loading} style={{flex:1,padding:'10px 8px',borderRadius:'8px',border:`1px solid ${(course.status||'active')===val?border:'#1e2d3e'}`,background:(course.status||'active')===val?bg:'transparent',color:(course.status||'active')===val?color:'#4e6070',fontSize:'10px',fontWeight:700,cursor:'pointer',transition:'all .2s'}}>
              {label}
            </button>
          ))}
        </div>
        {(course.status||'active')==='coming_soon'&&<p style={{color:'#f5c842',fontSize:'10px',margin:'6px 0 0'}}>⚠️ Course shows as "Coming Soon" — price is hidden, students cannot buy.</p>}
        {(course.status||'active')==='hidden'&&<p style={{color:'#ff9eaa',fontSize:'10px',margin:'6px 0 0'}}>⚠️ Course is completely hidden from all student pages.</p>}
      </label>
      <label style={{display:'block',color:'#8194a9',fontSize:'9px',marginTop:'14px'}}>Course thumbnail
        <label className="videoUpload thumbnailUpload" style={{marginTop:'6px',cursor:'pointer'}}>
          <span className="uploadIcon">▧</span>
          <b>{thumb ? thumb.name : course.thumbnail_key ? '✓ Thumbnail uploaded — click to replace' : 'Upload course thumbnail'}</b>
          <small>JPG, PNG or WebP · shown on the course card</small>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setThumb(e.target.files?.[0]||null)}/>
        </label>
        {course.thumbnail_key&&!thumb&&<img src={`/api/media?key=${encodeURIComponent(course.thumbnail_key)}`} alt="Current thumbnail" style={{marginTop:'8px',width:'100%',maxHeight:'120px',objectFit:'cover',borderRadius:'8px',border:'1px solid #1e2d3e'}}/>}
      </label>
      <button className="adminPrimary" style={{marginTop:'14px'}} onClick={saveWithThumb} disabled={loading||thumbUploading}>{thumbUploading?'Uploading thumbnail…':loading ? 'Saving...' : 'Save changes →'}</button>
    </section>
  );
}
function Courses({courses, lessons, openCourse, saveCourse, setCourseStatus, loading}: {courses: Course[]; lessons: Lesson[]; openCourse: (id: string) => void; saveCourse: any; setCourseStatus: any; loading: boolean}) {
  return (
    <div className="adminContent">
      <div className="pageIntro"><span className="eyebrow">COURSE CATALOGUE</span><h2>Manage your courses</h2><p>Update course prices, titles and descriptions. Changes apply instantly for new visitors.</p></div>
      {courses.map((course, index) => (
        <div key={course.id}>
          <div className="courseCardGrid coursePageGrid" style={{gridTemplateColumns:'1fr'}}>
            <CourseCard course={course} lessonCount={lessons.filter(l => l.course_id === course.id).length} accent={index === 0 ? 'green' : 'blue'} openCourse={openCourse}/>
          </div>
          <CourseEditPanel course={course} saveCourse={saveCourse} setCourseStatus={setCourseStatus} loading={loading}/>
        </div>
      ))}
    </div>
  );
}

function CourseManager({courses, selectedCourse, setSelectedCourse, selected, courseLessons, form, setForm, file, setFile, saveLesson, removeLesson, resetForm, loading, uploadPct}: any) {
  const uploading = uploadPct !== null; return <div className="adminContent"><div className="pageIntro managerIntro"><div><span className="eyebrow">VIDEO LESSONS</span><h2>{selected?.title || 'Course management'}</h2><p>Add, edit and organize practical lessons for this learning path.</p></div><select className="courseSelect" value={selectedCourse} onChange={event => setSelectedCourse(event.target.value)}>{courses.map((course: Course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></div><div className="managerLayout"><section className="panel lessonPanel"><div className="panelHeader"><div><span className="eyebrow">{courseLessons.length} LESSONS</span><h3>Lesson library</h3></div><span className="libraryHint">Drag order is controlled by position</span></div>{courseLessons.length === 0 ? <EmptyState icon="▤" text="No lessons added to this course yet"/> : <div className="lessonList">{courseLessons.map((lesson: Lesson, index: number) => <div className="lessonRow" key={lesson.id}><span className="lessonNumber">{String(index + 1).padStart(2, '0')}</span><div className="lessonThumb"><span>▶</span></div><div className="lessonInfo"><b>{lesson.title}</b><small>{lesson.module} · Position {lesson.position}</small><p>{lesson.description || 'No description added.'}</p></div><span className={lesson.available ? 'videoStatus ready' : 'videoStatus pending'}><i/>{lesson.available ? 'Video ready' : 'No video'}</span><div className="lessonActions"><button onClick={() => {setForm({...lesson});setFile(null)}}>Edit</button><button className="dangerText" onClick={() => removeLesson(lesson.id)}>Delete</button></div></div>)}</div>}</section><section className="panel lessonEditor"><div className="panelHeader"><div><span className="eyebrow">{form.id ? 'EDIT LESSON' : 'NEW LESSON'}</span><h3>{form.id ? 'Update lesson' : 'Add a video lesson'}</h3></div>{form.id && <button className="iconButton" onClick={resetForm}>×</button>}</div><label>Lesson title<input placeholder="e.g. Reading price action" value={form.title} onChange={event => setForm({...form, title: event.target.value})}/></label><label>Module<input placeholder="Module 1" value={form.module} onChange={event => setForm({...form, module: event.target.value})}/></label><div className="fieldPair"><label>Position<input type="number" min="1" value={form.position} onChange={event => setForm({...form, position: Number(event.target.value)})}/></label><label>Course<select value={selectedCourse} onChange={event => setSelectedCourse(event.target.value)}>{courses.map((course: Course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label></div><label>Description<textarea placeholder="What will students learn?" value={form.description} onChange={event => setForm({...form, description: event.target.value})}/></label><label className="videoUpload"><span className="uploadIcon">⌁</span><b>{file ? file.name : form.id ? 'Replace lesson video' : 'Upload lesson video'}</b><small>{file ? `${(file.size / 1048576).toFixed(1)} MB ready to upload` : 'MP4, WebM or MOV · up to 5GB'}</small><input type="file" accept="video/mp4,video/webm,video/quicktime" disabled={uploading} onChange={event => {const f=event.target.files?.[0]||null;setFile(f);if(f){getVideoDuration(f).then(d=>setFileDuration(d>0?d:null)).catch(()=>{});}else{setFileDuration(null);}}}/></label>{uploading && <div className="uploadProgress"><div className="uploadProgressHead"><b>{uploadPct < 100 ? 'Uploading video' : 'Finishing up'}</b><span>{uploadPct}%</span></div><div className="uploadTrack"><i style={{width: `${uploadPct}%`}}/></div><small>Keep this tab open until the upload finishes.</small></div>}<button className="adminPrimary adminWide" onClick={saveLesson} disabled={loading}>{uploading ? `Uploading ${uploadPct}%...` : loading ? 'Saving lesson...' : form.id ? 'Save changes' : 'Add lesson  →'}</button></section></div></div>; }

function Students({rows, progress, lessonCounts, toggleBlock, exportCSV, activeBroadcast, broadcastMsg, setBroadcastMsg, sendBroadcast, clearBroadcast, loading}: {rows: Student[]; progress: any[]; lessonCounts: Record<string,number>; toggleBlock:any; exportCSV:any; activeBroadcast:any; broadcastMsg:string; setBroadcastMsg:any; sendBroadcast:any; clearBroadcast:any; loading:boolean}) {
  function getProgress(email: string, courseId: string) {
    const student = rows.find(r => r.email === email) as any;
    if (!student) return null;
    const p = progress.find((x: any) => x.user_id === student.id && x.course_id === courseId);
    const total = lessonCounts[courseId] || 0;
    const done = p?.completed || 0;
    return total > 0 ? Math.round(done / total * 100) : 0;
  }
  return (
    <div className="adminContent">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:'24px',flexWrap:'wrap',gap:'12px'}}>
        <div className="pageIntro" style={{margin:0}}><span className="eyebrow">STUDENT DIRECTORY</span><h2 style={{margin:'8px 0 4px'}}>Students</h2><p style={{margin:0}}>Review enrollment, progress and manage access.</p></div>
        <button className="adminPrimary" onClick={exportCSV}>⬇ Export CSV</button>
      </div>

      {/* Broadcast Panel */}
      <section className="panel" style={{marginBottom:'20px'}}>
        <div className="panelHeader"><div><span className="eyebrow">BROADCAST</span><h3>Message all students</h3></div></div>
        {activeBroadcast && <div style={{background:'rgba(21,52,38,.5)',border:'1px solid #275e44',borderRadius:'8px',padding:'12px 14px',marginBottom:'12px',display:'flex',justifyContent:'space-between',alignItems:'center',gap:'10px'}}><div><span style={{fontSize:'9px',color:'#6ed9aa',fontWeight:900,letterSpacing:'1px'}}>ACTIVE BROADCAST</span><p style={{margin:'4px 0 0',fontSize:'12px',color:'#c8d3de'}}>{activeBroadcast.message}</p></div><button onClick={clearBroadcast} style={{background:'none',border:'1px solid #396b50',color:'#6ed9aa',borderRadius:'6px',padding:'6px 10px',fontSize:'9px',cursor:'pointer',whiteSpace:'nowrap'}}>Clear</button></div>}
        <textarea value={broadcastMsg} onChange={e=>setBroadcastMsg(e.target.value)} placeholder="Type a message to send to all students (in-app banner + email)..." style={{width:'100%',minHeight:'80px',background:'#09111b',border:'1px solid #24384d',borderRadius:'7px',color:'#edf5ff',padding:'11px',font:'inherit',fontSize:'11px',resize:'vertical',marginBottom:'10px'}}/>
        <button className="adminPrimary" onClick={sendBroadcast} disabled={loading||!broadcastMsg.trim()}>{loading?'Sending...':'📢 Send to All Students'}</button>
      </section>

      <section className="panel tablePanel">
        <div className="panelHeader"><div><span className="eyebrow">{rows.length} RECORDS</span><h3>All students</h3></div></div>
        {rows.length === 0 ? <EmptyState icon="♙" text="No student records yet"/> : (
          <div className="studentTable">
            {rows.map((row: any) => {
              const bPct = getProgress(row.email, 'basic-share-market');
              const oPct = getProgress(row.email, 'option-trading');
              const isBlocked = !!row.blocked;
              return (
                <div key={row.email} style={{opacity: isBlocked ? .6 : 1}}>
                  <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                    <div style={{flex:1}}><StudentRow row={row} detailed/></div>
                    <button onClick={()=>toggleBlock(row.id)} style={{background:isBlocked?'rgba(21,52,38,.6)':'rgba(53,28,38,.6)',border:`1px solid ${isBlocked?'#275e44':'#65303b'}`,color:isBlocked?'#83ddb1':'#ff9eaa',borderRadius:'6px',padding:'5px 10px',fontSize:'9px',fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>
                      {isBlocked ? '✓ Unblock' : '🚫 Block'}
                    </button>
                  </div>
                  {isBlocked && <div style={{fontSize:'9px',color:'#e1b46b',padding:'2px 0 6px 40px'}}>⚠️ Account suspended — student cannot login</div>}
                  <div style={{display:'flex',gap:'16px',padding:'4px 0 12px 40px',borderTop:'none'}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:'8px',color:'#6683a3',marginBottom:'4px'}}>BASIC COURSE</div>
                      <div style={{height:'5px',background:'#162235',borderRadius:'3px',overflow:'hidden'}}>
                        <div style={{width:`${bPct||0}%`,height:'100%',background:'#4d8fff',borderRadius:'3px',transition:'width .4s'}}/>
                      </div>
                      <div style={{fontSize:'8px',color:'#5a7090',marginTop:'3px'}}>{bPct !== null ? `${bPct}%` : 'Not enrolled'}</div>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:'8px',color:'#6683a3',marginBottom:'4px'}}>OPTION TRADING</div>
                      <div style={{height:'5px',background:'#162235',borderRadius:'3px',overflow:'hidden'}}>
                        <div style={{width:`${oPct||0}%`,height:'100%',background:'#f5a623',borderRadius:'3px',transition:'width .4s'}}/>
                      </div>
                      <div style={{fontSize:'8px',color:'#5a7090',marginTop:'3px'}}>{oPct !== null ? `${oPct}%` : 'Not enrolled'}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
function Payments({rows, paid, revenue}: {rows: Student[]; paid: number; revenue: number}) { return <div className="adminContent"><div className="pageIntro"><span className="eyebrow">REVENUE CENTER</span><h2>Payments</h2><p>Payment figures are based on the latest student payment records.</p></div><div className="metricGrid paymentMetrics"><Metric icon="₹" label="Recorded revenue" value={`₹${revenue.toLocaleString('en-IN')}`} tone="gold"/><Metric icon="✓" label="Paid enrollments" value={paid} tone="green"/><Metric icon="◌" label="Pending enrollments" value={rows.length - paid} tone="blue"/></div><section className="panel tablePanel"><div className="panelHeader"><div><span className="eyebrow">TRANSACTIONS</span><h3>Payment activity</h3></div></div>{rows.length === 0 ? <EmptyState icon="◌" text="No payment activity yet"/> : rows.map(row => <StudentRow key={row.email} row={row} detailed/>)}</section></div>; }
function Settings({settings, setSettings, thumbnail, setThumbnail, saveSettings, loading}: any) { return <div className="adminContent"><div className="pageIntro"><span className="eyebrow">ACADEMY SETTINGS</span><h2>Course settings</h2><p>Control the course information visible to students.</p></div><section className="panel settingsPanel"><div className="settingsHeader"><div className="settingsEmblem">⌘</div><div><span className="eyebrow">COURSE CONFIGURATION</span><h3>Public course details</h3></div></div><div className="settingsFields"><label>Course title<input value={settings.title} onChange={event => setSettings({...settings, title: event.target.value})}/></label><label>Access period<input value={settings.access} onChange={event => setSettings({...settings, access: event.target.value})}/></label><label>Price (₹)<input type="number" value={settings.price} onChange={event => setSettings({...settings, price: Number(event.target.value)})}/></label><label>Old price (₹)<input type="number" value={settings.old_price ?? settings.oldPrice} onChange={event => setSettings({...settings, old_price: Number(event.target.value)})}/></label></div><label>Description<textarea value={settings.description} onChange={event => setSettings({...settings, description: event.target.value})}/></label><label className="videoUpload thumbnailUpload"><span className="uploadIcon">▧</span><b>{thumbnail?.name || 'Upload course thumbnail'}</b><small>JPG, PNG or WebP image</small><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => setThumbnail(event.target.files?.[0] || null)}/></label><button className="adminPrimary" onClick={saveSettings} disabled={loading}>{loading ? 'Saving...' : 'Save settings  →'}</button></section></div>; }
function StudentRow({row, detailed}: {row: Student; detailed?: boolean}) { return <div className={`studentRow ${detailed ? 'detailed' : ''}`}><div className="studentAvatar">{(row.name || row.email).slice(0, 2).toUpperCase()}</div><div className="studentIdentity"><b>{row.name || 'Unnamed student'}</b><small>{row.email}</small></div>{detailed && <span>{row.city || '—'}</span>}<span>{row.created_at ? new Date(row.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('en-IN') : '—'}</span><strong>₹{Number(row.amount || 0).toLocaleString('en-IN')}</strong><span className={row.status === 'Paid' ? 'tablePaid' : 'tablePending'}>{row.status}</span></div>; }
function EmptyState({icon, text}: {icon: string; text: string}) { return <div className="emptyState"><span>{icon}</span><b>{text}</b><small>Activity will appear here when it is available.</small></div>; }

function CommunityManager() {
  const [posts, setPosts] = useState<any[]>([]);
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState('');

  async function loadPosts() {
    const data = await api('/api/data?type=community');
    setPosts(Array.isArray(data.posts) ? data.posts : []);
  }

  useEffect(() => { loadPosts().catch(() => {}); }, []);

  async function submit() {
    if (!note.trim() && !file) return;
    setPosting(true); setErr('');
    try {
      const form = new FormData();
      form.append('body', note.trim());
      form.append('section', 'admin');
      if (file) form.append('image', file);
      const r = await fetch('/api/data', {method: 'POST', body: form});
      const d = await r.json().catch(() => ({})) as any;
      if (!r.ok) throw Error(d.error || 'Post failed');
      setNote(''); setFile(null);
      await loadPosts();
    } catch(e: any) { setErr(e.message); }
    finally { setPosting(false); }
  }

  async function deletePost(id: string) {
    if (!confirm('Delete this post?')) return;
    await fetch('/api/data', {method: 'DELETE', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id})});
    await loadPosts();
  }

  return (
    <div className="adminContent">
      <div className="pageIntro">
        <span className="eyebrow">COMMUNITY</span>
        <h2>Community Manager</h2>
        <p>Post market analysis charts and comments visible to all enrolled students.</p>
      </div>

      <section className="panel" style={{marginBottom: '20px'}}>
        <div className="panelHeader"><div><span className="eyebrow">NEW POST</span><h3>Post to students</h3></div></div>
        <label style={{display:'block',color:'#8194a9',fontSize:'9px',marginBottom:'6px'}}>Caption / analysis note
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Write a market analysis or caption..." style={{display:'block',width:'100%',minHeight:'90px',background:'#09111b',border:'1px solid #24384d',borderRadius:'7px',color:'#edf5ff',padding:'11px',marginTop:'6px',font:'inherit',fontSize:'11px',resize:'vertical'}}/>
        </label>
        <label className="videoUpload thumbnailUpload" style={{marginTop:'10px'}}>
          <span className="uploadIcon">◧</span>
          <b>{file ? file.name : 'Attach chart image (optional)'}</b>
          <small>JPG, PNG, WebP — screenshot your chart</small>
          <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)}/>
        </label>
        {err && <div className="adminError" style={{marginTop:'10px'}}>{err}</div>}
        <button className="adminPrimary" style={{marginTop:'14px'}} onClick={submit} disabled={posting || (!note.trim() && !file)}>
          {posting ? 'Posting...' : 'Post to community →'}
        </button>
      </section>

      <section className="panel">
        <div className="panelHeader"><div><span className="eyebrow">{posts.length} POSTS</span><h3>All community posts</h3></div></div>
        {posts.length === 0 ? <EmptyState icon="◉" text="No community posts yet"/> : posts.map((p: any) => (
          <div key={p.id} style={{borderTop:'1px solid #192737',padding:'16px 0',display:'grid',gap:'10px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{display:'flex',gap:'10px',alignItems:'center'}}>
                <div className="studentAvatar" style={{background: p.user_role==='admin'?'#1d467c':'#1b2e48', color: p.user_role==='admin'?'#9dc8ff':'#91bdf1'}}>
                  {p.user_role==='admin'?'JA':(p.name||'?').slice(0,2).toUpperCase()}
                </div>
                <div>
                  <b style={{fontSize:'11px',display:'block'}}>{p.user_role==='admin'?'JTrader Analysis':p.name||'Student'}</b>
                  <small style={{color:'#667384',fontSize:'9px'}}>{p.section==='admin'?'Admin post':'Student post'} · {new Date(p.created_at).toLocaleDateString('en-IN')}</small>
                </div>
              </div>
              <button onClick={() => deletePost(p.id)} style={{background:'none',border:'1px solid #4a2233',color:'#d78080',borderRadius:'6px',padding:'5px 10px',fontSize:'9px',cursor:'pointer'}}>Delete</button>
            </div>
            {p.image_key && <img src={`/api/media?key=${encodeURIComponent(p.image_key)}`} alt="chart" style={{width:'100%',maxWidth:'640px',borderRadius:'8px',border:'1px solid #27313d'}}/>}
            {p.body && <p style={{margin:0,color:'#c8d3de',fontSize:'12px',lineHeight:1.6}}>{p.body}</p>}
          </div>
        ))}
      </section>
    </div>
  );
}

function OfferSettings({offerSettings, setOfferSettings, saveOffer, loading}: {offerSettings:any; setOfferSettings:any; saveOffer:()=>void; loading:boolean}) {
  const set = (key: string, val: any) => setOfferSettings((s:any) => ({...s,[key]:val}));
  return (
    <div className="adminContent">
      <div className="pageIntro">
        <span className="eyebrow">OFFER TIMING</span>
        <h2>Offer Cycle Settings</h2>
        <p>Control the countdown timer, prices and banner text shown to students on the home and courses pages.</p>
      </div>
      <section className="panel settingsPanel">
        <div className="settingsHeader" style={{marginBottom:'20px'}}>
          <div className="settingsEmblem">◷</div>
          <div><span className="eyebrow">OFFER CONTROLS</span><h3>Live offer configuration</h3></div>
        </div>
        <div className="settingsFields">
          <label>Offer enabled
            <select value={offerSettings.enabled?'1':'0'} onChange={e=>set('enabled',e.target.value==='1')} style={{display:'block',width:'100%',background:'#09111b',border:'1px solid #24384d',borderRadius:'7px',color:'#edf5ff',padding:'11px',marginTop:'6px',font:'inherit',fontSize:'11px'}}>
              <option value="1">✅ Enabled — banner is visible</option>
              <option value="0">⛔ Disabled — banner hidden</option>
            </select>
          </label>
          <label>Cycle duration (hours)
            <input type="number" min="0.5" max="168" step="0.5" value={offerSettings.cycleHours} onChange={e=>set('cycleHours',Number(e.target.value))}/>
            <small style={{color:'#6c829a',fontSize:'9px',marginTop:'4px',display:'block'}}>How long each countdown lasts. 9 = 9 hours, 24 = 1 day, etc.</small>
          </label>
        </div>
        <label>Banner headline
          <input value={offerSettings.bannerTitle} onChange={e=>set('bannerTitle',e.target.value)} placeholder="Build your market edge."/>
        </label>
        <div className="settingsFields" style={{marginTop:'16px'}}>
          <label>Basic course — "was" price (₹)
            <input type="number" min="0" value={offerSettings.basicOldPrice} onChange={e=>set('basicOldPrice',Number(e.target.value))}/>
            <small style={{color:'#6c829a',fontSize:'9px',marginTop:'4px',display:'block'}}>Shown as the crossed-out original price for Basic (₹1,500).</small>
          </label>
          <label>Option course — "was" price (₹)
            <input type="number" min="0" value={offerSettings.optionOldPrice} onChange={e=>set('optionOldPrice',Number(e.target.value))}/>
            <small style={{color:'#6c829a',fontSize:'9px',marginTop:'4px',display:'block'}}>Shown as the crossed-out original price for Option (₹9,999).</small>
          </label>
        </div>
        <div style={{borderTop:'1px solid #1a2635',marginTop:'28px',paddingTop:'24px'}}>
          <span className="eyebrow" style={{display:'block',marginBottom:'14px'}}>SOCIAL PROOF POPUP</span>
          <label style={{display:'block',color:'#8194a9',fontSize:'9px',marginBottom:'6px'}}>SHOW POPUP TO VISITORS</label>
          <select value={offerSettings.socialProofEnabled?'1':'0'} onChange={e=>set('socialProofEnabled',e.target.value==='1')} style={{display:'block',width:'100%',background:'#09111b',border:'1px solid #24384d',borderRadius:'7px',color:'#edf5ff',padding:'11px',font:'inherit',fontSize:'11px',marginBottom:'12px'}}>
            <option value="1">Enabled</option>
            <option value="0">Disabled</option>
          </select>
          <label style={{display:'block',color:'#8194a9',fontSize:'9px',marginBottom:'6px'}}>COURSE TO SHOW IN POPUP</label>
          <select value={offerSettings.socialProofCourse} onChange={e=>set('socialProofCourse',e.target.value)} style={{display:'block',width:'100%',background:'#09111b',border:'1px solid #24384d',borderRadius:'7px',color:'#edf5ff',padding:'11px',font:'inherit',fontSize:'11px'}}>
            <option value="basic-share-market">Basic of Share Market only</option>
            <option value="option-trading">Option Trading Course only</option>
            <option value="both">Both courses</option>
          </select>
        </div>
        <button className="adminPrimary" style={{marginTop:'22px'}} onClick={saveOffer} disabled={loading}>{loading?'Saving...':'Save offer settings →'}</button>
      </section>
    </div>
  );
}

function AccountSettings() {
  const [step, setStep] = useState<'idle'|'otp'>('idle');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPw, setNewPw] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/auth').then((d: any) => setEmail(d?.user?.email || '')).catch(() => {});
  }, []);

  async function sendOtp() {
    setBusy(true); setErr(''); setMsg('');
    try {
      await api('/api/auth?action=forgot-password', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email}),
      });
      setMsg('OTP sent to your email. Valid for 10 minutes.');
      setStep('otp');
    } catch (e: any) {
      setErr(e.message || 'Failed to send OTP');
    } finally {
      setBusy(false);
    }
  }

  async function resetPw() {
    setBusy(true); setErr(''); setMsg('');
    try {
      await api('/api/auth?action=reset-password', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email, otp, newPassword: newPw}),
      });
      setMsg('Password changed successfully.');
      setStep('idle'); setOtp(''); setNewPw('');
    } catch (e: any) {
      setErr(e.message || 'Invalid OTP or password too short');
    } finally {
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    display:'block',width:'100%',background:'#08101a',border:'1px solid #294158',
    borderRadius:'8px',color:'#fff',padding:'12px',font:'inherit',fontSize:'12px',
    outline:'none',boxSizing:'border-box',
  };

  return (
    <div className="adminContent">
      <div className="welcomeRow" style={{alignItems:'start'}}>
        <div>
          <span className="eyebrow">ADMIN</span>
          <h2>Account Settings</h2>
          <p>Manage your admin account security.</p>
        </div>
      </div>
      <div className="panel" style={{maxWidth:'460px',marginTop:'24px',padding:'28px'}}>
        <h3 style={{margin:'0 0 5px',fontSize:'15px'}}>Change Password</h3>
        <p style={{color:'#7a8899',fontSize:'11px',margin:'0 0 20px',lineHeight:1.6}}>
          An OTP will be sent to your registered email. Enter it below along with your new password.
        </p>
        {msg && <div style={{color:'#6ed9aa',fontSize:'11px',marginBottom:'14px',padding:'10px 14px',background:'rgba(21,52,38,.6)',borderRadius:'8px',border:'1px solid rgba(100,210,160,.2)'}}>{msg}</div>}
        {err && <div style={{color:'#ff9eaa',fontSize:'11px',marginBottom:'14px',padding:'10px 14px',background:'rgba(53,28,38,.6)',borderRadius:'8px',border:'1px solid rgba(180,80,100,.2)'}}>{err}</div>}
        <div style={{marginBottom:'16px'}}>
          <label style={{display:'block',color:'#7f8a99',fontSize:'9px',letterSpacing:'1px',marginBottom:'6px'}}>YOUR EMAIL</label>
          <div style={{background:'#0a0f17',border:'1px solid #1f2c3a',borderRadius:'8px',padding:'12px',color:'#8a9baf',fontSize:'12px'}}>{email || '—'}</div>
        </div>
        {step === 'idle' && (
          <button className="adminPrimary" onClick={sendOtp} disabled={busy || !email}>
            {busy ? 'Sending…' : 'Send OTP to email →'}
          </button>
        )}
        {step === 'otp' && (
          <>
            <div style={{marginBottom:'12px'}}>
              <label style={{display:'block',color:'#7f8a99',fontSize:'9px',letterSpacing:'1px',marginBottom:'6px'}}>6-DIGIT OTP</label>
              <input style={inputStyle} value={otp} onChange={e=>setOtp(e.target.value)} maxLength={6} placeholder="Enter OTP from email"/>
            </div>
            <div style={{marginBottom:'18px'}}>
              <label style={{display:'block',color:'#7f8a99',fontSize:'9px',letterSpacing:'1px',marginBottom:'6px'}}>NEW PASSWORD</label>
              <input style={inputStyle} type="password" value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="Minimum 8 characters"/>
            </div>
            <div style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
              <button className="adminPrimary" onClick={resetPw} disabled={busy || !otp || !newPw}>
                {busy ? 'Updating…' : 'Update Password →'}
              </button>
              <button onClick={()=>{setStep('idle');setOtp('');setNewPw('');setErr('');setMsg('');}} style={{border:'1px solid #27313d',padding:'11px 17px',borderRadius:'8px',fontSize:'11px',color:'#8a9baf',background:'none',cursor:'pointer'}}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const adminStyles = `
.adminPage{min-height:100vh;background:#070b12;color:#f4f7fb;font-family:Inter,system-ui,sans-serif;display:flex}.adminPage *{box-sizing:border-box}.adminSidebar{width:248px;flex:0 0 248px;background:#0b111b;border-right:1px solid #1b2737;display:flex;flex-direction:column;padding:26px 16px;min-height:100vh}.sidebarBrand{display:flex;align-items:center;gap:11px;color:#fff;text-align:left;padding:0 11px;margin-bottom:56px}.sidebarBrand img{width:39px;height:39px;object-fit:contain}.sidebarBrand span{font-size:14px;font-weight:950;letter-spacing:1.5px}.sidebarBrand small{display:block;color:#6b7c91;font-size:7px;letter-spacing:2.8px;margin-top:3px}.sidebarLabel,.eyebrow{color:#6883a3;font-size:9px;font-weight:900;letter-spacing:1.8px}.sidebarLabel{padding:0 14px 12px}.adminSidebar nav{display:grid;gap:5px}.adminSidebar nav button,.sidebarLogout{border:0;background:transparent;color:#7e8da1;display:flex;align-items:center;gap:13px;padding:13px 14px;border-radius:9px;font-size:12px;text-align:left;width:100%;cursor:pointer}.adminSidebar nav button i{font-style:normal;font-size:17px;width:19px;text-align:center;color:#738aa7}.adminSidebar nav button b{margin-left:auto;background:#17365d;color:#75a9e9;border-radius:20px;padding:3px 7px;font-size:9px}.adminSidebar nav button:hover,.adminSidebar nav button.active{background:#142237;color:#fff}.adminSidebar nav button.active i{color:#73aaff}.sidebarBottom{margin-top:auto}.sidebarTip{border:1px solid #1c314b;background:#101d2e;border-radius:11px;padding:13px 10px;display:flex;gap:9px;margin:0 3px 20px}.sidebarTip>span{color:#6fa8ff;font-size:20px}.sidebarTip b,.sidebarTip small{display:block}.sidebarTip b{font-size:10px}.sidebarTip small{color:#7489a2;font-size:8px;line-height:1.5;margin-top:4px}.sidebarLogout{border-top:1px solid #1a2635;border-radius:0;padding:18px 14px 0;color:#7a899b}.sidebarLogout:hover{color:#fff}.adminMain{flex:1;min-width:0}.adminHeader{height:88px;border-bottom:1px solid #1a2635;background:#0a1019;display:flex;align-items:center;justify-content:space-between;padding:0 clamp(22px,4vw,54px);gap:20px}.headerCrumb{color:#687b91;font-size:9px;letter-spacing:1.5px}.headerCrumb b{color:#304255;margin:0 8px}.headerTitle h1{font-size:20px;letter-spacing:-.5px;margin:7px 0 0}.headerProfile{display:flex;align-items:center;gap:10px}.headerProfile b,.headerProfile small{display:block}.headerProfile b{font-size:11px}.headerProfile small{color:#73859a;font-size:9px;margin-top:4px}.headerProfile button{color:#70839b;background:none;border:0;font-size:17px;cursor:pointer}.profileAvatar,.studentAvatar{display:grid;place-items:center;border-radius:50%;font-weight:900}.profileAvatar{width:36px;height:36px;background:#1d467c;color:#9dc8ff;font-size:10px}.adminContent{max-width:1450px;margin:0 auto;padding:40px clamp(22px,4vw,54px) 64px}.welcomeRow,.pageIntro,.sectionHeading,.panelHeader,.settingsHeader{display:flex;align-items:end;justify-content:space-between;gap:22px}.welcomeRow h2,.pageIntro h2{font-size:30px;letter-spacing:-1.3px;margin:9px 0 5px}.welcomeRow p,.pageIntro p{color:#8190a1;font-size:12px;margin:0}.adminPrimary{border:0;border-radius:8px;padding:12px 16px;background:#f1f6fc;color:#08101a;font-size:11px;font-weight:900;cursor:pointer;transition:.2s}.adminPrimary:hover{background:#7bb1ff;box-shadow:0 8px 25px #4b8fe333}.adminPrimary:disabled{opacity:.6;cursor:wait}.metricGrid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:32px 0 48px}.metricCard{min-height:106px;background:#0d1622;border:1px solid #1b2b3d;border-radius:11px;padding:17px;display:flex;align-items:center;gap:12px;position:relative}.metricCard:hover,.catalogueCard:hover,.panel:hover{border-color:#34587d;box-shadow:0 12px 32px #0003;transform:translateY(-2px)}.metricCard,.catalogueCard,.panel{transition:.2s}.metricCard small,.metricCard strong{display:block}.metricCard small{color:#7c8fa5;font-size:9px}.metricCard strong{font-size:22px;margin-top:7px;letter-spacing:-.6px}.metricIcon{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;font-size:17px}.metricIcon.blue{background:#153153;color:#75aeff}.metricIcon.violet{background:#292253;color:#a79aff}.metricIcon.cyan{background:#123c45;color:#62d8e0}.metricIcon.green{background:#14392e;color:#6ed9aa}.metricIcon.gold{background:#41321a;color:#efc466}.metricArrow{position:absolute;right:13px;top:12px;color:#5b718b;font-size:14px}.sectionHeading{margin-bottom:18px}.sectionHeading h3,.panelHeader h3{font-size:17px;margin:7px 0 0;letter-spacing:-.3px}.textButton{border:0;background:none;color:#81b5f1;font-size:10px;cursor:pointer}.courseCardGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.catalogueCard{border:1px solid #203246;background:#0d1621;border-radius:13px;overflow:hidden}.catalogueVisual{height:174px;background-color:#102238;background-position:center;background-size:cover;position:relative;overflow:hidden}.catalogueVisual:after{content:'';position:absolute;inset:0;background:linear-gradient(110deg,#0a1522aa,#102c25aa)}.catalogueCard.blue .catalogueVisual:after{background:linear-gradient(110deg,#102344cc,#122f4b88)}.courseTag{position:absolute;z-index:1;left:17px;top:16px;background:#b8efcf;color:#082316;border-radius:20px;padding:6px 9px;font-size:8px;font-weight:900;letter-spacing:1px}.blue .courseTag{background:#9bc5ff;color:#0b2341}.visualMark{position:absolute;z-index:1;right:24px;bottom:-18px;font-size:145px;font-weight:900;color:#b8efcf66;transform:rotate(-10deg)}.blue .visualMark{color:#9bc5ff55}.catalogueBody{padding:18px 19px 19px}.catalogueBody>div:first-child{display:flex;justify-content:space-between;align-items:center}.catalogueBody>div small{color:#778ba2;font-size:9px}.statusPill{color:#6ed9aa;font-size:9px;font-weight:900}.statusPill i,.videoStatus i{display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;margin-right:5px}.catalogueBody h4{font-size:21px;letter-spacing:-.5px;margin:13px 0 7px}.catalogueBody p{color:#7c8ea3;line-height:1.6;font-size:10px;min-height:32px;margin:0}.catalogueFooter{display:flex;justify-content:space-between;align-items:center;margin-top:20px}.catalogueFooter>b{font-size:19px;color:#a7cdfd}.manageButton{background:#17283d;color:#c8ddf5;border:1px solid #274566;border-radius:7px;padding:10px 12px;font-size:10px;font-weight:900;cursor:pointer}.manageButton:hover{background:#274e7a;color:#fff}.manageButton span{margin-left:10px}.lowerGrid{display:grid;grid-template-columns:1.2fr .8fr;gap:16px;margin-top:44px}.panel{border:1px solid #1b2b3d;background:#0c141f;border-radius:13px;padding:21px}.panelHeader{align-items:start;margin-bottom:18px}.iconButton{border:0;background:none;color:#6d829a;font-size:15px;cursor:pointer}.liveDot{color:#65d19d;font-size:9px;font-weight:900}.pulseChart{height:136px;margin:10px 0 16px;position:relative;background:repeating-linear-gradient(0deg,transparent 0 33px,#1b2a3a 34px),repeating-linear-gradient(90deg,transparent 0 75px,#152333 76px);overflow:hidden}.chartLine{position:absolute;width:110%;height:70px;left:-5%;top:31px;border-top:2px solid #61b4ff;transform:skewY(-12deg) rotate(4deg);box-shadow:0 -5px 20px #419dff33}.chartLine.second{top:75px;border-color:#5dd6a1;transform:skewY(10deg) rotate(-3deg);opacity:.55}.chartLabels{position:absolute;bottom:5px;left:10px;right:10px;display:flex;justify-content:space-between;color:#586c82;font-size:8px}.pulseStats{display:flex;gap:35px}.pulseStats b,.pulseStats small{display:block}.pulseStats b{font-size:18px}.pulseStats small{color:#788ca2;font-size:9px;margin-top:3px}.studentRow{display:grid;grid-template-columns:30px 1fr auto auto;gap:10px;align-items:center;padding:12px 0;border-top:1px solid #182636}.studentRow.detailed{grid-template-columns:30px minmax(160px,1fr) 100px 100px 86px 75px}.studentAvatar{width:29px;height:29px;background:#1b2e48;color:#91bdf1;font-size:9px}.studentIdentity b,.studentIdentity small{display:block}.studentIdentity b{font-size:10px}.studentIdentity small,.studentRow>span,.studentRow>strong{color:#788da4;font-size:9px}.studentRow>strong{color:#d6e5f8}.tablePaid{color:#64d6a1!important}.tablePending{color:#e1b46b!important}.pageIntro{align-items:start;display:block;margin-bottom:32px}.pageIntro h2{margin-top:10px}.coursePageGrid{margin-top:10px}.managerIntro{display:flex}.managerLayout{display:grid;grid-template-columns:minmax(0,1.4fr) 370px;gap:16px}.libraryHint{color:#697e96;font-size:9px}.lessonList{display:grid}.lessonRow{display:grid;grid-template-columns:30px 54px minmax(180px,1fr) auto auto;gap:12px;align-items:center;border-top:1px solid #192737;padding:14px 0}.lessonNumber{font-size:10px;color:#6683a3;font-weight:900}.lessonThumb{width:54px;height:42px;border-radius:7px;background:linear-gradient(135deg,#173657,#102433);display:grid;place-items:center;color:#8ac1ff}.lessonThumb span{border:1px solid #8ac1ff;border-radius:50%;width:19px;height:19px;display:grid;place-items:center;font-size:8px;padding-left:1px}.lessonInfo b,.lessonInfo small,.lessonInfo p{display:block}.lessonInfo b{font-size:11px}.lessonInfo small{color:#7a91a9;font-size:9px;margin-top:4px}.lessonInfo p{color:#637990;font-size:9px;margin:5px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:350px}.videoStatus{font-size:9px;white-space:nowrap}.videoStatus.ready{color:#65d19d}.videoStatus.pending{color:#dba96a}.lessonActions{display:flex;gap:8px}.lessonActions button{border:0;background:none;color:#80b3ed;font-size:9px;cursor:pointer}.lessonActions .dangerText{color:#d78080}.lessonEditor label,.settingsPanel label{display:block;color:#8194a9;font-size:9px;margin-top:13px}.lessonEditor input,.lessonEditor select,.lessonEditor textarea,.settingsPanel input,.settingsPanel textarea,.courseSelect{display:block;width:100%;background:#09111b;border:1px solid #24384d;border-radius:7px;color:#edf5ff;outline:0;padding:11px;margin-top:6px;font:inherit;font-size:11px}.lessonEditor input:focus,.lessonEditor select:focus,.lessonEditor textarea:focus,.settingsPanel input:focus,.settingsPanel textarea:focus,.courseSelect:focus{border-color:#6ba8ed}.lessonEditor textarea,.settingsPanel textarea{min-height:93px;resize:vertical}.fieldPair,.settingsFields{display:grid;grid-template-columns:1fr 1fr;gap:10px}.videoUpload{display:block!important;border:1px dashed #34516f;border-radius:8px;padding:14px 13px;cursor:pointer;text-align:left}.videoUpload:hover{border-color:#73b1ed;background:#102139}.videoUpload b,.videoUpload small{display:block}.videoUpload b{color:#d7e8fa;font-size:10px}.videoUpload small{color:#6c829a;font-size:8px;margin-top:5px}.videoUpload .uploadIcon{float:right;color:#6faef0;font-size:22px}.videoUpload input{display:none}.uploadProgress{margin-top:13px;border:1px solid #24384d;background:#09111b;border-radius:8px;padding:12px}.uploadProgressHead{display:flex;justify-content:space-between;align-items:center}.uploadProgressHead b{font-size:10px;color:#d7e8fa}.uploadProgressHead span{font-size:11px;font-weight:900;color:#7bb1ff;font-variant-numeric:tabular-nums}.uploadTrack{height:6px;border-radius:20px;background:#16273a;overflow:hidden;margin:9px 0 7px}.uploadTrack i{display:block;height:100%;border-radius:20px;background:linear-gradient(90deg,#4b8fe3,#6ed9aa);transition:width .25s ease}.uploadProgress small{display:block;color:#6c829a;font-size:8px}.lessonEditor .adminPrimary{margin-top:15px}.settingsPanel{max-width:800px}.settingsHeader{justify-content:start;align-items:center;margin-bottom:20px}.settingsEmblem{width:42px;height:42px;display:grid;place-items:center;border-radius:11px;background:#1c3354;color:#8bc1ff;font-size:23px}.settingsPanel>label{margin-top:17px}.thumbnailUpload{margin-top:16px!important}.adminAlert{margin:18px clamp(22px,4vw,54px) 0;padding:11px 14px;border-radius:8px;font-size:10px;display:flex;justify-content:space-between}.adminAlert.error{background:#351c26;color:#ff9eaa;border:1px solid #65303b}.adminAlert.success{background:#153426;color:#83ddb1;border:1px solid #275e44}.adminAlert button{background:none;border:0;color:inherit;cursor:pointer}.emptyState{text-align:center;padding:45px 20px;color:#6f849c}.emptyState span{display:block;font-size:25px;color:#5684b7;margin-bottom:12px}.emptyState b,.emptyState small{display:block}.emptyState b{font-size:11px;color:#a9bdd2}.emptyState small{font-size:9px;margin-top:6px}.adminLoginPage{display:block;background:radial-gradient(circle at 80% 20%,#102844,#070b12 45%)}.adminLoginShell{width:min(440px,calc(100% - 40px));margin:0 auto;padding:38px 0 30px;min-height:100vh;display:flex;flex-direction:column;align-items:center}.adminBack{align-self:flex-start;background:none;border:0;color:#8ca1b7;font-size:11px;cursor:pointer}.adminLoginBrand{display:flex;align-items:center;gap:10px;margin:52px 0 30px;font-weight:950;letter-spacing:1.7px}.adminLoginBrand img{width:48px;height:48px}.adminLoginBrand small{display:block;color:#6f88a3;font-size:8px;letter-spacing:3px;margin-top:4px}.adminLoginCard{width:100%;background:#0d1724;border:1px solid #253a52;border-radius:15px;padding:31px;box-shadow:0 24px 70px #0005}.adminLoginCard h1{font-size:29px;letter-spacing:-1px;margin:10px 0 7px}.adminLoginCard p{color:#8394a8;font-size:11px;line-height:1.6;margin:0 0 25px}.adminLoginCard label{display:block;color:#8ea1b6;font-size:9px;margin-top:14px}.adminLoginCard input{display:block;width:100%;background:#08101a;border:1px solid #294158;border-radius:8px;color:#fff;padding:13px;margin-top:6px;outline:0;font:inherit;font-size:12px}.adminLoginCard input:focus{border-color:#76b6f6}.loginMark{width:40px;height:40px;border-radius:11px;background:#19375a;color:#87bdff;display:grid;place-items:center;font-size:26px}.adminWide{width:100%;margin-top:21px}.adminError{color:#ff9eaa;background:#351d28;border:1px solid #693444;border-radius:7px;padding:10px;font-size:10px;margin-top:12px}.loginFoot{color:#526b84;font-size:9px;margin-top:auto}.mobileBrand{display:none}@media(max-width:1050px){.metricGrid{grid-template-columns:repeat(3,1fr)}.managerLayout{grid-template-columns:1fr}.lessonEditor{max-width:none}.lessonEditor{order:-1}}@media(max-width:760px){.adminSidebar{width:68px;flex-basis:68px;padding:20px 8px}.sidebarBrand{padding:0;justify-content:center;margin-bottom:35px}.sidebarBrand img{width:38px}.sidebarBrand span,.sidebarLabel,.sidebarTip,.sidebarLogout span{display:none}.adminSidebar nav button{justify-content:center;padding:13px 6px}.adminSidebar nav button i{font-size:19px}.adminSidebar nav button b{position:absolute;margin:0 0 28px 28px}.adminHeader{height:74px;padding:0 17px}.headerTitle{display:none}.mobileBrand{display:flex;align-items:center;gap:8px;font-size:12px}.mobileBrand img{width:31px}.headerProfile>div:not(.profileAvatar),.headerProfile button{display:none}.adminContent{padding:28px 16px 48px}.welcomeRow{display:block}.welcomeRow h2,.pageIntro h2{font-size:25px}.welcomeRow .adminPrimary{margin-top:20px;width:100%}.metricGrid{grid-template-columns:1fr 1fr;margin:26px 0 34px}.metricCard{min-height:92px;padding:13px 10px;gap:8px}.metricCard strong{font-size:17px}.metricIcon{width:28px;height:28px;font-size:14px}.metricArrow{display:none}.courseCardGrid,.lowerGrid{grid-template-columns:1fr}.catalogueVisual{height:145px}.managerIntro{display:block}.courseSelect{margin-top:20px}.lessonRow{grid-template-columns:24px 46px minmax(0,1fr);gap:8px}.lessonThumb{width:46px;height:38px}.videoStatus{grid-column:3}.lessonActions{grid-column:3}.lessonInfo p{display:none}.libraryHint{display:none}.studentRow.detailed{grid-template-columns:30px 1fr auto}.studentRow.detailed>span:nth-last-child(3){display:none}.studentRow.detailed>strong{display:none}.settingsFields,.fieldPair{grid-template-columns:1fr}.panel{padding:16px}.adminLoginCard{padding:24px}.adminLoginBrand{margin-top:42px}}

/* ── 3D Glass Admin Theme ── */
@keyframes adminIn{from{opacity:0;transform:translateX(48px)}to{opacity:1;transform:translateX(0)}}
.adminContent{animation:adminIn .42s cubic-bezier(.16,1,.3,1)}
.adminPage{background:radial-gradient(ellipse 65% 50% at 5% 0%,rgba(12,38,95,.42) 0%,transparent 60%),radial-gradient(ellipse 50% 45% at 95% 100%,rgba(8,48,22,.32) 0%,transparent 60%),#030507!important}
.adminSidebar{background:rgba(4,8,17,.88)!important;backdrop-filter:blur(32px) saturate(1.5)!important;border-right:1px solid rgba(255,255,255,.055)!important;box-shadow:4px 0 30px rgba(0,0,0,.4)!important}
.adminHeader{background:rgba(3,7,14,.9)!important;backdrop-filter:blur(28px)!important;border-bottom:1px solid rgba(255,255,255,.05)!important;box-shadow:0 4px 24px rgba(0,0,0,.45)!important}
.panel{background:rgba(7,13,22,.65)!important;backdrop-filter:blur(22px)!important;border:1px solid rgba(255,255,255,.068)!important;box-shadow:0 8px 36px rgba(0,0,0,.52),inset 0 1px 0 rgba(255,255,255,.04)!important}
.metricCard{background:rgba(8,14,24,.72)!important;backdrop-filter:blur(20px)!important;border:1px solid rgba(255,255,255,.07)!important;box-shadow:0 8px 28px rgba(0,0,0,.48)!important;transition:transform .28s cubic-bezier(.16,1,.3,1),box-shadow .28s!important}
.metricCard:hover{transform:translateY(-6px) scale(1.025)!important;box-shadow:0 20px 55px rgba(0,0,0,.65)!important;border-color:rgba(80,130,255,.2)!important}
.catalogueCard{background:rgba(8,14,22,.72)!important;backdrop-filter:blur(20px)!important;border:1px solid rgba(255,255,255,.075)!important;transition:transform .3s cubic-bezier(.16,1,.3,1),box-shadow .3s!important}
.catalogueCard:hover{transform:translateY(-9px) scale(1.015)!important;box-shadow:0 32px 85px rgba(0,0,0,.7)!important}
.adminPrimary{background:linear-gradient(135deg,#f1f6fc,#c5daf5)!important;box-shadow:0 4px 18px rgba(190,225,255,.16),0 2px 6px rgba(0,0,0,.35)!important;transition:transform .2s cubic-bezier(.16,1,.3,1),box-shadow .2s,background .2s!important}
.adminPrimary:hover:not(:disabled){transform:translateY(-3px) scale(1.02)!important;box-shadow:0 10px 32px rgba(170,215,255,.22),0 4px 10px rgba(0,0,0,.45)!important;background:linear-gradient(135deg,#fff,#d8eeff)!important}
.adminPrimary:active:not(:disabled){transform:translateY(-1px)!important}
.adminSidebar nav button{transition:transform .18s cubic-bezier(.16,1,.3,1),background .18s!important}
.adminSidebar nav button:hover{transform:translateX(5px)!important}
.adminSidebar nav button.active{transform:translateX(5px)!important;background:rgba(20,50,90,.7)!important;backdrop-filter:blur(10px)!important}
.sidebarTip{background:rgba(12,24,48,.7)!important;backdrop-filter:blur(12px)!important;border:1px solid rgba(80,130,255,.14)!important}
.manageButton{transition:transform .18s,box-shadow .18s!important}
.manageButton:hover{transform:translateY(-2px)!important;box-shadow:0 6px 18px rgba(0,0,0,.4)!important}
.lessonRow{transition:background .18s,transform .18s!important}
.lessonRow:hover{background:rgba(18,32,58,.55)!important;transform:translateX(4px)!important}
.studentRow{transition:background .18s!important}
.studentRow:hover{background:rgba(16,28,50,.5)!important}
.welcomeRow h2,.pageIntro h2{background:linear-gradient(120deg,#f0f6ff 30%,#7aaed8 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.adminLoginPage{background:radial-gradient(ellipse 70% 55% at 80% 20%,rgba(12,36,80,.7),#030507 55%)!important}
.adminLoginCard{background:rgba(7,14,28,.88)!important;backdrop-filter:blur(32px)!important;border:1px solid rgba(255,255,255,.08)!important;box-shadow:0 40px 100px rgba(0,0,0,.65),0 0 0 1px rgba(255,255,255,.04)!important}
.adminLoginCard input:focus{border-color:rgba(90,145,255,.5)!important;box-shadow:0 0 0 3px rgba(60,110,220,.12)!important}
.lessonEditor input:focus,.lessonEditor select:focus,.lessonEditor textarea:focus,.settingsPanel input:focus,.settingsPanel textarea:focus,.courseSelect:focus{border-color:rgba(90,145,255,.5)!important;box-shadow:0 0 0 3px rgba(60,110,220,.1)!important}
.adminAlert.error{background:rgba(53,28,38,.85)!important;backdrop-filter:blur(12px)!important}
.adminAlert.success{background:rgba(21,52,38,.85)!important;backdrop-filter:blur(12px)!important}
.videoUpload:hover{background:rgba(12,26,48,.8)!important;border-color:rgba(80,160,240,.4)!important}
`;
