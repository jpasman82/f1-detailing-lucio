import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { 
  Trophy, Car, LayoutDashboard, History, 
  CheckCircle, Trash2, Receipt, Zap, AlertCircle, Database
} from 'lucide-react';

// --- CONFIGURACIÓN ROBUSTA ---
let firebaseConfig = null;
let debugInfo = "";

try {
  const envValue = import.meta.env.VITE_FIREBASE_CONFIG;
  const simValue = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
  const rawConfig = envValue || simValue;

  if (rawConfig) {
    firebaseConfig = typeof rawConfig === 'string' ? JSON.parse(rawConfig.trim()) : rawConfig;
  }
} catch (e) {
  debugInfo = "Error de formato JSON: " + e.message;
}

const hasConfig = firebaseConfig && firebaseConfig.apiKey;
const app = hasConfig ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'f1-detailing-lucio-v2';

const GOAL_USD = 1000;
const EXCHANGE_RATE = 40; 
const GOAL_UYU = GOAL_USD * EXCHANGE_RATE;
const WEEKLY_GOAL_COUNT = 9;

const App = () => {
  const [user, setUser] = useState(null);
  const [washes, setWashes] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ desc: '', amount: '' });

  useEffect(() => {
    if (!auth) { setLoading(false); return; }
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { 
        console.error("Auth error:", err);
        setError("Error de autenticación: " + err.message);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    
    // Timeout de seguridad: Si en 10 segundos no cargó, avisamos de las reglas
    const timeout = setTimeout(() => {
      if (loading) {
        setError("Firestore no responde. Revisa las REGLAS en la consola de Firebase.");
      }
    }, 10000);

    const washesRef = collection(db, 'artifacts', appId, 'public', 'data', 'washes');
    const unsubWashes = onSnapshot(washesRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), date: doc.data().date?.toDate() || new Date() }));
      setWashes(data.sort((a, b) => b.date - a.date));
      setLoading(false);
      setError(null);
      clearTimeout(timeout);
    }, (err) => {
      console.error("Firestore error:", err);
      setError("Error de base de datos (Reglas?): " + err.message);
      setLoading(false);
      clearTimeout(timeout);
    });

    const expensesRef = collection(db, 'artifacts', appId, 'public', 'data', 'expenses');
    const unsubExpenses = onSnapshot(expensesRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), date: doc.data().date?.toDate() || new Date() }));
      setExpenses(data.sort((a, b) => b.date - a.date));
    });

    return () => { unsubWashes(); unsubExpenses(); clearTimeout(timeout); };
  }, [user]);

  const stats = useMemo(() => {
    const totalEarnings = washes.reduce((sum, w) => sum + w.price, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const netProfit = totalEarnings - totalExpenses;
    const progressPercent = Math.min((netProfit / GOAL_UYU) * 100, 100);
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 1));
    startOfWeek.setHours(0, 0, 0, 0);
    const weeklyCount = washes.filter(w => w.date >= startOfWeek).length;
    return { totalEarnings, totalExpenses, netProfit, progressPercent, weeklyCount, weeklyPercent: Math.min((weeklyCount / WEEKLY_GOAL_COUNT) * 100, 100) };
  }, [washes, expenses]);

  const addWash = async (type) => {
    if (!user || !db) return;
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'washes'), {
      type: type === 'full' ? 'Full (Int+Ext)' : 'Exterior Solo',
      price: type === 'full' ? 850 : 420,
      date: serverTimestamp(),
      userId: user.uid
    });
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!user || !db || !expenseForm.amount) return;
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'expenses'), {
      description: expenseForm.desc || 'Insumos',
      amount: parseFloat(expenseForm.amount),
      date: serverTimestamp(),
      userId: user.uid
    });
    setExpenseForm({ desc: '', amount: '' });
    setIsAddingExpense(false);
  };

  const deleteItem = async (id, collectionName) => {
    if (!db) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', collectionName, id));
  };

  if (!hasConfig) {
    return (
      <div className="h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center text-white">
        <AlertCircle size={60} className="text-red-500 mb-6 animate-bounce" />
        <h1 className="text-2xl font-black italic uppercase mb-4">Falta Configuración</h1>
        <p className="text-slate-400 text-sm">{debugInfo || "Agrega VITE_FIREBASE_CONFIG en Vercel."}</p>
      </div>
    );
  }

  if (loading && !error) return (
    <div className="h-screen bg-slate-950 flex flex-col items-center justify-center gap-6">
      <Zap className="text-red-600 animate-pulse" size={56} />
      <div className="text-center space-y-2">
        <p className="text-red-600 font-black italic text-2xl uppercase tracking-tighter">Sincronizando con Boxes...</p>
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Conectando a Firestore</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center text-white">
      <Database size={60} className="text-yellow-500 mb-6" />
      <h1 className="text-2xl font-black italic uppercase mb-2">Error de Conexión</h1>
      <p className="text-slate-400 text-sm mb-6">{error}</p>
      <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 text-left text-[11px] space-y-2">
        <p className="font-bold text-yellow-500">Chequeo rápido:</p>
        <p>1. ¿Creaste la base de datos en Firebase?</p>
        <p>2. ¿Pusiste las reglas en "Modo de Prueba" o "true"?</p>
        <p>3. ¿Activaste el "Inicio de Sesión Anónimo"?</p>
      </div>
      <button onClick={() => window.location.reload()} className="mt-8 bg-red-600 px-8 py-3 rounded-full font-black uppercase text-xs">Reintentar</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-36">
      <header className="bg-red-700 p-6 rounded-b-[3rem] shadow-2xl border-b-4 border-black sticky top-0 z-50">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="bg-white p-1 rounded-full border-2 border-black w-14 h-14 flex items-center justify-center overflow-hidden">
              <img src="/logo.jpg" alt="F1 Logo" className="w-full h-auto object-contain" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
              <Zap style={{display: 'none'}} className="text-red-600" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-black italic tracking-tighter leading-none uppercase">F1 Detailing</h1>
              <p className="text-[10px] font-bold text-red-100 uppercase tracking-widest mt-1 opacity-80">Lucio's Team</p>
            </div>
          </div>
          <Trophy className="text-yellow-400" size={28} />
        </div>
      </header>

      <main className="p-4 space-y-6 max-w-md mx-auto">
        {activeTab === 'dashboard' ? (
          <>
            <section className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 shadow-xl relative overflow-hidden">
              <div className="flex justify-between items-end mb-4">
                <div>
                  <h2 className="text-[10px] uppercase font-black text-slate-500 tracking-widest mb-1">Ahorro Neto (USD)</h2>
                  <p className="text-4xl font-black text-white italic leading-none">${stats.netProfit.toLocaleString()}</p>
                </div>
                <div className="font-black italic text-xl text-green-400">%{stats.progressPercent.toFixed(1)}</div>
              </div>
              <div className="h-5 w-full bg-slate-800 rounded-full overflow-hidden p-1 border border-slate-700">
                <div className="h-full bg-gradient-to-r from-red-600 via-yellow-500 to-green-500 rounded-full transition-all duration-1000" style={{ width: `${stats.progressPercent}%` }} />
              </div>
              <div className="mt-6 flex gap-3 text-center">
                <div className="flex-1 bg-black/40 p-4 rounded-3xl border border-slate-800/50">
                  <p className="text-[9px] font-black text-slate-500 mb-1">VENTAS</p>
                  <p className="text-xl font-black italic text-blue-400 leading-none">${stats.totalEarnings.toLocaleString()}</p>
                </div>
                <div className="flex-1 bg-black/40 p-4 rounded-3xl border border-slate-800/50">
                  <p className="text-[9px] font-black text-slate-500 mb-1">GASTOS</p>
                  <p className="text-xl font-black italic text-red-500 leading-none">-${stats.totalExpenses.toLocaleString()}</p>
                </div>
              </div>
            </section>

            <section className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800 flex items-center justify-between shadow-lg">
              <div className="space-y-1">
                <h3 className="text-[10px] uppercase font-black text-slate-500 tracking-widest">Ritmo Semanal</h3>
                <p className="text-3xl font-black italic text-white leading-none">{stats.weeklyCount} <span className="text-base text-slate-600 font-normal">/ {WEEKLY_GOAL_COUNT}</span></p>
              </div>
              <div className="relative w-20 h-20 flex items-center justify-center">
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                  <circle cx="40" cy="40" r="35" stroke="#1e293b" strokeWidth="8" fill="none" />
                  <circle cx="40" cy="40" r="35" stroke="#dc2626" strokeWidth="8" fill="none" strokeDasharray="220" strokeDashoffset={220 - (220 * stats.weeklyPercent / 100)} strokeLinecap="round" className="transition-all duration-1000" />
                </svg>
                <span className="font-black italic text-sm text-white">%{Math.round(stats.weeklyPercent)}</span>
              </div>
            </section>

            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => addWash('ext')} className="bg-slate-900 p-6 rounded-[2.5rem] border-b-8 border-black active:translate-y-1 active:border-b-0 transition-all flex flex-col items-center gap-3">
                <div className="bg-blue-600/10 p-3 rounded-2xl"><Car className="text-blue-500" size={32} /></div>
                <span className="font-black italic text-xl text-white tracking-tighter leading-none">$420</span>
              </button>
              <button onClick={() => addWash('full')} className="bg-slate-900 p-6 rounded-[2.5rem] border-b-8 border-black active:translate-y-1 active:border-b-0 transition-all flex flex-col items-center gap-3">
                <div className="bg-green-600/10 p-3 rounded-2xl"><CheckCircle className="text-green-500" size={32} /></div>
                <span className="font-black italic text-xl text-white tracking-tighter leading-none">$850</span>
              </button>
            </div>

            <button onClick={() => setIsAddingExpense(true)} className="w-full bg-slate-900 p-5 rounded-[1.5rem] border-2 border-slate-800 border-dashed text-slate-500 font-black uppercase text-[10px] tracking-widest flex justify-center gap-3 items-center">
              <Receipt size={20} /> Registrar Gasto
            </button>
          </>
        ) : (
          <div className="space-y-4">
             <h2 className="text-2xl font-black italic uppercase flex items-center gap-3 mb-6 px-2 leading-none">
              <History className="text-red-600" /> Historial
            </h2>
            {[...washes.map(w => ({...w, t: 'w'})), ...expenses.map(e => ({...e, t: 'e'}))]
              .sort((a,b) => b.date - a.date)
              .map(item => (
                <div key={item.id} className="bg-slate-900 p-5 rounded-3xl border border-slate-800 flex justify-between items-center group shadow-md hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-2xl ${item.t === 'w' ? 'bg-blue-600/20 text-blue-500' : 'bg-red-600/20 text-red-500'}`}>
                      {item.t === 'w' ? <Car size={24} /> : <Receipt size={24} />}
                    </div>
                    <div>
                      <p className="font-black italic text-base uppercase leading-none text-white">{item.description || (item.price > 500 ? 'Full Service' : 'Exterior Solo')}</p>
                      <p className="text-[10px] text-slate-600 font-bold mt-1 uppercase tracking-widest">{item.date.toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 font-black italic">
                    <span className={`text-lg ${item.t === 'w' ? 'text-white' : 'text-red-500'}`}>
                      {item.t === 'w' ? '+' : '-'}${item.price || item.amount}
                    </span>
                    <button onClick={() => deleteItem(item.id, item.t === 'w' ? 'washes' : 'expenses')} className="text-slate-700 hover:text-red-500 transition-all p-2"><Trash2 size={18} /></button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </main>

      <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-[340px] bg-slate-900/95 backdrop-blur-xl border border-white/10 p-4 rounded-[2.5rem] flex justify-around shadow-2xl z-50">
        <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'dashboard' ? 'text-red-500 scale-110' : 'text-slate-600'}`}>
          <LayoutDashboard size={26} /><span className="text-[9px] font-black uppercase tracking-widest mt-1">Dashboard</span>
        </button>
        <button onClick={() => setActiveTab('history')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'history' ? 'text-red-500 scale-110' : 'text-slate-600'}`}>
          <History size={26} /><span className="text-[9px] font-black uppercase tracking-widest mt-1">Boxes</span>
        </button>
      </nav>

      {isAddingExpense && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-slate-900 w-full max-w-xs rounded-[3rem] border border-slate-800 p-8 shadow-2xl">
            <h3 className="text-2xl font-black italic uppercase text-red-500 mb-6 tracking-tighter leading-none">Pit Stop: Gasto</h3>
            <form onSubmit={handleAddExpense} className="space-y-5">
              <input type="text" placeholder="¿Qué compraste?" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-white font-bold focus:outline-none focus:border-red-600" value={expenseForm.desc} onChange={e => setExpenseForm({...expenseForm, desc: e.target.value})} />
              <input type="number" placeholder="Monto UYU" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-white text-3xl font-black italic focus:outline-none focus:border-red-600" value={expenseForm.amount} onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})} />
              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => setIsAddingExpense(false)} className="flex-1 font-black text-slate-600 uppercase text-xs tracking-widest leading-none">Cancelar</button>
                <button type="submit" className="flex-1 p-5 bg-red-700 rounded-2xl font-black text-white uppercase text-xs shadow-xl active:scale-95 transition-transform leading-none">Confirmar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
