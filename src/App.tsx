import { useState, useRef, useEffect, useCallback } from 'react'
import './App.css'

type Page = 'landing' | 'login' | 'signup' | 'profile' | 'scanner' | 'results' | 'history' | 'pricing'

interface User { name: string; email: string; password: string }
interface HealthProfile { name: string; conditions: string[]; allergies: string[]; dietGoals: string[] }
interface FlaggedIngredient { name: string; reason: string; severity: 'high' | 'medium' | 'low' }
interface ScanResult {
  barcode: string; productName: string; brand: string; ingredients: string
  score: number; flaggedIngredients: FlaggedIngredient[]; swaps: string[]
  timestamp: string; imageUrl?: string
}

const HARMFUL: { name: string; reason: string; severity: 'high'|'medium'|'low'; conditions: string[] }[] = [
  { name: 'high fructose corn syrup', reason: 'Linked to obesity and metabolic disorders', severity: 'high', conditions: ['diabetes'] },
  { name: 'aspartame', reason: 'Artificial sweetener with controversial health effects', severity: 'medium', conditions: [] },
  { name: 'sodium nitrate', reason: 'Preservative linked to increased cancer risk', severity: 'high', conditions: [] },
  { name: 'carrageenan', reason: 'May cause inflammation and digestive issues', severity: 'medium', conditions: [] },
  { name: 'partially hydrogenated', reason: 'Trans fats — strongly linked to heart disease', severity: 'high', conditions: [] },
  { name: 'red 40', reason: 'Artificial dye linked to hyperactivity in children', severity: 'medium', conditions: [] },
  { name: 'yellow 5', reason: 'Artificial dye, may cause allergic reactions', severity: 'medium', conditions: [] },
  { name: 'bha', reason: 'Potential carcinogen used as a preservative', severity: 'high', conditions: [] },
  { name: 'bht', reason: 'Potential carcinogen used as a preservative', severity: 'high', conditions: [] },
  { name: 'sodium benzoate', reason: 'May react with Vitamin C to form benzene', severity: 'medium', conditions: [] },
  { name: 'sucralose', reason: 'May disrupt gut bacteria and insulin response', severity: 'medium', conditions: ['diabetes'] },
  { name: 'maltodextrin', reason: 'Very high glycemic index — spikes blood sugar fast', severity: 'medium', conditions: ['diabetes'] },
  { name: 'gluten', reason: 'Contains gluten — harmful for celiac disease', severity: 'high', conditions: ['celiac disease'] },
  { name: 'wheat', reason: 'Contains gluten — harmful for celiac disease', severity: 'high', conditions: ['celiac disease'] },
  { name: 'monosodium glutamate', reason: 'MSG — may cause headaches in sensitive individuals', severity: 'low', conditions: [] },
  { name: 'e471', reason: 'Mono and diglycerides — may contain hidden trans fats', severity: 'medium', conditions: [] },
  { name: 'corn syrup', reason: 'Refined sugar that rapidly raises blood glucose', severity: 'medium', conditions: ['diabetes'] },
  { name: 'artificial flavor', reason: 'Vague term hiding potentially harmful chemicals', severity: 'low', conditions: [] },
  { name: 'potassium bromate', reason: 'Banned in many countries — possible carcinogen', severity: 'high', conditions: [] },
  { name: 'propylparaben', reason: 'Endocrine disruptor, avoid during pregnancy', severity: 'high', conditions: ['pregnancy'] },
  { name: 'acesulfame', reason: 'Artificial sweetener linked to gut microbiome disruption', severity: 'medium', conditions: ['diabetes'] },
  { name: 'titanium dioxide', reason: 'Nano particles may be harmful when ingested', severity: 'medium', conditions: [] },
]

function analyze(ingredients: string, profile: HealthProfile) {
  if (!ingredients) return { flagged: [] as FlaggedIngredient[], score: 65 }
  const lower = ingredients.toLowerCase()
  const flagged: FlaggedIngredient[] = []
  HARMFUL.forEach(item => {
    if (lower.includes(item.name)) {
      const personalized = item.conditions.some(c => profile.conditions.map(p => p.toLowerCase()).includes(c))
      if (personalized || item.conditions.length === 0) {
        flagged.push({
          name: item.name.toUpperCase(),
          reason: personalized ? '⚠️ ESPECIALLY BAD FOR YOU: ' + item.reason : item.reason,
          severity: item.severity
        })
      }
    }
  })
  profile.allergies.forEach(a => {
    if (a && lower.includes(a.toLowerCase())) {
      flagged.push({ name: a.toUpperCase(), reason: '🚨 ALLERGY ALERT: Contains ' + a + ' which you listed as an allergy!', severity: 'high' })
    }
  })
  const high = flagged.filter(f => f.severity === 'high').length
  const med = flagged.filter(f => f.severity === 'medium').length
  const low = flagged.filter(f => f.severity === 'low').length
  const score = Math.max(5, Math.min(100, 100 - high * 20 - med * 8 - low * 3))
  return { flagged, score }
}

function getSwaps(name: string, score: number) {
  if (score >= 80) return ['Great choice! This product scored well for your profile.', 'Try the organic version for even fewer additives.', 'Look for products with fewer than 5 total ingredients.']
  return [`Search for "${name} organic" at your local health store.`, 'Look for products labeled "No artificial colors or preservatives".', 'Try Whole Foods 365 or Simple Truth store brand — often much cleaner.']
}

// ─────────────────────────────────────────────
// CAMERA SCANNER COMPONENT
// ─────────────────────────────────────────────
function CameraScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting')
  const [errorMsg, setErrorMsg] = useState('')
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)

  const stopCamera = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
  }, [])

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [])

  const startCamera = async () => {
    if (!('BarcodeDetector' in window)) {
      setStatus('error')
      setErrorMsg('Camera scanning needs Chrome browser (desktop or Android). Safari/Firefox not supported yet. Please type the barcode number manually below instead.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setStatus('scanning')
        beginScanLoop()
      }
    } catch {
      setStatus('error')
      setErrorMsg('Camera permission denied. Please tap "Allow" when your browser asks for camera access, then try again.')
    }
  }

  const beginScanLoop = () => {
    const detector = new (window as any).BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'] })
    const loop = async () => {
      if (!videoRef.current || !streamRef.current) return
      try {
        const barcodes = await detector.detect(videoRef.current)
        if (barcodes.length > 0) {
          stopCamera()
          onDetected(barcodes[0].rawValue)
          return
        }
      } catch {}
      timerRef.current = window.setTimeout(loop, 300)
    }
    loop()
  }

  return (
    <div className="camera-overlay">
      <div className="camera-modal">
        <div className="camera-top">
          <span className="camera-title">📷 Point at barcode</span>
          <button className="cam-close" onClick={() => { stopCamera(); onClose() }}>✕</button>
        </div>
        {status === 'error' ? (
          <div className="cam-error-box">
            <div className="cam-err-icon">📷</div>
            <p>{errorMsg}</p>
            <button className="btn-outline full-w" style={{marginTop:16}} onClick={() => { stopCamera(); onClose() }}>
              Close — I'll type the barcode
            </button>
          </div>
        ) : (
          <div className="video-wrap">
            <video ref={videoRef} className="cam-video" playsInline muted />
            <div className="scan-frame-outer">
              <div className="scan-frame-box" />
              <p className="scan-hint">{status === 'starting' ? '⏳ Starting camera...' : '🔍 Auto-scanning — hold steady'}</p>
            </div>
          </div>
        )}
        {status === 'scanning' && (
          <button className="btn-outline full-w" style={{marginTop:12}} onClick={() => { stopCamera(); onClose() }}>
            Cancel — Type barcode instead
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// NAVBAR
// ─────────────────────────────────────────────
function Navbar({ user, setPage, onLogout }: { user: User|null; setPage: (p:Page)=>void; onLogout: ()=>void }) {
  const [open, setOpen] = useState(false)
  const go = (p: Page) => { setPage(p); setOpen(false) }
  return (
    <nav className="navbar">
      <div className="nav-brand" onClick={() => go('landing')}>🥦 NutriScout AI</div>
      <div className={`nav-links ${open ? 'open' : ''}`}>
        {user ? (
          <>
            <span onClick={() => go('scanner')}>Scanner</span>
            <span onClick={() => go('history')}>History</span>
            <span onClick={() => go('pricing')}>Pricing</span>
            <span onClick={() => go('profile')}>My Profile</span>
            <span className="nav-user">👤 {user.name.split(' ')[0]}</span>
            <span className="nav-logout" onClick={() => { onLogout(); go('landing') }}>Logout</span>
          </>
        ) : (
          <>
            <span onClick={() => go('pricing')}>Pricing</span>
            <span onClick={() => go('login')}>Login</span>
            <button className="nav-signup-btn" onClick={() => go('signup')}>Sign Up Free</button>
          </>
        )}
      </div>
      <div className="hamburger" onClick={() => setOpen(!open)}>☰</div>
    </nav>
  )
}

// ─────────────────────────────────────────────
// LANDING PAGE
// ─────────────────────────────────────────────
function Landing({ user, setPage }: { user: User|null; setPage: (p:Page)=>void }) {
  return (
    <div className="landing">
      <div className="hero">
        <div className="hero-badge">🤖 AI-Powered · Personalized · Free to Start</div>
        <h1>Know What You're<br /><span className="green">Really Eating</span></h1>
        <p className="hero-desc">Scan any grocery or supplement barcode. Get a health score based on YOUR conditions — not everyone else's.</p>
        <div className="hero-btns">
          {user ? (
            <button className="btn-primary large" onClick={() => setPage('scanner')}>Open Scanner →</button>
          ) : (
            <>
              <button className="btn-primary large" onClick={() => setPage('signup')}>Get Started Free →</button>
              <button className="btn-outline large" onClick={() => setPage('login')}>Login</button>
            </>
          )}
        </div>
        <div className="stats-row">
          {[['$781B','Market by 2029'],['40M+','Yuka gap proven'],['$9.99/mo','Pro plan'],['2 weeks','To launch']].map(([v,l]) => (
            <div className="stat" key={l}><strong>{v}</strong><span>{l}</span></div>
          ))}
        </div>
      </div>

      <div className="vs-section">
        <h2 className="section-title">NutriScout AI vs Yuka</h2>
        <div className="vs-table">
          <div className="vs-header">
            <div>Feature</div><div className="vs-yuka">Yuka</div><div className="vs-us">NutriScout AI</div>
          </div>
          {[
            ['Personalized to your conditions','❌','✅'],
            ['Supplement scanning','❌','✅'],
            ['AI explanation per ingredient','❌','✅'],
            ['Condition-based scoring','❌','✅'],
            ['Smart swap suggestions','Basic','✅ Full AI'],
            ['US-specific condition filters','❌','✅'],
          ].map(([f,y,n]) => (
            <div className="vs-row" key={f as string}>
              <div>{f}</div><div className="vs-yuka">{y}</div><div className="vs-us">{n}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <h2 className="section-title">Five Features No Competitor Offers Together</h2>
        <div className="cards-3">
          {[
            ['👤','Personal Health Profile','Set conditions, allergies & diet goals. Every scan scored for YOU.'],
            ['🧪','AI Ingredient Breakdown','Every flagged ingredient explained in plain English for YOUR body.'],
            ['💊','Supplement Scanner','First app to cover protein powders, vitamins & pre-workouts.'],
            ['🔄','Smart Swap Engine','When a product scores poorly, get a safer alternative instantly.'],
            ['📊','Scan History','Track all your scans and spot unhealthy patterns over time.'],
            ['📷','Camera Scanner','Point your phone at any barcode — instant result in 1 second.'],
          ].map(([icon,title,desc]) => (
            <div className="card" key={title as string}>
              <div className="card-icon">{icon}</div>
              <h3>{title as string}</h3>
              <p>{desc as string}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="cta-section">
        <h2>Ready to eat smarter?</h2>
        <p>Free account · No credit card · 2 minute setup</p>
        <button className="btn-primary large" onClick={() => setPage(user ? 'scanner' : 'signup')}>
          {user ? 'Open Scanner →' : 'Create Free Account →'}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// SIGNUP PAGE
// ─────────────────────────────────────────────
function SignupPage({ setUser, setPage }: { setUser: (u:User)=>void; setPage: (p:Page)=>void }) {
  const [form, setForm] = useState({ name:'', email:'', password:'', confirm:'' })
  const [error, setError] = useState('')
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const submit = () => {
    if (!form.name.trim()) { setError('Please enter your name.'); return }
    if (!form.email.includes('@')) { setError('Please enter a valid email address.'); return }
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return }

    const accounts: User[] = JSON.parse(localStorage.getItem('ns_accounts') || '[]')
    if (accounts.find(a => a.email === form.email)) { setError('An account with this email already exists. Please login.'); return }

    const newUser: User = { name: form.name.trim(), email: form.email.trim(), password: form.password }
    accounts.push(newUser)
    localStorage.setItem('ns_accounts', JSON.stringify(accounts))
    localStorage.setItem('ns_current', JSON.stringify(newUser))
    setUser(newUser)
    setPage('profile')
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">🥦</div>
        <h1>Create Your Account</h1>
        <p className="auth-sub">Free forever · No credit card needed</p>

        <div className="form-group">
          <label>Full Name</label>
          <input className="input" placeholder="e.g. Vijay Nagallapati" value={form.name} onChange={e => set('name', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Email Address</label>
          <input className="input" type="email" placeholder="you@email.com" value={form.email} onChange={e => set('email', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input className="input" type="password" placeholder="At least 6 characters" value={form.password} onChange={e => set('password', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Confirm Password</label>
          <input className="input" type="password" placeholder="Type password again" value={form.confirm} onChange={e => set('confirm', e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} />
        </div>

        {error && <div className="auth-error">⚠️ {error}</div>}

        <button className="btn-primary large full-w" onClick={submit}>Create Account →</button>

        <p className="auth-switch">Already have an account? <span className="link-btn" onClick={() => setPage('login')}>Login here</span></p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// LOGIN PAGE
// ─────────────────────────────────────────────
function LoginPage({ setUser, setPage }: { setUser: (u:User)=>void; setPage: (p:Page)=>void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    if (!email.trim() || !password.trim()) { setError('Please fill in both fields.'); return }
    const accounts: User[] = JSON.parse(localStorage.getItem('ns_accounts') || '[]')
    const found = accounts.find(a => a.email === email.trim() && a.password === password)
    if (!found) { setError('Email or password is incorrect. Please try again.'); return }
    localStorage.setItem('ns_current', JSON.stringify(found))
    setUser(found)
    setPage('scanner')
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">🥦</div>
        <h1>Welcome Back</h1>
        <p className="auth-sub">Login to your NutriScout AI account</p>

        <div className="form-group">
          <label>Email Address</label>
          <input className="input" type="email" placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input className="input" type="password" placeholder="Your password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} />
        </div>

        {error && <div className="auth-error">⚠️ {error}</div>}

        <button className="btn-primary large full-w" onClick={submit}>Login →</button>

        <p className="auth-switch">No account yet? <span className="link-btn" onClick={() => setPage('signup')}>Sign up free →</span></p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// PROFILE PAGE
// ─────────────────────────────────────────────
function ProfilePage({ profile, setProfile, setPage, user }: {
  profile: HealthProfile; setProfile: (p:HealthProfile)=>void; setPage: (p:Page)=>void; user: User|null
}) {
  const [local, setLocal] = useState<HealthProfile>(profile)
  const [allergyInput, setAllergyInput] = useState('')
  const [saved, setSaved] = useState(false)

  const CONDITIONS = ['Diabetes','Celiac Disease','Pregnancy','Keto Diet','Heart Disease','Hypertension','IBS','Vegan','Gluten-Free','Lactose Intolerant']
  const GOALS = ['Lose Weight','Build Muscle','Eat Clean','Reduce Sugar','Low Sodium','High Protein','Low Carb','More Fiber']

  const toggle = (key: 'conditions'|'dietGoals', val: string) =>
    setLocal(prev => ({ ...prev, [key]: prev[key].includes(val) ? prev[key].filter(x=>x!==val) : [...prev[key], val] }))

  const addAllergy = () => {
    if (allergyInput.trim()) { setLocal(prev => ({ ...prev, allergies: [...prev.allergies, allergyInput.trim()] })); setAllergyInput('') }
  }

  const save = () => {
    const key = user ? `ns_profile_${user.email}` : 'ns_profile'
    localStorage.setItem(key, JSON.stringify(local))
    setProfile(local)
    setSaved(true)
    setTimeout(() => { setSaved(false); setPage('scanner') }, 1000)
  }

  return (
    <div className="page">
      <h1>Your Health Profile</h1>
      <p className="page-desc">This personalizes every scan to your specific needs. The more you fill in, the more accurate your scores.</p>

      <div className="form-group">
        <label>Your Name</label>
        <input className="input" placeholder="Enter your name" value={local.name} onChange={e => setLocal(p => ({ ...p, name: e.target.value }))} />
      </div>
      <div className="form-group">
        <label>Health Conditions <span className="hint">— tap all that apply</span></label>
        <div className="chips">
          {CONDITIONS.map(c => (
            <button key={c} className={`chip ${local.conditions.includes(c) ? 'active' : ''}`} onClick={() => toggle('conditions', c)}>{c}</button>
          ))}
        </div>
      </div>
      <div className="form-group">
        <label>Diet Goals</label>
        <div className="chips">
          {GOALS.map(g => (
            <button key={g} className={`chip ${local.dietGoals.includes(g) ? 'active' : ''}`} onClick={() => toggle('dietGoals', g)}>{g}</button>
          ))}
        </div>
      </div>
      <div className="form-group">
        <label>Allergies <span className="hint">— type and press Add</span></label>
        <div className="row-input">
          <input className="input" placeholder="e.g. peanuts, shellfish, dairy..." value={allergyInput}
            onChange={e => setAllergyInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addAllergy()} />
          <button className="btn-primary" onClick={addAllergy}>Add</button>
        </div>
        <div className="chips" style={{marginTop:10}}>
          {local.allergies.map(a => (
            <span key={a} className="chip active">{a}
              <span className="remove" onClick={() => setLocal(p => ({ ...p, allergies: p.allergies.filter(x=>x!==a) }))}>✕</span>
            </span>
          ))}
        </div>
      </div>

      <button className="btn-primary large full-w" onClick={save}>
        {saved ? '✅ Saved! Taking you to scanner...' : 'Save Profile & Start Scanning →'}
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────
// SCANNER PAGE
// ─────────────────────────────────────────────
function ScannerPage({ profile, addResult, setPage, setResult, user }: {
  profile: HealthProfile; addResult: (r:ScanResult)=>void; setPage: (p:Page)=>void
  setResult: (r:ScanResult)=>void; user: User|null
}) {
  const [barcode, setBarcode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showCamera, setShowCamera] = useState(false)

  const SAMPLES = [
    { code: '737628064502', name: 'Nutella' },
    { code: '016000275607', name: 'Cheerios' },
    { code: '049000028904', name: 'Coca-Cola' },
    { code: '021130126026', name: "Lay's Chips" },
    { code: '038000845857', name: "Kellogg's" },
    { code: '070038629511', name: 'Oreos' },
    { code: '041196898396', name: 'Kind Bar' },
    { code: '010700603950', name: "Nature Valley" },
  ]

  const scanBarcode = async (code: string) => {
    const b = code.trim()
    if (!b) { setError('Please enter a barcode number first.'); return }
    setLoading(true); setError(''); setBarcode(b)
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${b}.json`)
      const data = await res.json()
      if (data.status === 0 || !data.product) { setError('Product not found. Try one of the sample barcodes below.'); setLoading(false); return }
      const p = data.product
      const ingredients = p.ingredients_text || p.ingredients_text_en || ''
      const { flagged, score } = analyze(ingredients, profile)
      const result: ScanResult = {
        barcode: b,
        productName: p.product_name || p.product_name_en || 'Unknown Product',
        brand: p.brands || 'Unknown Brand',
        ingredients: ingredients || 'Ingredients not listed in database.',
        score, flaggedIngredients: flagged,
        swaps: getSwaps(p.product_name || 'this product', score),
        timestamp: new Date().toLocaleString(),
        imageUrl: p.image_front_small_url || p.image_url
      }
      addResult(result); setResult(result); setPage('results')
    } catch { setError('Network error. Check your connection and try again.') }
    setLoading(false)
  }

  return (
    <div className="page">
      {showCamera && <CameraScanner onDetected={(code) => { setShowCamera(false); scanBarcode(code) }} onClose={() => setShowCamera(false)} />}

      <h1>🔍 Scan a Product</h1>
      <p className="page-desc">Use your camera to scan instantly, or type the barcode number from the back of any package.</p>

      {profile.conditions.length > 0 && (
        <div className="profile-banner">✅ Personalized for <strong>{profile.name || user?.name || 'you'}</strong> · {profile.conditions.join(', ')}</div>
      )}

      <button className="camera-launch-btn" onClick={() => setShowCamera(true)}>
        <span className="cam-btn-icon">📷</span>
        <div>
          <strong>Open Camera Scanner</strong>
          <small>Point your camera at any barcode</small>
        </div>
        <span className="cam-btn-arrow">→</span>
      </button>

      <div className="divider"><span>or type barcode manually</span></div>

      <div className="scanner-card">
        <input className="input large" value={barcode} placeholder="Enter barcode e.g. 737628064502"
          onChange={e => setBarcode(e.target.value)} onKeyDown={e => e.key === 'Enter' && scanBarcode(barcode)} />
        {error && <p className="error">⚠️ {error}</p>}
        <button className="btn-primary large full-w" onClick={() => scanBarcode(barcode)} disabled={loading}>
          {loading ? '⏳ Looking up product...' : '🔍 Scan Product'}
        </button>
      </div>

      <div className="samples">
        <p className="hint">👇 Tap a sample to test the app instantly:</p>
        <div className="sample-grid">
          {SAMPLES.map(s => (
            <button key={s.code} className="sample-btn" onClick={() => scanBarcode(s.code)}>
              <span>{s.name}</span><small>{s.code}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="info-box">
        <strong>📦 Where to find a barcode:</strong> Look at the back or bottom of any food or supplement package. It's the black and white stripes with numbers underneath.
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// RESULTS PAGE
// ─────────────────────────────────────────────
function ResultsPage({ result, setPage }: { result: ScanResult|null; setPage: (p:Page)=>void }) {
  if (!result) return <div className="page"><p>No scan yet. <button className="link-btn" onClick={() => setPage('scanner')}>Go scan something →</button></p></div>
  const color = result.score >= 75 ? '#16a34a' : result.score >= 50 ? '#d97706' : '#dc2626'
  const label = result.score >= 75 ? 'Good ✅' : result.score >= 50 ? 'Fair ⚠️' : 'Poor 🚨'
  const bg = result.score >= 75 ? '#f0fdf4' : result.score >= 50 ? '#fffbeb' : '#fef2f2'

  return (
    <div className="page">
      <button className="back-btn" onClick={() => setPage('scanner')}>← Scan Another Product</button>

      <div className="result-header">
        {result.imageUrl && <img src={result.imageUrl} alt={result.productName} className="product-img" onError={e => (e.currentTarget.style.display='none')} />}
        <div>
          <h1>{result.productName}</h1>
          <p className="brand">{result.brand}</p>
          <p className="timestamp">{result.timestamp}</p>
        </div>
      </div>

      <div className="score-card" style={{background: bg}}>
        <div className="score-circle" style={{borderColor: color}}>
          <span className="score-num" style={{color}}>{result.score}</span>
          <span className="score-lbl" style={{color}}>/ 100</span>
        </div>
        <div className="score-info">
          <h3 style={{color}}>Health Score: {label}</h3>
          <p>Personalized score based on your health profile. 100 = perfectly clean.</p>
          <div className="score-track"><div className="score-fill" style={{width:`${result.score}%`, background: color}} /></div>
        </div>
      </div>

      {result.flaggedIngredients.length > 0 ? (
        <div className="section-block">
          <h2>⚠️ {result.flaggedIngredients.length} Flagged Ingredient{result.flaggedIngredients.length > 1 ? 's' : ''}</h2>
          {result.flaggedIngredients.map((f, i) => (
            <div key={i} className={`flag-card flag-${f.severity}`}>
              <div className="flag-top"><span className="flag-name">{f.name}</span><span className={`flag-badge badge-${f.severity}`}>{f.severity} risk</span></div>
              <div className="flag-reason">{f.reason}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="clean-badge">✅ No harmful ingredients detected for your health profile!</div>
      )}

      <div className="section-block">
        <h2>💡 Healthier Alternatives</h2>
        {result.swaps.map((s, i) => (
          <div key={i} className="swap-card"><span className="swap-num">{i+1}</span>{s}</div>
        ))}
      </div>

      <div className="section-block">
        <h2>📋 Full Ingredients</h2>
        <div className="ingredients-box">{result.ingredients}</div>
      </div>

      <div className="result-actions">
        <button className="btn-primary large" onClick={() => setPage('scanner')}>Scan Another →</button>
        <button className="btn-outline large" onClick={() => setPage('history')}>View History</button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// HISTORY PAGE
// ─────────────────────────────────────────────
function HistoryPage({ history, setPage, setResult }: { history: ScanResult[]; setPage: (p:Page)=>void; setResult: (r:ScanResult)=>void }) {
  if (history.length === 0) return (
    <div className="page">
      <h1>📋 Scan History</h1>
      <div className="empty"><div className="empty-icon">📦</div><h3>No scans yet</h3><p>Start scanning products to see your history here.</p>
        <button className="btn-primary" onClick={() => setPage('scanner')}>Scan Your First Product →</button></div>
    </div>
  )
  const avg = Math.round(history.reduce((a,r) => a + r.score, 0) / history.length)
  return (
    <div className="page">
      <h1>📋 Scan History</h1>
      <div className="history-stats">
        <div className="hstat"><strong>{history.length}</strong><span>Total scans</span></div>
        <div className="hstat"><strong style={{color: avg >= 75 ? '#16a34a' : avg >= 50 ? '#d97706' : '#dc2626'}}>{avg}</strong><span>Avg score</span></div>
        <div className="hstat"><strong>{history.filter(r=>r.score>=75).length}</strong><span>Good products</span></div>
        <div className="hstat"><strong>{history.filter(r=>r.score<50).length}</strong><span>Poor products</span></div>
      </div>
      <div className="history-list">
        {[...history].reverse().map((r, i) => {
          const color = r.score >= 75 ? '#16a34a' : r.score >= 50 ? '#d97706' : '#dc2626'
          return (
            <div key={i} className="history-card" onClick={() => { setResult(r); setPage('results') }}>
              {r.imageUrl && <img src={r.imageUrl} alt="" className="hist-img" onError={e => (e.currentTarget.style.display='none')} />}
              <div className="hist-info"><strong>{r.productName}</strong><span>{r.brand}</span><small>{r.timestamp}</small></div>
              <div className="hist-score" style={{color}}>{r.score}<br/><small>score</small></div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// PRICING PAGE
// ─────────────────────────────────────────────
function PricingPage({ setPage, user }: { setPage: (p:Page)=>void; user: User|null }) {
  return (
    <div className="page">
      <h1>Simple, Honest Pricing</h1>
      <p className="page-desc">Start free — no credit card required. Upgrade when you need more.</p>
      <div className="pricing-grid">
        <div className="plan-card">
          <h2>Free</h2><div className="price">$0<span>/forever</span></div>
          <ul><li>✅ 3 scans per day</li><li>✅ Basic health score</li><li>✅ Ingredient flags</li><li>❌ Personal health profile</li><li>❌ Supplement scanner</li><li>❌ Smart swaps</li></ul>
          <button className="btn-outline full-w" onClick={() => setPage(user ? 'scanner' : 'signup')}>Start Free</button>
        </div>
        <div className="plan-card featured">
          <div className="badge">MOST POPULAR</div>
          <h2>Pro</h2><div className="price">$9.99<span>/month</span></div>
          <ul><li>✅ Unlimited scans</li><li>✅ Full AI reasoning</li><li>✅ Personal health profile</li><li>✅ Supplement scanner</li><li>✅ Smart swap engine</li><li>✅ Weekly email report</li></ul>
          <button className="btn-primary full-w">Upgrade to Pro</button>
        </div>
        <div className="plan-card">
          <h2>Family</h2><div className="price">$14.99<span>/month</span></div>
          <ul><li>✅ 5 family profiles</li><li>✅ Kid-safe mode</li><li>✅ Shared library</li><li>✅ Family weekly report</li><li>✅ Everything in Pro</li></ul>
          <button className="btn-outline full-w">Choose Family</button>
        </div>
      </div>
      <p className="pricing-note">Break-even at just 4 Pro subscribers · Claude API costs ~$0.003 per scan</p>
    </div>
  )
}

// ─────────────────────────────────────────────
// APP ROOT
// ─────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState<Page>('landing')
  const [user, setUser] = useState<User|null>(() => {
    const s = localStorage.getItem('ns_current')
    return s ? JSON.parse(s) : null
  })
  const [profile, setProfile] = useState<HealthProfile>(() => {
    const u = localStorage.getItem('ns_current')
    const email = u ? JSON.parse(u).email : null
    const key = email ? `ns_profile_${email}` : 'ns_profile'
    const s = localStorage.getItem(key)
    return s ? JSON.parse(s) : { name:'', conditions:[], allergies:[], dietGoals:[] }
  })
  const [history, setHistory] = useState<ScanResult[]>(() => {
    const u = localStorage.getItem('ns_current')
    const email = u ? JSON.parse(u).email : null
    const key = email ? `ns_history_${email}` : 'ns_history'
    const s = localStorage.getItem(key)
    return s ? JSON.parse(s) : []
  })
  const [currentResult, setCurrentResult] = useState<ScanResult|null>(null)

  const handleLogout = () => {
    localStorage.removeItem('ns_current')
    setUser(null)
    setProfile({ name:'', conditions:[], allergies:[], dietGoals:[] })
    setHistory([])
    setCurrentResult(null)
  }

  const handleSetUser = (u: User) => {
    setUser(u)
    const key = `ns_profile_${u.email}`
    const s = localStorage.getItem(key)
    setProfile(s ? JSON.parse(s) : { name: u.name, conditions:[], allergies:[], dietGoals:[] })
    const hkey = `ns_history_${u.email}`
    const h = localStorage.getItem(hkey)
    setHistory(h ? JSON.parse(h) : [])
  }

  const addResult = (r: ScanResult) => {
    const next = [...history, r]
    setHistory(next)
    const key = user ? `ns_history_${user.email}` : 'ns_history'
    localStorage.setItem(key, JSON.stringify(next))
  }

  return (
    <div className="app">
      <Navbar user={user} setPage={setPage} onLogout={handleLogout} />
      <div className="content">
        {page === 'landing'  && <Landing user={user} setPage={setPage} />}
        {page === 'login'    && <LoginPage setUser={handleSetUser} setPage={setPage} />}
        {page === 'signup'   && <SignupPage setUser={handleSetUser} setPage={setPage} />}
        {page === 'profile'  && <ProfilePage profile={profile} setProfile={setProfile} setPage={setPage} user={user} />}
        {page === 'scanner'  && <ScannerPage profile={profile} addResult={addResult} setPage={setPage} setResult={setCurrentResult} user={user} />}
        {page === 'results'  && <ResultsPage result={currentResult} setPage={setPage} />}
        {page === 'history'  && <HistoryPage history={history} setPage={setPage} setResult={setCurrentResult} />}
        {page === 'pricing'  && <PricingPage setPage={setPage} user={user} />}
      </div>
    </div>
  )
}