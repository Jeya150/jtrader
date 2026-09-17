import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

export const Route = createFileRoute('/')({
  component: Home,
})

const api = async (path: string, options?: RequestInit) => {
  const response = await fetch(path, options)
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error || 'Request failed')
  }

  return data
}

type Course = {
  id: 'basic' | 'options'
  name: string
  price: number
  oldPrice: number
  description: string
  lessons: string
  badge: string
  theme: 'green' | 'red'
}

const COURSES: Course[] = [
  {
    id: 'basic',
    name: 'Basic of Share Market',
    price: 1500,
    oldPrice: 1999,
    description:
      'Understand how the share market works, key concepts, analysis basics and more. Perfect for beginners.',
    lessons: '19+ Lessons',
    badge: 'BEGINNER FRIENDLY',
    theme: 'green',
  },
  {
    id: 'options',
    name: 'Option Trading Course',
    price: 9999,
    oldPrice: 12999,
    description:
      'Complete options trading course with strategies, risk management, live examples and trade execution.',
    lessons: '40+ Lessons',
    badge: 'MOST POPULAR',
    theme: 'red',
  },
]

function loadRazorpayScript() {
  return new Promise<boolean>((resolve) => {
    if (document.getElementById('razorpay-checkout')) {
      resolve(true)
      return
    }

    const script = document.createElement('script')
    script.id = 'razorpay-checkout'
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)

    document.body.appendChild(script)
  })
}

function Home() {
  const [me, setMe] = useState<any>(null)
  const [tab, setTab] = useState('home')
  const [auth, setAuth] = useState<'login' | 'register'>('login')
  const [admin, setAdmin] = useState(false)
  const [adminIn, setAdminIn] = useState(false)

  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null)
  const [paying, setPaying] = useState(false)
  const [paymentMessage, setPaymentMessage] = useState('')

  const [f, setF] = useState({
    name: '',
    email: '',
    password: '',
    city: '',
  })

  const [lessons, setLessons] = useState<any[]>([])
  const [posts, setPosts] = useState<any[]>([])
  const [note, setNote] = useState('')

  useEffect(() => {
    api('/api/auth')
      .then(setMe)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (me?.user) {
      api('/api/data?type=lessons')
        .then((x) => setLessons(x.lessons || []))
        .catch(() => {})
    }

    if (me?.user && tab === 'community') {
      api('/api/data?type=community')
        .then((x) => setPosts(x.posts || []))
        .catch(() => {})
    }
  }, [me, tab])

  async function submit(e: any) {
    e.preventDefault()

    try {
      await api('/api/auth?action=' + auth, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(f),
      })

      setMe(await api('/api/auth'))
      setNote('Account ready.')
    } catch (error: any) {
      setNote(error.message)
    }
  }

  function chooseCourse(course: Course) {
    setSelectedCourse(course)
    setTab('course')
    setPaymentMessage('')
  }

  async function startPayment(course: Course) {
    setPaymentMessage('')

    if (!me?.user) {
      setSelectedCourse(course)
      setTab('account')
      setAuth('login')
      setPaymentMessage('Please login or create an account before payment.')
      return
    }

    setPaying(true)

    try {
      const loaded = await loadRazorpayScript()

      if (!loaded) {
        throw new Error('Razorpay Checkout failed to load.')
      }

      const order = await api('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          courseId: course.id,
          amount: course.price,
        }),
      })

      const Razorpay = (window as any).Razorpay

      if (!Razorpay) {
        throw new Error('Razorpay is not available.')
      }

      const options = {
        key: order.keyId,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'JTrader Academy',
        description: course.name,
        order_id: order.orderId,

        prefill: {
          name: me.user.name || '',
          email: me.user.email || '',
        },

        theme: {
          color: '#111827',
        },

        handler: async function (response: any) {
          setPaymentMessage(
            'Payment received. Verification is being completed...'
          )

          /*
           * Signature verification + entitlement creation
           * will be connected in the backend next.
           */

          console.log('Razorpay payment:', response)

          setPaymentMessage(
            'Payment completed successfully. Your course access will be activated after verification.'
          )
        },

        modal: {
          ondismiss: function () {
            setPaying(false)
            setPaymentMessage('Payment window closed.')
          },
        },
      }

      const checkout = new Razorpay(options)

      checkout.on('payment.failed', function (response: any) {
        console.error(response)

        setPaying(false)
        setPaymentMessage(
          response?.error?.description || 'Payment failed. Please try again.'
        )
      })

      checkout.open()
    } catch (error: any) {
      setPaymentMessage(error.message || 'Unable to start payment.')
      setPaying(false)
    }
  }

  if (admin) {
    return (
      <Admin
        in={adminIn}
        close={() => setAdmin(false)}
      />
    )
  }

  return (
    <div className="jt">
      <style>{css + heroCss}</style>

      <div className="bar">
        JTRADER ACADEMY <b>TRADING EDUCATION</b>
      </div>

      <nav className="topnav">
        <button
          className="brand"
          onClick={() => setTab('home')}
        >
          <img
            src="/assets/jtrader-logo.png"
            alt="JTrader"
          />
          <span>JTRADER ACADEMY</span>
        </button>

        <div className="links">
          <button onClick={() => setTab('home')}>Home</button>
          <button onClick={() => setTab('course-options')}>
            Courses
          </button>
          <button onClick={() => setTab('community')}>
            Community
          </button>
        </div>

        <div className="navRight">
          <button
            className="admin"
            onClick={() => setAdmin(true)}
          >
            Admin
          </button>

          {me?.user ? (
            <button
              className="navBtn"
              onClick={async () => {
                await api('/api/auth?action=logout', {
                  method: 'POST',
                })

                location.reload()
              }}
            >
              Logout
            </button>
          ) : (
            <button
              className="navBtn"
              onClick={() => setTab('account')}
            >
              Login
            </button>
          )}
        </div>
      </nav>

      {tab === 'home' && (
        <>
          <section className="heroNew">
            <div className="heroCopy">
              <small>LEARN · TRADE · GROW</small>

              <h1>
                JTRADER
                <br />
                <span>ACADEMY</span>
              </h1>

              <p className="heroLead">
                Practical Trading. Real Experience. For Real People.
              </p>

              <p>
                Learn the stock market with simple strategies,
                real examples and practical guidance.
              </p>

              <div className="heroActions">
                <button
                  className="heroPrimary"
                  onClick={() => setTab('course-options')}
                >
                  Start Learning <b>→</b>
                </button>

                <button
                  className="heroGhost"
                  onClick={() =>
                    document
                      .getElementById('courses')
                      ?.scrollIntoView({ behavior: 'smooth' })
                  }
                >
                  View Courses
                </button>
              </div>
            </div>

            <div className="founderStage">
              <div className="founderGlow" />

              <div className="founderFrame">
                <img
                  src="/assets/jtrader-founder.jpg"
                  alt="JTrader Academy founder"
                />
              </div>

              <div className="founderLogo">
                <img
                  src="/assets/jtrader-logo.png"
                  alt="JTrader logo"
                />
              </div>

              <div className="quote">
                Discipline
                <br />
                <i>Creates</i>
                <br />
                Freedom
              </div>
            </div>
          </section>

          <section
            className="coursesNew"
            id="courses"
          >
            <div className="sectionHeadNew">
              <div>
                <small>LEARN AT YOUR PACE</small>
                <h2>Our Courses</h2>
              </div>

              <button
                onClick={() => setTab('course-options')}
              >
                View All Courses →
              </button>
            </div>

            <div className="courseCardsNew">
              {COURSES.map((course) => (
                <article
                  className={`courseNew ${course.theme}Course`}
                  key={course.id}
                >
                  <div className="courseVisual">
                    <span>{course.badge}</span>
                    <div className="miniChart">
                      ↗
                    </div>
                  </div>

                  <div className="courseBody">
                    <h3>
                      {course.id === 'basic' ? (
                        <>
                          BASIC OF
                          <br />
                          SHARE MARKET
                        </>
                      ) : (
                        <>
                          OPTION
                          <br />
                          TRADING COURSE
                        </>
                      )}
                    </h3>

                    <p>{course.description}</p>

                    <div className="courseMeta">
                      <span>▣ {course.lessons}</span>
                      <span>◉ 6 Month Access</span>
                      <span>♙ Certificate</span>
                    </div>

                    <div className="courseBottom">
                      <b>
                        ₹{course.price.toLocaleString('en-IN')}
                      </b>

                      <button
                        onClick={() => chooseCourse(course)}
                      >
                        View Course →
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      {tab === 'course-options' && (
        <main className="page">
          <section className="pageHero">
            <small>COURSES</small>
            <h1>
              Choose your <em>learning path.</em>
            </h1>

            <p>
              Start with market fundamentals or go deeper
              into options trading.
            </p>
          </section>

          <div className="courses courseTwo">
            {COURSES.map((course) => (
              <article
                className="card"
                key={course.id}
              >
                <div className={`cover ${course.theme}`}>
                  <small>JTRADER ACADEMY</small>

                  <b>{course.name}</b>
                </div>

                <h3>{course.name}</h3>

                <p>{course.description}</p>

                <strong>
                  ₹{course.price.toLocaleString('en-IN')}
                </strong>

                <button
                  onClick={() => chooseCourse(course)}
                >
                  →
                </button>
              </article>
            ))}
          </div>
        </main>
      )}

      {tab === 'course' && selectedCourse && (
        <main className="page">
          <section className="pageHero">
            <small>COURSE ACCESS</small>

            <h1>
              {selectedCourse.name}
            </h1>

            <p>{selectedCourse.description}</p>
          </section>

          <div className="courseGrid">
            <section className="lessonList">
              <header>
                <div>
                  <small>COURSE CONTENT</small>
                  <h2>
                    {selectedCourse.lessons}
                  </h2>
                </div>
              </header>

              {lessons.length > 0 ? (
                lessons.map((lesson: any, index) => (
                  <div
                    className="lesson"
                    key={lesson.id}
                  >
                    <strong>
                      {String(index + 1).padStart(2, '0')}
                    </strong>

                    <div>
                      <h3>{lesson.title}</h3>
                      <p>
                        {lesson.description ||
                          'Practical JTrader lesson.'}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <>
                  {Array.from({
                    length:
                      selectedCourse.id === 'basic'
                        ? 6
                        : 8,
                  }).map((_, index) => (
                    <div
                      className="lesson"
                      key={index}
                    >
                      <strong>
                        {String(index + 1).padStart(2, '0')}
                      </strong>

                      <div>
                        <h3>
                          {selectedCourse.id === 'basic'
                            ? `Share Market Lesson ${index + 1}`
                            : `Options Trading Lesson ${index + 1}`}
                        </h3>

                        <p>
                          Course lesson content.
                        </p>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </section>

            <aside className="enroll">
              <small>ENROLL NOW</small>

              <h2>{selectedCourse.name}</h2>

              <div className="price">
                ₹
                {selectedCourse.price.toLocaleString(
                  'en-IN'
                )}
              </div>

              <p>
                One-time payment for course access.
              </p>

              <ul>
                <li>Structured lessons</li>
                <li>Practical examples</li>
                <li>6 month access</li>
                <li>Certificate</li>
              </ul>

              <button
                className="primary full"
                onClick={() =>
                  startPayment(selectedCourse)
                }
                disabled={paying}
              >
                {paying
                  ? 'Opening Razorpay...'
                  : `Buy Now — ₹${selectedCourse.price.toLocaleString(
                      'en-IN'
                    )}`}
              </button>

              {paymentMessage && (
                <div className="paymentMessage">
                  {paymentMessage}
                </div>
              )}

              <button
                className="outline full"
                onClick={() =>
                  setTab('course-options')
                }
              >
                ← Back to Courses
              </button>
            </aside>
          </div>
        </main>
      )}

      {tab === 'account' && (
        <main className="page">
          <section className="pageHero">
            <small>ACCOUNT</small>

            <h1>
              Start your <em>JTrader journey.</em>
            </h1>

            <p>
              Login or create an account before purchasing
              your course.
            </p>
          </section>

          <section className="signup">
            <div>
              <small>JTRADER ACADEMY</small>

              <h2>
                {auth === 'login'
                  ? 'Welcome back'
                  : 'Create your account'}
              </h2>

              <p>
                Your account will be used to manage your
                course access.
              </p>
            </div>

            <form onSubmit={submit}>
              {auth === 'register' && (
                <input
                  placeholder="Full name"
                  value={f.name}
                  onChange={(e) =>
                    setF({
                      ...f,
                      name: e.target.value,
                    })
                  }
                />
              )}

              <input
                placeholder="Email"
                type="email"
                value={f.email}
                onChange={(e) =>
                  setF({
                    ...f,
                    email: e.target.value,
                  })
                }
              />

              <input
                placeholder="Password"
                type="password"
                value={f.password}
                onChange={(e) =>
                  setF({
                    ...f,
                    password: e.target.value,
                  })
                }
              />

              {auth === 'register' && (
                <input
                  placeholder="City"
                  value={f.city}
                  onChange={(e) =>
                    setF({
                      ...f,
                      city: e.target.value,
                    })
                  }
                />
              )}

              <button className="primary">
                {auth === 'login'
                  ? 'Login →'
                  : 'Create account →'}
              </button>

              <button
                type="button"
                className="outline"
                onClick={() =>
                  setAuth(
                    auth === 'login'
                      ? 'register'
                      : 'login'
                  )
                }
              >
                {auth === 'login'
                  ? 'Create account'
                  : 'I already have an account'}
              </button>

              {note && (
                <div className="note">
                  {note}
                </div>
              )}

              {paymentMessage && (
                <div className="paymentMessage">
                  {paymentMessage}
                </div>
              )}
            </form>
          </section>
        </main>
      )}

      {tab === 'community' && (
        <main className="page">
          <section className="pageHero">
            <small>PRIVATE COMMUNITY</small>

            <h1>
              Learn. Share. <em>Improve.</em>
            </h1>

            <p>
              Community access is available to active
              students.
            </p>
          </section>

          {me?.user ? (
            <section className="community">
              <textarea
                placeholder="Share a trade journal note..."
                value={note}
                onChange={(e) =>
                  setNote(e.target.value)
                }
              />

              {posts.map((post: any) => (
                <article key={post.id}>
                  <b>
                    {post.title || 'Community post'}
                  </b>

                  <small>{post.body}</small>
                </article>
              ))}
            </section>
          ) : (
            <section className="locked">
              Login or enroll in a course to access
              the private community.
            </section>
          )}
        </main>
      )}

      <footer>
        <b>JTRADER</b>

        <small>
          Trading education built around discipline,
          practical learning and real market examples.
        </small>

        <span>© 2026 JTrader Academy</span>
      </footer>
    </div>
  )
}

function Admin({
  in: adminIn,
  close,
}: any) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  async function enter() {
    setErr('')
    setLoading(true)

    try {
      await api('/api/auth?action=login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password: pw,
        }),
      })

      const me = await api('/api/auth')

      if (me?.user?.role !== 'admin') {
        throw new Error('Admin access only')
      }

      adminIn(true)
    } catch (e: any) {
      setErr(e.message || 'Invalid admin login')
    } finally {
      setLoading(false)
    }
  }

  if (!adminIn) {
    return (
      <div className="adminPage">
        <div className="adminTop">
          <button onClick={close}>
            ← Website
          </button>

          <b>JTRADER / ADMIN</b>
        </div>

        <div className="adminLogin">
          <div className="lock">⌘</div>

          <small>PRIVATE ADMIN AREA</small>

          <h1>Admin login</h1>

          <p>
            Only the authorized administrator can
            manage course content and enrollment data.
          </p>

          <input
            placeholder="Admin email"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
          />

          <input
            placeholder="Password"
            type="password"
            value={pw}
            onChange={(e) =>
              setPw(e.target.value)
            }
            onKeyDown={(e) =>
              e.key === 'Enter' && enter()
            }
          />

          <button
            className="primary full"
            onClick={enter}
            disabled={loading}
          >
            {loading
              ? 'Checking...'
              : 'Enter Dashboard →'}
          </button>

          {err && (
            <small className="demo errorText">
              {err}
            </small>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="adminPage">
      <div className="adminTop">
        <button onClick={close}>
          ← Website
        </button>

        <b>JTRADER / ADMIN</b>
      </div>

      <div className="dashboard">
        <div className="head">
          <div>
            <small>PRIVATE ADMIN DASHBOARD</small>
            <h2>Course Manager</h2>
          </div>
        </div>

        <div className="managerGrid">
          {COURSES.map((course) => (
            <section
              className="manageCard"
              key={course.id}
            >
              <small>
                {course.id === 'basic'
                  ? 'BASIC COURSE'
                  : 'OPTIONS COURSE'}
              </small>

              <h2>{course.name}</h2>

              <label>
                Price (₹)

                <input
                  type="number"
                  defaultValue={course.price}
                />
              </label>

              <label>
                Description

                <textarea
                  defaultValue={course.description}
                />
              </label>

              <button
                className="primary"
                type="button"
                onClick={() =>
                  alert(
                    'Price settings will be connected to the database in the next backend step.'
                  )
                }
              >
                Save Course Settings
              </button>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

const heroCss = `
.topnav{
  height:78px;
}
.brand{
  display:flex;
  align-items:center;
  gap:10px;
  text-align:left;
}
.brand img{
  width:45px;
  height:45px;
  object-fit:contain;
}
.brand span{
  font-size:13px;
  font-weight:900;
  letter-spacing:1.8px;
}
.navRight{
  display:flex;
  align-items:center;
  gap:10px;
}
.navBtn{
  border:1px solid #27313d;
  padding:11px 17px;
  border-radius:8px;
  font-size:11px;
  background:#fff;
  color:#080a0d;
  font-weight:900;
}
.heroNew{
  width:min(1160px,92%);
  margin:auto;
  display:grid;
  grid-template-columns:1fr .95fr;
  gap:35px;
  align-items:center;
  min-height:650px;
  padding:65px 0;
}
.heroCopy>small,
.sectionHeadNew small{
  color:#8aa7ff;
  font-size:9px;
  letter-spacing:2.5px;
  font-weight:900;
}
.heroCopy h1{
  font-size:clamp(62px,8vw,102px);
  line-height:.86;
  letter-spacing:-5px;
  margin:18px 0 24px;
  font-weight:950;
}
.heroCopy h1 span{
  background:linear-gradient(110deg,#f5f7fa,#7990ad);
  -webkit-background-clip:text;
  color:transparent;
}
.heroLead{
  font-size:21px!important;
  color:#e8edf3!important;
  font-weight:700;
}
.heroCopy p{
  max-width:580px;
  color:#8996a6;
  line-height:1.7;
  font-size:14px;
}
.heroActions{
  display:flex;
  gap:10px;
  margin-top:28px;
}
.heroPrimary{
  background:#fff;
  color:#080a0d;
  padding:15px 21px;
  border-radius:10px;
  font-size:12px;
  font-weight:900;
}
.heroGhost{
  border:1px solid #2a3542;
  border-radius:10px;
  padding:14px 20px;
  color:#c5ced8;
  font-size:12px;
}
.founderStage{
  height:570px;
  position:relative;
  display:flex;
  align-items:end;
  justify-content:center;
}
.founderGlow{
  position:absolute;
  width:430px;
  height:430px;
  border-radius:50%;
  background:radial-gradient(circle,#263b58 0,transparent 68%);
  filter:blur(18px);
  top:60px;
}
.founderFrame{
  position:relative;
  width:410px;
  height:540px;
  border-radius:25px 25px 8px 8px;
  overflow:hidden;
  border:1px solid #2b3847;
  background:#10151c;
}
.founderFrame img{
  width:100%;
  height:100%;
  object-fit:cover;
  object-position:center 32%;
}
.founderLogo{
  position:absolute;
  right:5px;
  top:40px;
  width:125px;
  height:125px;
  padding:18px;
  border-radius:18px;
  background:#07090ddd;
  border:1px solid #26303b;
}
.founderLogo img{
  width:100%;
  height:100%;
  object-fit:contain;
}
.quote{
  position:absolute;
  left:5px;
  top:150px;
  color:#778494;
  font-size:23px;
  line-height:1.1;
  font-style:italic;
  transform:rotate(-7deg);
}
.quote i{
  color:#e7edf3;
}
.coursesNew{
  width:min(1160px,92%);
  margin:auto;
  padding:80px 0 100px;
}
.sectionHeadNew{
  display:flex;
  justify-content:space-between;
  align-items:end;
  margin-bottom:28px;
}
.sectionHeadNew h2{
  font-size:42px;
  letter-spacing:-2px;
  margin:7px 0 0;
}
.courseCardsNew{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:16px;
}
.courseNew{
  border:1px solid #25313d;
  border-radius:15px;
  overflow:hidden;
  background:#0b1017;
}
.greenCourse{
  border-color:#195f47;
}
.redCourse{
  border-color:#72302f;
}
.courseVisual{
  height:180px;
  padding:16px;
  position:relative;
  overflow:hidden;
}
.greenCourse .courseVisual{
  background:radial-gradient(circle at 70% 50%,#123c2d,#0a1112 62%);
}
.redCourse .courseVisual{
  background:radial-gradient(circle at 70% 50%,#4a1518,#0e0d11 62%);
}
.courseVisual>span{
  font-size:8px;
  letter-spacing:1.4px;
  border-radius:30px;
  padding:8px 12px;
  font-weight:900;
  background:#fff;
  color:#080a0d;
}
.miniChart{
  position:absolute;
  right:25px;
  bottom:-12px;
  font-size:125px;
  font-weight:900;
  line-height:1;
  transform:rotate(-8deg);
}
.greenCourse .miniChart{
  color:#30d987;
}
.redCourse .miniChart{
  color:#ee4545;
}
.courseBody{
  padding:23px;
}
.courseBody h3{
  font-size:27px;
  line-height:.95;
  margin:0 0 13px;
  letter-spacing:-1px;
}
.courseBody p{
  color:#7d8997;
  font-size:11px;
  line-height:1.65;
  min-height:48px;
}
.courseMeta{
  display:flex;
  gap:15px;
  flex-wrap:wrap;
  color:#6f7c8b;
  font-size:9px;
  margin:17px 0;
}
.courseBottom{
  display:flex;
  justify-content:space-between;
  align-items:center;
  margin-top:17px;
}
.courseBottom>b{
  font-size:28px;
}
.greenCourse .courseBottom>b{
  color:#35e395;
}
.redCourse .courseBottom>b{
  color:#ff4e4e;
}
.courseBottom button{
  background:#fff;
  color:#090b0e;
  padding:12px 16px;
  border-radius:8px;
  font-size:10px;
  font-weight:900;
}
.paymentMessage{
  margin-top:12px;
  padding:10px;
  border:1px solid #27313d;
  border-radius:8px;
  color:#9aa6b4;
  font-size:10px;
  line-height:1.5;
}
@media(max-width:850px){
  .heroNew{
    grid-template-columns:1fr;
    padding:50px 0;
  }
  .founderStage{
    height:500px;
  }
  .founderFrame{
    width:min(360px,90%);
    height:470px;
  }
  .courseCardsNew{
    grid-template-columns:1fr;
  }
  .sectionHeadNew{
    display:block;
  }
}
`

const css = `
*{
  box-sizing:border-box;
}
body{
  margin:0;
  background:#07090d;
  color:#f4f7fb;
  font-family:Inter,system-ui,sans-serif;
}
button{
  font:inherit;
  cursor:pointer;
  color:inherit;
  background:none;
  border:0;
}
.bar{
  height:32px;
  border-bottom:1px solid #171d26;
  text-align:center;
  color:#687586;
  font-size:9px;
  letter-spacing:1.5px;
  padding:9px;
}
.bar b{
  color:#fff;
  margin-left:12px;
}
nav{
  border-bottom:1px solid #171d26;
  background:#080b10ee;
  backdrop-filter:blur(15px);
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:0 max(4%,calc((100% - 1160px)/2));
  position:sticky;
  top:0;
  z-index:20;
}
.links{
  display:flex;
  gap:30px;
}
.links button,
.admin{
  color:#8591a0;
  font-size:12px;
}
.page{
  width:min(1160px,92%);
  margin:auto;
  padding:90px 0;
}
.pageHero{
  padding:20px 0 55px;
}
.pageHero small,
.signup small,
.adminLogin>small,
.dashboard small{
  font-size:8px;
  color:#5f8fff;
  letter-spacing:2px;
  font-weight:900;
}
.pageHero h1{
  font-size:54px;
  letter-spacing:-3px;
  line-height:1;
}
.pageHero em{
  color:#7189ae;
  font-style:normal;
}
.pageHero p{
  max-width:620px;
  color:#919cab;
  line-height:1.7;
  font-size:16px;
}
.courses{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:14px;
}
.card{
  border:1px solid #202a36;
  background:#0c1118;
  border-radius:12px;
  padding:8px;
}
.cover{
  height:190px;
  border-radius:9px;
  position:relative;
  padding:15px;
  overflow:hidden;
}
.cover.green{
  background:radial-gradient(circle at 30% 70%,#1d6158,#0b1118 60%);
}
.cover.red{
  background:radial-gradient(circle at 70% 40%,#4a1518,#0e0d11 60%);
}
.cover small{
  color:#b7c2d0;
  font-size:8px;
  letter-spacing:2px;
}
.cover b{
  position:absolute;
  left:15px;
  bottom:15px;
  font-size:22px;
  line-height:1;
  max-width:75%;
}
.card h3,
.card p,
.card>strong{
  margin-left:8px;
}
.card p{
  color:#778392;
  font-size:12px;
  line-height:1.6;
}
.card>strong{
  font-size:24px;
}
.card>button{
  float:right;
  margin:0 8px 8px;
  width:35px;
  height:35px;
  background:#fff;
  color:#000;
  border-radius:8px;
}
.courseGrid{
  display:grid;
  grid-template-columns:1.5fr .7fr;
  gap:15px;
}
.lessonList,
.enroll,
.signup,
.community,
.locked{
  border:1px solid #202a36;
  background:#0c1118;
  border-radius:13px;
}
.lessonList header{
  padding:22px;
  border-bottom:1px solid #202a36;
}
.lessonList header h2{
  margin:8px 0;
  font-size:23px;
}
.lesson{
  display:grid;
  grid-template-columns:40px 1fr;
  gap:12px;
  padding:18px 22px;
  border-bottom:1px solid #1a222d;
}
.lesson>strong{
  color:#5f8fff;
}
.lesson h3{
  margin:5px 0;
  font-size:15px;
}
.lesson p{
  margin:0;
  color:#707c8a;
  font-size:11px;
}
.enroll{
  padding:23px;
  height:max-content;
  position:sticky;
  top:105px;
}
.enroll h2{
  font-size:22px;
}
.price{
  font-size:30px;
}
.enroll p,
.enroll li{
  color:#7a8695;
  font-size:11px;
  line-height:1.7;
}
.enroll ul{
  padding-left:17px;
}
.primary{
  background:#fff;
  color:#080a0d;
  padding:14px 20px;
  border-radius:9px;
  font-weight:900;
  font-size:12px;
}
.full{
  width:100%;
  margin-top:10px;
}
.outline{
  border:1px solid #27313d;
  padding:10px 14px;
  border-radius:8px;
  font-size:12px;
}
.signup{
  margin-top:15px;
  padding:25px;
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:40px;
}
.signup form{
  display:grid;
  gap:8px;
}
.signup input,
.adminLogin input,
.manageCard input,
.manageCard textarea{
  background:#090d13;
  border:1px solid #27313d;
  border-radius:8px;
  padding:12px;
  color:#fff;
  outline:0;
  width:100%;
}
.signup input{
  margin:0;
}
.community{
  padding:20px;
}
.community textarea{
  width:100%;
  height:110px;
  background:#090d13;
  border:1px solid #27313d;
  border-radius:8px;
  color:#fff;
  padding:12px;
}
.community article{
  border-top:1px solid #202a36;
  padding:16px 0;
}
.community article small{
  color:#667384;
  margin-left:10px;
}
.locked{
  text-align:center;
  padding:70px;
  color:#7b8795;
}
.adminPage{
  min-height:100vh;
  padding:30px 4%;
  background:#070a0e;
}
.adminTop{
  display:flex;
  justify-content:space-between;
  border-bottom:1px solid #1a222c;
  padding-bottom:20px;
  color:#8b96a5;
  font-size:11px;
}
.adminLogin{
  width:min(430px,100%);
  margin:80px auto;
  border:1px solid #27313d;
  background:#0c1118;
  border-radius:15px;
  padding:35px;
  text-align:center;
}
.lock{
  font-size:25px;
  margin-bottom:15px;
  color:#6d9bff;
}
.adminLogin h1{
  font-size:31px;
  margin:10px;
}
.adminLogin p,
.demo{
  color:#748091;
  font-size:11px;
  line-height:1.6;
}
.errorText{
  display:block;
  color:#ff7b7b!important;
  margin-top:15px;
}
.dashboard{
  width:min(1180px,100%);
  margin:45px auto;
}
.managerGrid{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:14px;
}
.manageCard{
  border:1px solid #202a36;
  background:#0c1118;
  border-radius:13px;
  padding:24px;
}
.manageCard h2{
  font-size:23px;
  margin:8px 0 20px;
}
.manageCard label{
  display:block;
  color:#7f8a99;
  font-size:10px;
  margin-top:12px;
}
.manageCard textarea{
  min-height:110px;
  resize:vertical;
}
.manageCard .primary{
  margin-top:15px;
}
footer{
  border-top:1px solid #161d26;
  padding:38px max(4%,calc((100% - 1160px)/2));
  display:flex;
  gap:25px;
  justify-content:space-between;
  color:#657181;
  font-size:10px;
}
footer b{
  font-size:19px;
  color:#fff;
}
footer small{
  max-width:330px;
}
@media(max-width:850px){
  .links{
    display:none;
  }
  .courses,
  .courseGrid,
  .signup,
  .managerGrid{
    grid-template-columns:1fr;
  }
  .enroll{
    position:static;
  }
  .pageHero h1{
    font-size:43px;
  }
  footer{
    display:block;
  }
}
`