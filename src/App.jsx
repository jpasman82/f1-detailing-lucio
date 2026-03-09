import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, addDoc, deleteDoc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { 
  Trophy, Car, LayoutDashboard, History, 
  CheckCircle, Trash2, Receipt, Zap, AlertCircle, 
  Settings, Plus, X, DollarSign, Wallet, Percent
} from 'lucide-react';

// --- CONFIGURACIÓN FIREBASE ---
let firebaseConfig = null;
try {
  const envValue = import.meta.env.VITE_FIREBASE_CONFIG;
  const simValue = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
  const rawConfig = envValue || simValue;
  if (rawConfig) {
    firebaseConfig = typeof rawConfig === 'string' ? JSON.parse(rawConfig.trim()) : rawConfig;
  }
} catch (e) { console.error("Error config:", e); }

const hasConfig = firebaseConfig && firebaseConfig.apiKey;
const app = hasConfig ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'f1-detailing-lucio-v2';

const GOAL_USD = 1000;

const App = () => {
  const [user, setUser] = useState(null);
  const [washes, setWashes] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [config, setConfig] = useState({ exchangeRate: 40, nephewPay: 850 });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Modales
  const [showWashModal, setShowWashModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  // Forms
  const [washForm, setWashForm] = useState({ type: 'Exterior', price: 420, discount: 0, tip: 0 });
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
      } catch (err) { console.error(err); }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user || !db) return;

    // Cargar Configuración Personalizada
    const configRef = doc(db, 'artifacts', appId, 'public', 'config', 'global');
    const unsubConfig = onSnapshot(configRef, (doc) => {
      if (doc.exists()) setConfig(doc.data());
    });

    // Cargar Lavados
    const washesRef = collection(db, 'artifacts', appId, 'public', 'data', 'washes');
    const unsubWashes = onSnapshot(washesRef, (snap) => {
      setWashes(snap.docs.map(d => ({ id: d.id, ...d.data(), date: d.data().date?.toDate() || new Date() })));
      setLoading(false);
    });

    // Cargar Gastos
    const expensesRef = collection(db, 'artifacts', appId, 'public', 'data', 'expenses');
    const unsubExpenses = onSnapshot(expensesRef, (snap) => {
      setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data(), date: d.data().date?.toDate() || new Date() })));
    });

    return () => { unsubConfig(); unsubWashes(); unsubExpenses(); };
  }, [user]);

  const stats = useMemo(() => {
    // Total recaudado (Precio - Descuento + Propina)
    const totalSales = washes.reduce((sum, w) => sum + (w.price - (w.discount || 0) + (w.tip || 0)), 0);
    // Lo que se le pagó a Lucio ( NephewPay por cada lavado )
    const totalNephewPay = washes.length * config.nephewPay;
    // Gastos en insumos
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    
    // Ahorro Neto en Pesos
    const netProfitUYU = totalSales - totalNephewPay - totalExpenses;
    // Ahorro Neto en USD
    const netProfitUSD = netProfitUYU / config.exchangeRate;
    const progressPercent = Math.min((netProfitUSD / GOAL_USD) * 100, 100);

    return { totalSales, totalExpenses, totalNephewPay, netProfitUSD, progressPercent, remainingUSD: Math.max(GOAL_USD - netProfitUSD, 0) };
  }, [washes, expenses, config]);

  const handleAddWash = async (e) => {
    e.preventDefault();
    if (!db) return;
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'washes'), {
      ...washForm,
      date: serverTimestamp(),
      userId: user.uid
    });
    setShowWashModal(false);
    setWashForm({ type: 'Exterior', price: 420, discount: 0, tip: 0 });
  };

  const handleUpdateConfig = async (e) => {
    e.preventDefault();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'config', 'global'), config);
    setShowSettings(false);
  };

  const handleDelete = async (id, coll) => {
    if (confirm("¿Seguro que quieres borrar este registro?")) {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', coll, id));
    }
  };

  if (!hasConfig) return <div className="h-screen bg-slate-950 flex items-center justify-center p-10 text-center text-white italic">Falta Configuración de Firebase</div>;
  if (loading) return <div className="h-screen bg-slate-950 flex items-center justify-center text-red-600 font-black italic animate-pulse text-2xl">CARGANDO BOXES...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-32">
      <header className="bg-red-700 p-6 rounded-b-[3rem] shadow-2xl border-b-4 border-black sticky top-0 z-50">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="bg-white p-1 rounded-full border-2 border-black w-14 h-14 flex items-center justify-center overflow-hidden">
              <img src="/logo.jpg" alt="Logo" className="w-full h-auto object-contain" onError={(e) => e.target.style.display='none'} />
              <Zap className="text-red-600" />
            </div>
            <div>
              <h1 className="text-2xl font-black italic uppercase leading-none">F1 Detailing</h1>
              <p className="text-[10px] font-bold text-red-200 uppercase tracking-widest">Control de Escudería</p>
            </div>
          </div>
          <button onClick={() => setShowSettings(true)} className="p-2 bg-black/20 rounded-full text-white/80"><Settings size={20} /></button>
        </div>
      </header>

      <main className="p-4 space-y-6 max-w-md mx-auto">
        {activeTab === 'dashboard' ? (
          <>
            {/* Meta Card */}
            <section className="bg-slate-900 p-7 rounded-[2.5rem] border border-slate-800 shadow-xl relative overflow-hidden">
              <div className="flex justify-between items-start mb-4">
                <div className="space-y-1">
                  <h2 className="text-[10px] uppercase font-black text-slate-500 tracking-widest leading-none">Ahorro Neto Acumulado</h2>
                  <p className="text-5xl font-black text-white italic tracking-tighter leading-none">${Math.round(stats.netProfitUSD)} <span className="text-sm text-slate-600 not-italic uppercase tracking-normal">USD</span></p>
                </div>
                <Trophy className="text-yellow-500 drop-shadow-md" size={32} />
              </div>

              <div className="space-y-2 mt-6">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <span>Progreso</span>
                  <span>Meta: $1.000 USD</span>
                </div>
                <div className="h-6 w-full bg-slate-800 rounded-full overflow-hidden p-1.5 border border-slate-700 shadow-inner">
                  <div 
                    className="h-full bg-gradient-to-r from-red-600 via-yellow-500 to-green-500 rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(220,38,38,0.3)]" 
                    style={{ width: `${stats.progressPercent}%` }} 
                  />
                </div>
                <p className="text-center text-[11px] font-bold italic text-slate-500">
                  {stats.remainingUSD > 0 ? `Faltan $${Math.round(stats.remainingUSD)} USD para el objetivo` : '🏁 ¡OBJETIVO CUMPLIDO!'}
                </p>
              </div>
            </section>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900 p-4 rounded-3xl border border-slate-800">
                <p className="text-[9px] font-black text-slate-500 mb-1 uppercase tracking-widest">Caja (Pesos)</p>
                <p className="text-xl font-black italic text-blue-400 leading-none">${stats.totalSales.toLocaleString()}</p>
              </div>
              <div className="bg-slate-900 p-4 rounded-3xl border border-slate-800">
                <p className="text-[9px] font-black text-slate-500 mb-1 uppercase tracking-widest">Fijo Lucio</p>
                <p className="text-xl font-black italic text-red-500 leading-none">-${stats.totalNephewPay.toLocaleString()}</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setShowWashModal(true)} 
                className="bg-red-700 p-6 rounded-[2.5rem] border-b-8 border-black active:translate-y-1 active:border-b-0 transition-all flex flex-col items-center gap-3 group"
              >
                <Car className="text-white group-active:scale-90" size={32} />
                <span className="font-black italic uppercase text-xs text-white">Nuevo Lavado</span>
              </button>
              <button 
                onClick={() => setShowExpenseModal(true)} 
                className="bg-slate-900 p-6 rounded-[2.5rem] border-b-8 border-black active:translate-y-1 active:border-b-0 transition-all flex flex-col items-center gap-3 group"
              >
                <Receipt className="text-slate-400 group-active:scale-90" size={32} />
                <span className="font-black italic uppercase text-xs text-slate-400">Gasto Insumos</span>
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <h2 className="text-3xl font-black italic uppercase tracking-tighter flex items-center gap-3 mb-6 px-2">
              <History className="text-red-600" /> Registro Completo
            </h2>
            {[...washes.map(w => ({...w, t: 'w'})), ...expenses.map(e => ({...e, t: 'e'}))]
              .sort((a,b) => b.date - a.date)
              .map(item => (
                <div key={item.id} className="bg-slate-900 p-5 rounded-3xl border border-slate-800 flex justify-between items-center shadow-lg group">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-2xl ${item.t === 'w' ? 'bg-blue-600/10 text-blue-500' : 'bg-red-600/10 text-red-500'}`}>
                      {item.t === 'w' ? <Car size={24} /> : <Receipt size={24} />}
                    </div>
                    <div>
                      <p className="font-black italic text-base uppercase leading-none text-white tracking-tight">
                        {item.t === 'w' ? `${item.type} ${item.tip > 0 ? '+ Propa' : ''}` : item.description}
                      </p>
                      <p className="text-[10px] text-slate-600 font-bold mt-1 uppercase tracking-widest">{item.date.toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`font-black italic text-lg ${item.t === 'w' ? 'text-white' : 'text-red-500'}`}>
                      {item.t === 'w' ? `+$${item.price - (item.discount || 0) + (item.tip || 0)}` : `-$${item.amount}`}
                    </span>
                    <button onClick={() => handleDelete(item.id, item.t === 'w' ? 'washes' : 'expenses')} className="text-slate-800 hover:text-red-600 transition-colors p-1"><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </main>

      {/* Navigation */}
      <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-[340px] bg-slate-900/90 backdrop-blur-xl border border-white/10 p-4 rounded-[2.5rem] flex justify-around shadow-2xl z-50">
        <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center gap-1 ${activeTab === 'dashboard' ? 'text-red-500' : 'text-slate-600'}`}>
          <LayoutDashboard size={24} /><span className="text-[9px] font-black uppercase tracking-widest">Panel</span>
        </button>
        <button onClick={() => setActiveTab('history')} className={`flex flex-col items-center gap-1 ${activeTab === 'history' ? 'text-red-500' : 'text-slate-600'}`}>
          <History size={24} /><span className="text-[9px] font-black uppercase tracking-widest">Boxes</span>
        </button>
      </nav>

      {/* Wash Modal */}
      {showWashModal && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-slate-900 w-full max-w-sm rounded-[3rem] border border-slate-800 p-8 shadow-2xl relative overflow-hidden">
            <h3 className="text-2xl font-black italic uppercase text-red-600 mb-6 leading-none">Registrar Lavado</h3>
            <form onSubmit={handleAddWash} className="space-y-5 relative z-10">
              <div className="grid grid-cols-2 gap-2">
                <button 
                  type="button"
                  onClick={() => setWashForm({...washForm, type: 'Exterior', price: 420})}
                  className={`p-4 rounded-2xl font-black uppercase text-[10px] border-2 transition-all ${washForm.type === 'Exterior' ? 'border-red-600 bg-red-600/10 text-white' : 'border-slate-800 text-slate-500'}`}
                >Exterior</button>
                <button 
                  type="button"
                  onClick={() => setWashForm({...washForm, type: 'Full Service', price: 850})}
                  className={`p-4 rounded-2xl font-black uppercase text-[10px] border-2 transition-all ${washForm.type === 'Full Service' ? 'border-red-600 bg-red-600/10 text-white' : 'border-slate-800 text-slate-500'}`}
                >Full Service</button>
              </div>
              
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-600 uppercase ml-2">Precio Base ($)</label>
                <input type="number" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-black italic" value={washForm.price} onChange={e => setWashForm({...washForm, price: parseInt(e.target.value)})}/>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-600 uppercase ml-2">Descuento ($)</label>
                  <input type="number" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-red-400 font-bold" value={washForm.discount} onChange={e => setWashForm({...washForm, discount: parseInt(e.target.value)})}/>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-600 uppercase ml-2">Propina ($)</label>
                  <input type="number" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-green-400 font-bold" value={washForm.tip} onChange={e => setWashForm({...washForm, tip: parseInt(e.target.value)})}/>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowWashModal(false)} className="flex-1 font-black uppercase text-xs text-slate-500">Cerrar</button>
                <button type="submit" className="flex-1 bg-red-600 p-4 rounded-2xl font-black uppercase text-xs text-white">Confirmar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-6">
          <div className="bg-slate-900 w-full max-w-sm rounded-[3rem] border border-slate-800 p-8">
            <h3 className="text-2xl font-black italic uppercase text-yellow-500 mb-6 flex items-center gap-2"><Settings /> Boxes Setup</h3>
            <form onSubmit={handleUpdateConfig} className="space-y-6">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-600 uppercase ml-2">Tipo de Cambio (1 USD = ? UYU)</label>
                <input type="number" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-black italic" value={config.exchangeRate} onChange={e => setConfig({...config, exchangeRate: parseFloat(e.target.value)})}/>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-600 uppercase ml-2">Fijo Lucio por Auto ($ UYU)</label>
                <input type="number" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-black italic" value={config.nephewPay} onChange={e => setConfig({...config, nephewPay: parseInt(e.target.value)})}/>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowSettings(false)} className="flex-1 font-black uppercase text-xs text-slate-500">Cancelar</button>
                <button type="submit" className="flex-1 bg-yellow-600 p-4 rounded-2xl font-black uppercase text-xs text-black">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-6">
          <div className="bg-slate-900 w-full max-w-sm rounded-[3rem] border border-slate-800 p-8 shadow-2xl">
            <h3 className="text-2xl font-black italic uppercase text-red-500 mb-6 leading-none">Gasto de Pit Stop</h3>
            <form onSubmit={async (e) => {
              e.preventDefault();
              await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'expenses'), {
                description: expenseForm.desc || 'Insumos',
                amount: parseFloat(expenseForm.amount),
                date: serverTimestamp(),
                userId: user.uid
              });
              setShowExpenseModal(false);
              setExpenseForm({ desc: '', amount: '' });
            }} className="space-y-5">
              <input type="text" placeholder="¿Qué compraste?" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-white font-bold" value={expenseForm.desc} onChange={e => setExpenseForm({...expenseForm, desc: e.target.value})} />
              <input type="number" placeholder="Monto UYU" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-white text-3xl font-black italic" value={expenseForm.amount} onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})} />
              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => setShowExpenseModal(false)} className="flex-1 font-black text-slate-600 uppercase text-xs">Cerrar</button>
                <button type="submit" className="flex-1 p-5 bg-red-700 rounded-2xl font-black text-white uppercase text-xs">Confirmar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;