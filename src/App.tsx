import { useState, useRef, useEffect, useCallback } from 'react'
import './App.css'

type Page = 'landing'|'login'|'signup'|'profile'|'scanner'|'results'|'history'|'pricing'

interface User { name:string; email:string; password:string }
interface HealthProfile { name:string; conditions:string[]; allergies:string[]; dietGoals:string[] }
interface FlaggedIngredient { name:string; reason:string; severity:'high'|'medium'|'low' }
interface Nutrient { name:string; value:string; unit:string; level:'low'|'medium'|'high'|'ok' }
interface ScanResult {
  barcode:string; productName:string; brand:string; ingredients:string
  score:number; flaggedIngredients:FlaggedIngredient[]; swaps:string[]
  timestamp:string; imageUrl?:string; nutrients:Nutrient[]
  novaScore?:number; nutriScore?:string; additives:string[]
  quantity?:string; categories?:string
}

const HARMFUL:{name:string;reason:string;severity:'high'|'medium'|'low';conditions:string[]}[]=[
  {name:'high fructose corn syrup',reason:'Linked to obesity and metabolic disorders',severity:'high',conditions:['Diabetes']},
  {name:'aspartame',reason:'Artificial sweetener with controversial health effects',severity:'medium',conditions:[]},
  {name:'sodium nitrate',reason:'Preservative linked to increased cancer risk',severity:'high',conditions:[]},
  {name:'carrageenan',reason:'May cause inflammation and digestive issues',severity:'medium',conditions:[]},
  {name:'partially hydrogenated',reason:'Trans fats — strongly linked to heart disease',severity:'high',conditions:[]},
  {name:'red 40',reason:'Artificial dye linked to hyperactivity in children',severity:'medium',conditions:[]},
  {name:'yellow 5',reason:'Artificial dye, may cause allergic reactions',severity:'medium',conditions:[]},
  {name:'bha',reason:'Potential carcinogen used as a preservative',severity:'high',conditions:[]},
  {name:'bht',reason:'Potential carcinogen used as a preservative',severity:'high',conditions:[]},
  {name:'sodium benzoate',reason:'May react with Vitamin C to form benzene',severity:'medium',conditions:[]},
  {name:'sucralose',reason:'May disrupt gut bacteria and insulin response',severity:'medium',conditions:['Diabetes']},
  {name:'maltodextrin',reason:'Very high glycemic index — spikes blood sugar fast',severity:'medium',conditions:['Diabetes']},
  {name:'gluten',reason:'Contains gluten — harmful for celiac disease',severity:'high',conditions:['Celiac Disease']},
  {name:'wheat',reason:'Contains gluten — harmful for celiac disease',severity:'high',conditions:['Celiac Disease']},
  {name:'monosodium glutamate',reason:'MSG — may cause headaches in sensitive individuals',severity:'low',conditions:[]},
  {name:'e471',reason:'Mono and diglycerides — may contain hidden trans fats',severity:'medium',conditions:[]},
  {name:'corn syrup',reason:'Refined sugar rapidly raises blood glucose',severity:'medium',conditions:['Diabetes']},
  {name:'artificial flavor',reason:'Vague term hiding potentially harmful chemicals',severity:'low',conditions:[]},
  {name:'potassium bromate',reason:'Banned in many countries — possible carcinogen',severity:'high',conditions:[]},
  {name:'propylparaben',reason:'Endocrine disruptor — avoid during pregnancy',severity:'high',conditions:['Pregnancy']},
  {name:'acesulfame',reason:'Artificial sweetener linked to gut microbiome disruption',severity:'medium',conditions:['Diabetes']},
  {name:'titanium dioxide',reason:'Nano particles may be harmful when ingested',severity:'medium',conditions:[]},
  {name:'palm oil',reason:'High saturated fat — linked to heart disease',severity:'medium',conditions:['Heart Disease']},
]

const ADDITIVE_INFO:Record<string,string>={
  'e102':'Tartrazine – synthetic yellow dye, may cause hyperactivity',
  'e110':'Sunset Yellow – synthetic dye, linked to hyperactivity',
  'e129':'Allura Red – synthetic red dye',
  'e150a':'Caramel color – browning agent',
  'e202':'Potassium sorbate – preservative, generally safe',
  'e211':'Sodium benzoate – may react with Vit C to form benzene',
  'e250':'Sodium nitrite – meat preservative, linked to cancer',
  'e320':'BHA – antioxidant preservative, potential carcinogen',
  'e321':'BHT – antioxidant preservative, potential carcinogen',
  'e330':'Citric acid – natural preservative, safe',
  'e407':'Carrageenan – thickener, may cause inflammation',
  'e412':'Guar gum – thickener, generally safe',
  'e415':'Xanthan gum – thickener, generally safe',
  'e471':'Mono and diglycerides – emulsifier, may contain trans fats',
  'e621':'Monosodium glutamate (MSG) – flavor enhancer',
  'e951':'Aspartame – artificial sweetener, controversial',
  'e955':'Sucralose – artificial sweetener, disrupts gut bacteria',
}

function getNutrientLevel(name:string,value:number):'low'|'medium'|'high'|'ok'{
  const thresholds:Record<string,[number,number]>={fat:[3,20],saturated_fat:[1.5,5],sugars:[5,12.5],salt:[0.3,1.5],sodium:[0.12,0.6]}
  const t=thresholds[name]
  if(!t) return 'ok'
  if(value<=t[0]) return 'low'
  if(value<=t[1]) return 'medium'
  return 'high'
}

function parseNutrients(n:Record<string,number>):Nutrient[]{
  const map=[
    {key:'energy-kcal_100g',label:'Calories',unit:'kcal'},
    {key:'fat_100g',label:'Total Fat',unit:'g'},
    {key:'saturated-fat_100g',label:'Saturated Fat',unit:'g'},
    {key:'carbohydrates_100g',label:'Carbs',unit:'g'},
    {key:'sugars_100g',label:'Sugars',unit:'g'},
    {key:'fiber_100g',label:'Fiber',unit:'g'},
    {key:'proteins_100g',label:'Protein',unit:'g'},
    {key:'salt_100g',label:'Salt',unit:'g'},
    {key:'sodium_100g',label:'Sodium',unit:'mg'},
  ]
  const results:Nutrient[]=[]
  map.forEach(({key,label,unit})=>{
    let val=n[key]; if(val===undefined) return
    if(unit==='mg') val=Math.round(val*1000)
    const sk=key.split('_100g')[0].replace('-kcal','').replace('-fat','_fat').replace('-','_')
    results.push({name:label,value:Number(val).toFixed(1),unit,level:getNutrientLevel(sk,val)})
  })
  return results
}

function analyze(ingredients:string,profile:HealthProfile){
  if(!ingredients) return{flagged:[] as FlaggedIngredient[],score:65}
  const lower=ingredients.toLowerCase()
  const flagged:FlaggedIngredient[]=[]
  HARMFUL.forEach(item=>{
    if(lower.includes(item.name)){
      const personalized=item.conditions.some(c=>profile.conditions.includes(c))
      if(personalized||item.conditions.length===0){
        flagged.push({name:item.name.toUpperCase(),reason:personalized?'⚠️ ESPECIALLY BAD FOR YOU: '+item.reason:item.reason,severity:item.severity})
      }
    }
  })
  profile.allergies.forEach(a=>{
    if(a&&lower.includes(a.toLowerCase()))
      flagged.push({name:a.toUpperCase(),reason:'🚨 ALLERGY ALERT: Contains '+a+' which you listed as an allergy!',severity:'high'})
  })
  const high=flagged.filter(f=>f.severity==='high').length
  const med=flagged.filter(f=>f.severity==='medium').length
  const low=flagged.filter(f=>f.severity==='low').length
  return{flagged,score:Math.max(5,Math.min(100,100-high*20-med*8-low*3))}
}

function getSwaps(name:string,score:number){
  if(score>=80) return['Great choice! This product scored well.','Try the organic version for even fewer additives.','Look for products with fewer than 5 total ingredients.']
  return[`Search for "${name} organic" at your local health store.`,'Look for products labeled "No artificial colors or preservatives".','Try Whole Foods 365 or Simple Truth — often cleaner ingredients.']
}

// ── CAMERA ──
function CameraScanner({onDetected,onClose}:{onDetected:(c:string)=>void;onClose:()=>void}){
  const videoRef=useRef<HTMLVideoElement>(null)
  const [status,setStatus]=useState<'starting'|'scanning'|'error'>('starting')
  const [msg,setMsg]=useState('')
  const streamRef=useRef<MediaStream|null>(null)
  const timerRef=useRef<number|null>(null)
  const stopCamera=useCallback(()=>{
    if(timerRef.current) clearTimeout(timerRef.current)
    if(streamRef.current){streamRef.current.getTracks().forEach(t=>t.stop());streamRef.current=null}
  },[])
  useEffect(()=>{start();return()=>stopCamera()},[])
  const start=async()=>{
    if(!('BarcodeDetector' in window)){setStatus('error');setMsg('Camera scanning requires Chrome browser. Please type the barcode number manually.');return}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}})
      streamRef.current=stream
      if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play();setStatus('scanning');scan()}
    }catch{setStatus('error');setMsg('Camera permission denied. Please allow camera access and try again.')}
  }
  const scan=()=>{
    const det=new(window as any).BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128']})
    const loop=async()=>{
      if(!videoRef.current||!streamRef.current) return
      try{const r=await det.detect(videoRef.current);if(r.length>0){stopCamera();onDetected(r[0].rawValue);return}}catch{}
      timerRef.current=window.setTimeout(loop,300)
    }
    loop()
  }
  return(
    <div className="camera-overlay">
      <div className="camera-modal">
        <div className="camera-top"><span className="camera-title">📷 Point camera at barcode</span><button className="cam-close" onClick={()=>{stopCamera();onClose()}}>✕</button></div>
        {status==='error'?(
          <div className="cam-error-box"><div className="cam-err-icon">📷</div><p>{msg}</p>
            <button className="btn-outline full-w" style={{marginTop:16}} onClick={()=>{stopCamera();onClose()}}>Close — I'll type the barcode</button></div>
        ):(
          <div className="video-wrap">
            <video ref={videoRef} className="cam-video" playsInline muted/>
            <div className="scan-frame-outer"><div className="scan-frame-box"/>
              <p className="scan-hint">{status==='starting'?'⏳ Starting...':'🔍 Hold steady over barcode'}</p></div>
          </div>
        )}
        {status==='scanning'&&<button className="btn-outline full-w" style={{marginTop:12}} onClick={()=>{stopCamera();onClose()}}>Cancel</button>}
      </div>
    </div>
  )
}

// ── NAVBAR ──
function Navbar({user,setPage,onLogout}:{user:User|null;setPage:(p:Page)=>void;onLogout:()=>void}){
  const[open,setOpen]=useState(false)
  const go=(p:Page)=>{setPage(p);setOpen(false)}
  return(
    <nav className="navbar">
      <div className="nav-brand" onClick={()=>go('landing')}>🥦 NutriScout AI</div>
      <div className={`nav-links ${open?'open':''}`}>
        {user?(<>
          <span onClick={()=>go('scanner')}>Scanner</span>
          <span onClick={()=>go('history')}>History</span>
          <span onClick={()=>go('pricing')}>Pricing</span>
          <span onClick={()=>go('profile')}>My Profile</span>
          <span className="nav-user">👤 {user.name.split(' ')[0]}</span>
          <span className="nav-logout" onClick={()=>{onLogout();go('landing')}}>Logout</span>
        </>):(<>
          <span onClick={()=>go('pricing')}>Pricing</span>
          <span onClick={()=>go('login')}>Login</span>
          <button className="nav-signup-btn" onClick={()=>go('signup')}>Sign Up Free</button>
        </>)}
      </div>
      <div className="hamburger" onClick={()=>setOpen(!open)}>☰</div>
    </nav>
  )
}

// ── LANDING ──
function Landing({user,setPage}:{user:User|null;setPage:(p:Page)=>void}){
  return(
    <div className="landing">
      <div className="hero">
        <div className="hero-badge">🤖 AI-Powered · Personalized · Free to Start</div>
        <h1>Know What You're<br/><span className="green">Really Eating</span></h1>
        <p className="hero-desc">Scan any grocery or supplement barcode. Get a health score based on YOUR conditions — not everyone else's.</p>
        <div className="hero-btns">
          {user?<button className="btn-primary large" onClick={()=>setPage('scanner')}>Open Scanner →</button>
          :<><button className="btn-primary large" onClick={()=>setPage('signup')}>Get Started Free →</button>
            <button className="btn-outline large" onClick={()=>setPage('login')}>Login</button></>}
        </div>
        <div className="stats-row">
          {[['3M+','Products in database'],['$781B','Market by 2029'],['$9.99/mo','Pro plan'],['100%','Personalized']].map(([v,l])=>(
            <div className="stat" key={l}><strong>{v}</strong><span>{l}</span></div>
          ))}
        </div>
      </div>
      <div className="vs-section">
        <h2 className="section-title">NutriScout AI vs Yuka</h2>
        <div className="vs-table">
          <div className="vs-header"><div>Feature</div><div className="vs-yuka">Yuka</div><div className="vs-us">NutriScout AI</div></div>
          {[['Personalized to your conditions','❌','✅'],['Chemical % breakdown','❌','✅'],['Supplement scanning','❌','✅'],['AI explanation per ingredient','❌','✅'],['NOVA processing score','❌','✅'],['Smart swap suggestions','Basic','✅ Full']].map(([f,y,n])=>(
            <div className="vs-row" key={f as string}><div>{f}</div><div className="vs-yuka">{y}</div><div className="vs-us">{n}</div></div>
          ))}
        </div>
      </div>
      <div className="section">
        <h2 className="section-title">Every Scan Shows You</h2>
        <div className="cards-3">
          {[['🧪','Full Ingredient Analysis','Every ingredient explained with health impact for your specific conditions.'],
            ['📊','Nutrient Percentages','Exact fat %, sugar %, protein % per 100g with color-coded risk levels.'],
            ['⚗️','Chemical Additives','All E-numbers decoded — what they are and if they\'re risky for you.'],
            ['🏭','NOVA Processing Score','How processed is this food? 1 = natural, 4 = ultra-processed.'],
            ['🔄','Healthier Swaps','3 specific alternatives when a product scores poorly.'],
            ['📷','Camera Scanner','Point phone at shelf → instant results in 1 second.'],
          ].map(([icon,title,desc])=>(
            <div className="card" key={title as string}><div className="card-icon">{icon}</div><h3>{title as string}</h3><p>{desc as string}</p></div>
          ))}
        </div>
      </div>
      <div className="cta-section">
        <h2>3 Million products. Your health. Your score.</h2>
        <p>Free account · No credit card · Works on any grocery barcode</p>
        <button className="btn-primary large" onClick={()=>setPage(user?'scanner':'signup')}>
          {user?'Open Scanner →':'Create Free Account →'}
        </button>
      </div>
    </div>
  )
}

// ── SIGNUP ──
function SignupPage({setUser,setPage}:{setUser:(u:User)=>void;setPage:(p:Page)=>void}){
  const[form,setForm]=useState({name:'',email:'',password:'',confirm:''})
  const[error,setError]=useState('')
  const set=(k:string,v:string)=>setForm(p=>({...p,[k]:v}))
  const submit=()=>{
    if(!form.name.trim()){setError('Please enter your name.');return}
    if(!form.email.includes('@')){setError('Please enter a valid email.');return}
    if(form.password.length<6){setError('Password must be at least 6 characters.');return}
    if(form.password!==form.confirm){setError('Passwords do not match.');return}
    const accounts:User[]=JSON.parse(localStorage.getItem('ns_accounts')||'[]')
    if(accounts.find(a=>a.email===form.email)){setError('Email already exists. Please login.');return}
    const u:User={name:form.name.trim(),email:form.email.trim(),password:form.password}
    accounts.push(u);localStorage.setItem('ns_accounts',JSON.stringify(accounts));localStorage.setItem('ns_current',JSON.stringify(u))
    setUser(u);setPage('profile')
  }
  return(
    <div className="auth-page"><div className="auth-card">
      <div className="auth-logo">🥦</div><h1>Create Your Account</h1><p className="auth-sub">Free forever · No credit card needed</p>
      <div className="form-group"><label>Full Name</label><input className="input" placeholder="Your full name" value={form.name} onChange={e=>set('name',e.target.value)}/></div>
      <div className="form-group"><label>Email Address</label><input className="input" type="email" placeholder="you@email.com" value={form.email} onChange={e=>set('email',e.target.value)}/></div>
      <div className="form-group"><label>Password</label><input className="input" type="password" placeholder="At least 6 characters" value={form.password} onChange={e=>set('password',e.target.value)}/></div>
      <div className="form-group"><label>Confirm Password</label><input className="input" type="password" placeholder="Type password again" value={form.confirm} onChange={e=>set('confirm',e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()}/></div>
      {error&&<div className="auth-error">⚠️ {error}</div>}
      <button className="btn-primary large full-w" onClick={submit}>Create Account →</button>
      <p className="auth-switch">Already have an account? <span className="link-btn" onClick={()=>setPage('login')}>Login here</span></p>
    </div></div>
  )
}

// ── LOGIN ──
function LoginPage({setUser,setPage}:{setUser:(u:User)=>void;setPage:(p:Page)=>void}){
  const[email,setEmail]=useState('');const[password,setPassword]=useState('');const[error,setError]=useState('')
  const submit=()=>{
    if(!email.trim()||!password.trim()){setError('Please fill in both fields.');return}
    const accounts:User[]=JSON.parse(localStorage.getItem('ns_accounts')||'[]')
    const found=accounts.find(a=>a.email===email.trim()&&a.password===password)
    if(!found){setError('Email or password is incorrect.');return}
    localStorage.setItem('ns_current',JSON.stringify(found));setUser(found);setPage('scanner')
  }
  return(
    <div className="auth-page"><div className="auth-card">
      <div className="auth-logo">🥦</div><h1>Welcome Back</h1><p className="auth-sub">Login to your NutriScout AI account</p>
      <div className="form-group"><label>Email Address</label><input className="input" type="email" placeholder="you@email.com" value={email} onChange={e=>setEmail(e.target.value)}/></div>
      <div className="form-group"><label>Password</label><input className="input" type="password" placeholder="Your password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()}/></div>
      {error&&<div className="auth-error">⚠️ {error}</div>}
      <button className="btn-primary large full-w" onClick={submit}>Login →</button>
      <p className="auth-switch">No account? <span className="link-btn" onClick={()=>setPage('signup')}>Sign up free →</span></p>
    </div></div>
  )
}

// ── PROFILE ──
function ProfilePage({profile,setProfile,setPage,user}:{profile:HealthProfile;setProfile:(p:HealthProfile)=>void;setPage:(p:Page)=>void;user:User|null}){
  const[local,setLocal]=useState<HealthProfile>(profile)
  const[ai,setAi]=useState('');const[saved,setSaved]=useState(false)
  const CONDITIONS=['Diabetes','Celiac Disease','Pregnancy','Keto Diet','Heart Disease','Hypertension','IBS','Vegan','Gluten-Free','Lactose Intolerant']
  const GOALS=['Lose Weight','Build Muscle','Eat Clean','Reduce Sugar','Low Sodium','High Protein','Low Carb','More Fiber']
  const toggle=(k:'conditions'|'dietGoals',v:string)=>setLocal(p=>({...p,[k]:p[k].includes(v)?p[k].filter(x=>x!==v):[...p[k],v]}))
  const addA=()=>{if(ai.trim()){setLocal(p=>({...p,allergies:[...p.allergies,ai.trim()]}));setAi('')}}
  const save=()=>{
    const key=user?`ns_profile_${user.email}`:'ns_profile'
    localStorage.setItem(key,JSON.stringify(local));setProfile(local);setSaved(true)
    setTimeout(()=>{setSaved(false);setPage('scanner')},1200)
  }
  return(
    <div className="page"><h1>Your Health Profile</h1><p className="page-desc">Personalizes every scan to your needs. The more you fill in, the more accurate your scores.</p>
      <div className="form-group"><label>Your Name</label><input className="input" placeholder="Enter your name" value={local.name} onChange={e=>setLocal(p=>({...p,name:e.target.value}))}/></div>
      <div className="form-group"><label>Health Conditions <span className="hint">— tap all that apply</span></label>
        <div className="chips">{CONDITIONS.map(c=><button key={c} className={`chip ${local.conditions.includes(c)?'active':''}`} onClick={()=>toggle('conditions',c)}>{c}</button>)}</div></div>
      <div className="form-group"><label>Diet Goals</label>
        <div className="chips">{GOALS.map(g=><button key={g} className={`chip ${local.dietGoals.includes(g)?'active':''}`} onClick={()=>toggle('dietGoals',g)}>{g}</button>)}</div></div>
      <div className="form-group"><label>Allergies <span className="hint">— type and press Add</span></label>
        <div className="row-input"><input className="input" placeholder="e.g. peanuts, shellfish, dairy" value={ai} onChange={e=>setAi(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addA()}/><button className="btn-primary" onClick={addA}>Add</button></div>
        <div className="chips" style={{marginTop:10}}>{local.allergies.map(a=><span key={a} className="chip active">{a}<span className="remove" onClick={()=>setLocal(p=>({...p,allergies:p.allergies.filter(x=>x!==a)}))}>✕</span></span>)}</div></div>
      <button className="btn-primary large full-w" onClick={save}>{saved?'✅ Saved! Opening scanner...':'Save Profile & Start Scanning →'}</button>
    </div>
  )
}

// ── SCANNER ──
function ScannerPage({profile,addResult,setPage,setResult,user}:{profile:HealthProfile;addResult:(r:ScanResult)=>void;setPage:(p:Page)=>void;setResult:(r:ScanResult)=>void;user:User|null}){
  const[barcode,setBarcode]=useState('');const[loading,setLoading]=useState(false);const[error,setError]=useState('');const[showCam,setShowCam]=useState(false)
  const SAMPLES=[{code:'737628064502',name:'Nutella'},{code:'016000275607',name:'Cheerios'},{code:'049000028904',name:'Coca-Cola'},{code:'021130126026',name:"Lay's"},{code:'038000845857',name:"Kellogg's"},{code:'070038629511',name:'Oreos'},{code:'041196898396',name:'Kind Bar'},{code:'010700603950',name:'Nature Valley'}]
  const scan=async(code:string)=>{
    const b=code.trim();if(!b){setError('Please enter a barcode number.');return}
    setLoading(true);setError('');setBarcode(b)
    try{
      const res=await fetch(`https://world.openfoodfacts.org/api/v0/product/${b}.json`)
      const data=await res.json()
      if(data.status===0||!data.product){setError('Product not found. Try a sample barcode below.');setLoading(false);return}
      const p=data.product
      const ingredients=p.ingredients_text||p.ingredients_text_en||''
      const{flagged,score}=analyze(ingredients,profile)
      const nutrients=parseNutrients(p.nutriments||{})
      const additives:string[]=(p.additives_tags||[]).map((a:string)=>{
        const c=a.replace('en:','').toLowerCase()
        return ADDITIVE_INFO[c]?`${c.toUpperCase()}: ${ADDITIVE_INFO[c]}`:`${c.toUpperCase()}: Food additive`
      })
      const result:ScanResult={
        barcode:b,productName:p.product_name||p.product_name_en||'Unknown Product',
        brand:p.brands||'Unknown Brand',ingredients:ingredients||'Not listed.',
        score,flaggedIngredients:flagged,swaps:getSwaps(p.product_name||'this product',score),
        timestamp:new Date().toLocaleString(),imageUrl:p.image_front_small_url||p.image_url,
        nutrients,novaScore:p.nova_group,nutriScore:p.nutriscore_grade?.toUpperCase(),
        additives,quantity:p.quantity,categories:p.categories?.split(',').slice(0,3).join(', ')
      }
      addResult(result);setResult(result);setPage('results')
    }catch{setError('Network error. Check connection and try again.')}
    setLoading(false)
  }
  return(
    <div className="page">
      {showCam&&<CameraScanner onDetected={c=>{setShowCam(false);scan(c)}} onClose={()=>setShowCam(false)}/>}
      <h1>🔍 Scan Any Product</h1>
      <p className="page-desc">Works with <strong>3 million+</strong> products worldwide.</p>
      {profile.conditions.length>0&&<div className="profile-banner">✅ Personalized for <strong>{profile.name||user?.name||'you'}</strong> · {profile.conditions.join(', ')}</div>}
      <button className="camera-launch-btn" onClick={()=>setShowCam(true)}>
        <span className="cam-btn-icon">📷</span>
        <div><strong>Open Camera Scanner</strong><small>Point at any barcode — auto-detects instantly</small></div>
        <span className="cam-btn-arrow">→</span>
      </button>
      <div className="divider"><span>or type barcode number</span></div>
      <div className="scanner-card">
        <div className="barcode-tip">💡 <strong>Where to find it:</strong> Back or bottom of any package — black and white stripes with numbers underneath</div>
        <input className="input large" value={barcode} placeholder="Type barcode e.g. 737628064502" onChange={e=>setBarcode(e.target.value)} onKeyDown={e=>e.key==='Enter'&&scan(barcode)}/>
        {error&&<div className="error-box">⚠️ {error}</div>}
        <button className="btn-primary large full-w" onClick={()=>scan(barcode)} disabled={loading}>{loading?'⏳ Fetching product data...':'🔍 Get Full Analysis'}</button>
      </div>
      <div className="samples">
        <p className="samples-title">📦 Test with popular products:</p>
        <div className="sample-grid">{SAMPLES.map(s=><button key={s.code} className="sample-btn" onClick={()=>scan(s.code)}><span>{s.name}</span><small>{s.code}</small></button>)}</div>
      </div>
      <div className="info-box"><strong>✅ Every scan shows:</strong> Ingredient analysis · Nutrient % per 100g · Chemical additives · NOVA score · Personal health score · Healthier swaps</div>
    </div>
  )
}

// ── RESULTS ──
function ResultsPage({result,setPage}:{result:ScanResult|null;setPage:(p:Page)=>void}){
  const[aiAnalysis,setAiAnalysis]=useState<{summary:string;topConcern:string;bestThing:string;verdict:string;verdictReason:string}|null>(null)
  const[aiLoading,setAiLoading]=useState(false)
  useEffect(()=>{
    if(!result) return
    const getAI=async()=>{
      setAiLoading(true)
      try{
        const res=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({productName:result.productName,ingredients:result.ingredients,conditions:result.flaggedIngredients.map(f=>f.name),allergies:[]})})
        const data=await res.json()
        if(data.analysis) setAiAnalysis(data.analysis)
      }catch{/* silent */}
      setAiLoading(false)
    }
    getAI()
  },[result])

  if(!result) return<div className="page"><p>No scan yet. <button className="link-btn" onClick={()=>setPage('scanner')}>Scan something →</button></p></div>

  const scoreColor=result.score>=75?'var(--green-400)':result.score>=50?'var(--amber-400)':'var(--red-400)'
  const scoreLabel=result.score>=75?'Good ✅':result.score>=50?'Fair ⚠️':'Poor 🚨'
  const scoreBg=result.score>=75?'rgba(34,197,94,.08)':result.score>=50?'rgba(251,191,36,.08)':'rgba(239,68,68,.08)'
  const novaLabel=['','🌿 Unprocessed','🔄 Processed ingredient','⚠️ Processed food','🚨 Ultra-processed']
  const verdictBg:Record<string,string>={BUY:'var(--green-500)',AVOID:'var(--red-500)',LIMIT:'var(--amber-500)'}

  return(
    <div className="page">
      <button className="back-btn" onClick={()=>setPage('scanner')}>← Scan Another Product</button>
      <div className="result-header">
        {result.imageUrl&&<img src={result.imageUrl} alt={result.productName} className="product-img" onError={e=>(e.currentTarget.style.display='none')}/>}
        <div>
          <h1>{result.productName}</h1>
          <p className="brand">{result.brand}</p>
          {result.quantity&&<p className="brand">Size: {result.quantity}</p>}
          {result.categories&&<p className="brand" style={{fontSize:12,color:'var(--text-400)'}}>Category: {result.categories}</p>}
          <p className="timestamp">{result.timestamp}</p>
        </div>
      </div>

      <div className="score-card" style={{background:scoreBg}}>
        <div className="score-circle" style={{borderColor:scoreColor}}>
          <span className="score-num" style={{color:scoreColor}}>{result.score}</span>
          <span className="score-lbl" style={{color:scoreColor}}>/ 100</span>
        </div>
        <div className="score-info">
          <h3 style={{color:scoreColor}}>Health Score: {scoreLabel}</h3>
          <p>Personalized to your conditions. 100 = perfectly clean ingredients.</p>
          <div className="score-track"><div className="score-fill" style={{width:`${result.score}%`,background:scoreColor}}/></div>
          <div className="badge-row">
            {result.nutriScore&&<span className={`ns-badge ns-${result.nutriScore.toLowerCase()}`}>Nutri-Score {result.nutriScore}</span>}
            {result.novaScore&&<span className="nova-badge">NOVA {result.novaScore} {novaLabel[result.novaScore]||''}</span>}
          </div>
        </div>
      </div>

      <div className="ai-block">
        <div className="ai-header">🤖 Claude AI Analysis</div>
        {aiLoading?(
          <div className="ai-loading"><div className="ai-spinner"/><span>Claude is analyzing this product for your health profile...</span></div>
        ):aiAnalysis?(
          <div className="ai-body">
            {aiAnalysis.verdict&&<div className="verdict-row">
              <span className="verdict-label">Verdict:</span>
              <span className="verdict-pill" style={{background:verdictBg[aiAnalysis.verdict]||'var(--text-400)'}}>
                {aiAnalysis.verdict==='BUY'?'✅ BUY':aiAnalysis.verdict==='AVOID'?'🚨 AVOID':'⚠️ LIMIT'}
              </span>
              <span className="verdict-reason">{aiAnalysis.verdictReason}</span>
            </div>}
            {aiAnalysis.summary&&<p className="ai-summary">{aiAnalysis.summary}</p>}
            <div className="ai-two-col">
              {aiAnalysis.topConcern&&<div className="ai-concern"><div className="ai-col-label">⚠️ Top Concern</div><div>{aiAnalysis.topConcern}</div></div>}
              {aiAnalysis.bestThing&&<div className="ai-best"><div className="ai-col-label">✅ Best Thing</div><div>{aiAnalysis.bestThing}</div></div>}
            </div>
          </div>
        ):<div className="ai-unavailable">AI analysis unavailable — add your Anthropic API key to enable this feature.</div>}
      </div>

      {result.nutrients.length>0&&(
        <div className="section-block">
          <h2>📊 Nutritional Breakdown <span className="per100">per 100g</span></h2>
          <div className="nutrient-grid">
            {result.nutrients.map((n,i)=>(
              <div key={i} className="nutrient-card">
                <div className="nutrient-name">{n.name}</div>
                <div className={`nutrient-val level-${n.level}`}>{n.value}<span className="nutrient-unit">{n.unit}</span></div>
                {n.level!=='ok'&&<div className={`nutrient-level level-${n.level}`}>{n.level==='high'?'HIGH':n.level==='medium'?'MED':'LOW'}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {result.flaggedIngredients.length>0?(
        <div className="section-block">
          <h2>⚠️ {result.flaggedIngredients.length} Harmful Ingredient{result.flaggedIngredients.length>1?'s':''} Found</h2>
          {result.flaggedIngredients.map((f,i)=>(
            <div key={i} className={`flag-card flag-${f.severity}`}>
              <div className="flag-top"><span className="flag-name">{f.name}</span><span className={`flag-badge badge-${f.severity}`}>{f.severity} risk</span></div>
              <div className="flag-reason">{f.reason}</div>
            </div>
          ))}
        </div>
      ):<div className="clean-badge">✅ No harmful ingredients detected for your health profile!</div>}

      {result.additives.length>0&&(
        <div className="section-block">
          <h2>⚗️ Chemical Additives ({result.additives.length})</h2>
          <div className="additives-list">
            {result.additives.map((a,i)=>(
              <div key={i} className="additive-row">
                <span className="add-code">{a.split(':')[0]}</span>
                <span className="add-desc">{a.split(':').slice(1).join(':').trim()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section-block">
        <h2>💡 Healthier Alternatives</h2>
        {result.swaps.map((s,i)=><div key={i} className="swap-card"><span className="swap-num">{i+1}</span>{s}</div>)}
      </div>

      <div className="section-block">
        <h2>📋 Full Ingredients List</h2>
        <div className="ingredients-box">{result.ingredients}</div>
      </div>

      <div className="result-actions">
        <button className="btn-primary large" onClick={()=>setPage('scanner')}>Scan Another →</button>
        <button className="btn-outline large" onClick={()=>setPage('history')}>View History</button>
      </div>
    </div>
  )
}

// ── HISTORY ──
function HistoryPage({history,setPage,setResult}:{history:ScanResult[];setPage:(p:Page)=>void;setResult:(r:ScanResult)=>void}){
  if(history.length===0) return(
    <div className="page"><h1>📋 Scan History</h1>
      <div className="empty"><div className="empty-icon">📦</div><h3>No scans yet</h3><p>Start scanning products to build your history.</p>
        <button className="btn-primary" onClick={()=>setPage('scanner')}>Scan Your First Product →</button></div></div>
  )
  const avg=Math.round(history.reduce((a,r)=>a+r.score,0)/history.length)
  return(
    <div className="page"><h1>📋 Scan History</h1>
      <div className="history-stats">
        <div className="hstat"><strong>{history.length}</strong><span>Total scans</span></div>
        <div className="hstat"><strong style={{color:avg>=75?'var(--green-400)':avg>=50?'var(--amber-400)':'var(--red-400)'}}>{avg}</strong><span>Avg score</span></div>
        <div className="hstat"><strong style={{color:'var(--green-400)'}}>{history.filter(r=>r.score>=75).length}</strong><span>Good products</span></div>
        <div className="hstat"><strong style={{color:'var(--red-400)'}}>{history.filter(r=>r.score<50).length}</strong><span>Poor products</span></div>
      </div>
      <div className="history-list">{[...history].reverse().map((r,i)=>{
        const color=r.score>=75?'var(--green-400)':r.score>=50?'var(--amber-400)':'var(--red-400)'
        return(<div key={i} className="history-card" onClick={()=>{setResult(r);setPage('results')}}>
          {r.imageUrl&&<img src={r.imageUrl} alt="" className="hist-img" onError={e=>(e.currentTarget.style.display='none')}/>}
          <div className="hist-info"><strong>{r.productName}</strong><span>{r.brand}</span><small>{r.timestamp}</small></div>
          <div className="hist-score" style={{color}}>{r.score}<br/><small>score</small></div>
        </div>)
      })}</div>
    </div>
  )
}

// ── PRICING ──
function PricingPage({setPage,user}:{setPage:(p:Page)=>void;user:User|null}){
  return(
    <div className="page"><h1>Simple, Honest Pricing</h1><p className="page-desc">Start free. Upgrade when ready.</p>
      <div className="pricing-grid">
        <div className="plan-card"><h2>Free</h2><div className="price">$0<span>/forever</span></div>
          <ul><li>✅ 3 scans per day</li><li>✅ Basic health score</li><li>✅ Nutrient breakdown</li><li>❌ Personal health profile</li><li>❌ AI explanations</li><li>❌ Smart swaps</li></ul>
          <button className="btn-outline full-w" onClick={()=>setPage(user?'scanner':'signup')}>Start Free</button></div>
        <div className="plan-card featured"><div className="badge">MOST POPULAR</div><h2>Pro</h2><div className="price">$9.99<span>/month</span></div>
          <ul><li>✅ Unlimited scans</li><li>✅ Full AI reasoning</li><li>✅ Personal health profile</li><li>✅ Chemical % breakdown</li><li>✅ Supplement scanner</li><li>✅ Smart swap engine</li></ul>
          <button className="btn-primary full-w">Upgrade to Pro</button></div>
        <div className="plan-card"><h2>Family</h2><div className="price">$14.99<span>/month</span></div>
          <ul><li>✅ 5 family profiles</li><li>✅ Kid-safe mode</li><li>✅ Shared library</li><li>✅ Weekly report</li><li>✅ Everything in Pro</li></ul>
          <button className="btn-outline full-w">Choose Family</button></div>
      </div>
      <p className="pricing-note">Break-even at just 4 Pro subscribers · Claude API costs ~$0.003 per scan</p>
    </div>
  )
}

// ── APP ROOT ──
export default function App(){
  const[page,setPage]=useState<Page>('landing')
  const[user,setUser]=useState<User|null>(()=>{const s=localStorage.getItem('ns_current');return s?JSON.parse(s):null})
  const[profile,setProfile]=useState<HealthProfile>(()=>{
    const u=localStorage.getItem('ns_current');const email=u?JSON.parse(u).email:null
    const s=localStorage.getItem(email?`ns_profile_${email}`:'ns_profile');return s?JSON.parse(s):{name:'',conditions:[],allergies:[],dietGoals:[]}
  })
  const[history,setHistory]=useState<ScanResult[]>(()=>{
    const u=localStorage.getItem('ns_current');const email=u?JSON.parse(u).email:null
    const s=localStorage.getItem(email?`ns_history_${email}`:'ns_history');return s?JSON.parse(s):[]
  })
  const[currentResult,setCurrentResult]=useState<ScanResult|null>(null)

  const handleLogout=()=>{localStorage.removeItem('ns_current');setUser(null);setProfile({name:'',conditions:[],allergies:[],dietGoals:[]});setHistory([]);setCurrentResult(null)}
  const handleSetUser=(u:User)=>{
    setUser(u)
    const s=localStorage.getItem(`ns_profile_${u.email}`);setProfile(s?JSON.parse(s):{name:u.name,conditions:[],allergies:[],dietGoals:[]})
    const h=localStorage.getItem(`ns_history_${u.email}`);setHistory(h?JSON.parse(h):[])
  }
  const addResult=(r:ScanResult)=>{
    const next=[...history,r];setHistory(next)
    localStorage.setItem(user?`ns_history_${user.email}`:'ns_history',JSON.stringify(next))
  }

  return(
    <div className="app">
      <Navbar user={user} setPage={setPage} onLogout={handleLogout}/>
      <div className="content">
        {page==='landing' &&<Landing user={user} setPage={setPage}/>}
        {page==='login'   &&<LoginPage setUser={handleSetUser} setPage={setPage}/>}
        {page==='signup'  &&<SignupPage setUser={handleSetUser} setPage={setPage}/>}
        {page==='profile' &&<ProfilePage profile={profile} setProfile={setProfile} setPage={setPage} user={user}/>}
        {page==='scanner' &&<ScannerPage profile={profile} addResult={addResult} setPage={setPage} setResult={setCurrentResult} user={user}/>}
        {page==='results' &&<ResultsPage result={currentResult} setPage={setPage}/>}
        {page==='history' &&<HistoryPage history={history} setPage={setPage} setResult={setCurrentResult}/>}
        {page==='pricing' &&<PricingPage setPage={setPage} user={user}/>}
      </div>
    </div>
  )
}