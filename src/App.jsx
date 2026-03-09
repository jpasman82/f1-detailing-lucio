import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, addDoc, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { 
  Trophy, Car, LayoutDashboard, History, 
  CheckCircle, Trash2, Receipt, Zap, AlertCircle, 
  Settings, Plus, X, DollarSign, Wallet, Percent, Database
} from 'lucide-react';

// --- CONFIGURACIÓN FIREBASE ROBUSTA ---
let firebaseConfig = null;
try {
  const envValue = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_FIREBASE_CONFIG : null;
  const simValue = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
  const rawConfig = envValue || simValue;
  if (rawConfig) {
    firebaseConfig = typeof rawConfig === 'string' ? JSON.parse(rawConfig.trim()) : rawConfig;
  }
} catch (e) { console.error("Error en configuración:", e); }

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
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Modales
  const [showWashModal, setShowWashModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  // Formularios
  const [washForm, setWashForm] = useState({ type: 'Exterior', price: 420, discount: 0, tip: 0 });
  const [expenseForm, setExpenseForm] = useState({ desc: '', amount: '' });

  // 1. Autenticación
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
        setError("Error de acceso: " + err.message);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  // 2. Carga de Datos con Protección
  useEffect(() => {
    if (!user || !db) return;

    const configRef = doc(db, 'artifacts', appId, 'public', 'config', 'global');
    const unsubConfig = onSnapshot(configRef, (doc) => {
      if (doc.exists()) setConfig(doc.data());
    }, (err) => console.error("Config load error:", err));

    const washesRef = collection(db, 'artifacts', appId, 'public', 'data', 'washes');
    const unsubWashes = onSnapshot(washesRef, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data(), date: d.data().date?.toDate() || new Date() }));
      setWashes(data.sort((a,b) => b.date - a.date));
      setLoading(false);
    }, (err) => {
      console.error("Washes load error:", err);
      setError("Error de base de datos: " + err.message);
      setLoading(false);
    });

    const expensesRef = collection(db, 'artifacts', appId, 'public', 'data', 'expenses');
    const unsubExpenses = onSnapshot(expensesRef, (snap) => {
      setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data(), date: d.data().date?.toDate() || new Date() })));
    }, (err) => console.error("Expenses load error:", err));

    return () => { unsubConfig(); unsubWashes(); unsubExpenses(); };
  }, [user]);

  // 3. Estadísticas con Escudos contra NaN y Undefined
  const stats = useMemo(() => {
    try {
      const exRate = Number(config?.exchangeRate) || 40;
      const nepPay = Number(config?.nephewPay) || 850;

      const totalSales = (washes || []).reduce((sum, w) => {
        const p = Number(w.price) || 0;
        const d = Number(w.discount) || 0;
        const t = Number(w.tip) || 0;
        return sum + (p - d + t);
      }, 0);

      const totalNephewPay = (washes || []).length * nepPay;
      const totalExpenses = (expenses || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      
      const netProfitUYU = totalSales - totalNephewPay - totalExpenses;
      const netProfitUSD = exRate > 0 ? netProfitUYU / exRate : 0;
      const progressPercent = Math.min((netProfitUSD / GOAL_USD) * 100, 100);

      return { 
        totalSales, 
        totalExpenses, 
        totalNephewPay, 
        netProfitUSD, 
        progressPercent, 
        remainingUSD: Math.max(GOAL_USD - netProfitUSD, 0) 
      };
    } catch (err) {
      console.error("Error en cálculos de stats:", err);
      return { totalSales: 0, totalExpenses: 0, totalNephewPay: 0, netProfitUSD: 0, progressPercent: 0, remainingUSD: GOAL_USD };
    }
  }, [washes, expenses, config]);

  const handleAddWash = async (e) => {
    e.preventDefault();
    if (!db) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'washes'), {
        ...washForm,
        date: serverTimestamp(),
        userId: user.uid
      });
      setShowWashModal(false);
      setWashForm({ type: 'Exterior', price: 420, discount: 0, tip: 0 });
    } catch (err) {
      alert("Error al guardar: " + err.message);
    }
  };

  const handleUpdateConfig = async (e) => {
    e.preventDefault();
    if (!db) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'config', 'global'), config);
      setShowSettings(false);
    } catch (err) {
      alert("Error al actualizar configuración: " + err.message);
    }
  };

  const handleDelete = async (id, coll) => {
    if (window.confirm("¿Seguro que quieres borrar este registro? El cambio es permanente.")) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', coll, id));
      } catch (err) {
        alert("Error al borrar: " + err.message);
      }
    }
  };

  if (!hasConfig) return (
    <div className="h-screen bg-slate-950 flex flex-col items-center justify-center p-10 text-center">
      <AlertCircle className="text-red-600 mb-4" size={48} />
      <h1 className="text-white font-black uppercase italic">Falta Configuración</h1>
      <p className="text-slate-500 text-sm mt-2">Revisa las variables de entorno en Vercel.</p>
    </div>
  );

  if (loading) return (
    <div className="h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
      <Zap className="text-red-600 animate-pulse" size={48} />
      <p className="text-red-600 font-black italic text-xl uppercase tracking-widest">Sincronizando Boxes...</p>
    </div>
  );

  if (error) return (
    <div className="h-screen bg-slate-950 flex flex-col items-center justify-center p-10 text-center">
      <Database className="text-yellow-600 mb-4" size={48} />
      <h1 className="text-white font-black uppercase italic">Error de Conexión</h1>
      <p className="text-slate-500 text-sm mt-2">{error}</p>
      <button onClick={() => window.location.reload()} className="mt-6 bg-red-600 px-6 py-2 rounded-full text-xs font-black uppercase">Reintentar</button>
    </div>
  );

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
              <p className="text-[10px] font-bold text-red-200 uppercase tracking-widest">Escudería Lucio</p>
            </div>
          </div>
          <button onClick={() => setShowSettings(true)} className="p-2 bg-black/20 rounded-full text-white/80 active:scale-90 transition-transform">
            <Settings size={22} />
          </button>
        </div>
      </header>

      <main className="p-4 space-y-6 max-w-md mx-auto">
        {activeTab === 'dashboard' ? (
          <>
            {/* Meta Card Principal */}
            <section className="bg-slate-900 p-7 rounded-[2.5rem] border border-slate-800 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/5 rounded-full -mr-16 -mt-16 blur-3xl opacity-50"></div>
              <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="space-y-1">
                  <h2 className="text-[10px] uppercase font-black text-slate-500 tracking-widest leading-none">Ahorro Neto Acumulado</h2>
                  <p className="text-5xl font-black text-white italic tracking-tighter leading-none">
                    ${Math.round(stats.netProfitUSD)} <span className="text-sm text-slate-600 not-italic uppercase">USD</span>
                  </p>
                </div>
                <Trophy className="text-yellow-500 drop-shadow-md" size={36} />
              </div>

              <div className="space-y-3 mt-6 relative z-10">
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
                <div className="flex justify-between items-center pt-1">
                  <p className="text-[10px] font-bold italic text-slate-500 uppercase tracking-tighter">
                    {stats.remainingUSD > 0 ? `Faltan $${Math.round(stats.remainingUSD)} USD` : '🏆 Meta alcanzada'}
                  </p>
                  <p className="text-[10px] font-black text-green-500">%{stats.progressPercent.toFixed(1)}</p>
                </div>
              </div>
            </section>

            {/* Estadísticas de Operación */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900 p-5 rounded-[2rem] border border-slate-800 shadow-lg">
                <p className="text-[9px] font-black text-slate-500 mb-1 uppercase tracking-widest leading-none">Caja Bruta ($)</p>
                <p className="text-2xl font-black italic text-blue-400 leading-none tracking-tighter">${stats.totalSales.toLocaleString()}</p>
              </div>
              <div className="bg-slate-900 p-5 rounded-[2rem] border border-slate-800 shadow-lg">
                <p className="text-[9px] font-black text-slate-500 mb-1 uppercase tracking-widest leading-none">Fijo Lucio ($)</p>
                <p className="text-2xl font-black italic text-red-500 leading-none tracking-tighter">-${stats.totalNephewPay.toLocaleString()}</p>
              </div>
            </div>

            {/* Acciones de Pits */}
            <div className="grid grid-cols-2 gap-5 mt-2">
              <button 
                onClick={() => setShowWashModal(true)} 
                className="bg-red-700 p-8 rounded-[3rem] border-b-[10px] border-black active:translate-y-2 active:border-b-0 transition-all flex flex-col items-center gap-4 group shadow-xl"
              >
                <Plus className="text-white group-active:scale-90" size={32} />
                <span className="font-black italic uppercase text-xs text-white tracking-widest">Nuevo Lavado</span>
              </button>
              <button 
                onClick={() => setShowExpenseModal(true)} 
                className="bg-slate-900 p-8 rounded-[3rem] border-b-[10px] border-black active:translate-y-2 active:border-b-0 transition-all flex flex-col items-center gap-4 group shadow-xl"
              >
                <Receipt className="text-slate-400 group-active:scale-90" size={32} />
                <span className="font-black italic uppercase text-xs text-slate-400 tracking-widest">Gasto Insumos</span>
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-4 pt-2">
            <h2 className="text-3xl font-black italic uppercase tracking-tighter flex items-center gap-4 mb-8 px-2 leading-none">
              <History className="text-red-600" size={32} /> Historial
            </h2>
            {[...washes.map(w => ({...w, t: 'w'})), ...expenses.map(e => ({...e, t: 'e'}))]
              .sort((a,b) => b.date - a.date)
              .map(item => (
                <div key={item.id} className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 flex justify-between items-center shadow-lg group hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-center gap-5">
                    <div className={`p-4 rounded-2xl ${item.t === 'w' ? 'bg-blue-600/10 text-blue-500' : 'bg-red-600/10 text-red-500'}`}>
                      {item.t === 'w' ? <Car size={28} /> : <Receipt size={28} />}
                    </div>
                    <div>
                      <p className="font-black italic text-lg uppercase leading-none text-white tracking-tight">
                        {item.t === 'w' ? `${item.type}` : item.description}
                      </p>
                      <p className="text-[10px] text-slate-600 font-bold mt-2 uppercase tracking-[0.2em]">{item.date.toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                       <span className={`block font-black italic text-xl tracking-tighter leading-none ${item.t === 'w' ? 'text-white' : 'text-red-500'}`}>
                        {item.t === 'w' ? `+$${item.price - (item.discount || 0) + (item.tip || 0)}` : `-$${item.amount}`}
                      </span>
                      {item.t === 'w' && item.tip > 0 && <span className="text-[9px] text-green-500 font-bold uppercase tracking-tighter">+$ {item.tip} propina</span>}
                    </div>
                    <button onClick={() => handleDelete(item.id, item.t === 'w' ? 'washes' : 'expenses')} className="text-slate-800 hover:text-red-600 transition-colors p-2 active:scale-125">
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              ))}
              {washes.length === 0 && expenses.length === 0 && (
                <div className="text-center py-20 opacity-20">
                  <Database size={64} className="mx-auto mb-4" />
                  <p className="font-black italic uppercase tracking-widest text-xs">Garaje Vacío</p>
                </div>
              )}
          </div>
        )}
      </main>

      {/* Navegación */}
      <nav className="fixed bottom-10 left-1/2 -translate-x-1/2 w-[90%] max-w-[360px] bg-slate-900/95 backdrop-blur-xl border border-white/10 p-5 rounded-[3rem] flex justify-around shadow-[0_20px_50px_rgba(0,0,0,0.6)] z-50 border-t-2 border-t-white/5">
        <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center gap-2 transition-all ${activeTab === 'dashboard' ? 'text-red-500 scale-110' : 'text-slate-600'}`}>
          <LayoutDashboard size={28} /><span className="text-[10px] uppercase tracking-widest font-black">Panel</span>
        </button>
        <div className="w-[1px] h-10 bg-slate-800 my-auto opacity-30"></div>
        <button onClick={() => setActiveTab('history')} className={`flex flex-col items-center gap-2 transition-all ${activeTab === 'history' ? 'text-red-500 scale-110' : 'text-slate-600'}`}>
          <History size={28} /><span className="text-[10px] uppercase tracking-widest font-black">Boxes</span>
        </button>
      </nav>

      {/* Modal: Nuevo Lavado */}
      {showWashModal && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-slate-900 w-full max-w-sm rounded-[3.5rem] border border-slate-800 p-10 shadow-2xl relative overflow-hidden">
            <h3 className="text-3xl font-black italic uppercase text-red-600 mb-8 leading-none tracking-tighter">Nuevo Lavado</h3>
            <form onSubmit={handleAddWash} className="space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <button 
                  type="button"
                  onClick={() => setWashForm({...washForm, type: 'Exterior', price: 420})}
                  className={`p-5 rounded-2xl font-black uppercase text-[10px] border-2 transition-all ${washForm.type === 'Exterior' ? 'border-red-600 bg-red-600/10 text-white' : 'border-slate-800 text-slate-500'}`}
                >Exterior</button>
                <button 
                  type="button"
                  onClick={() => setWashForm({...washForm, type: 'Full Service', price: 850})}
                  className={`p-5 rounded-2xl font-black uppercase text-[10px] border-2 transition-all ${washForm.type === 'Full Service' ? 'border-red-600 bg-red-600/10 text-white' : 'border-slate-800 text-slate-500'}`}
                >Full Service</button>
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Precio Base ($ UYU)</label>
                <input type="number" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-white font-black italic text-xl focus:border-red-600 focus:outline-none" value={washForm.price} onChange={e => setWashForm({...washForm, price: parseInt(e.target.value)})}/>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 leading-none">Descuento ($)</label>
                  <input type="number" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-red-500 font-black italic" value={washForm.discount} onChange={e => setWashForm({...washForm, discount: parseInt(e.target.value)})}/>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 leading-none">Propina ($)</label>
                  <input type="number" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-green-500 font-black italic" value={washForm.tip} onChange={e => setWashForm({...washForm, tip: parseInt(e.target.value)})}/>
                </div>
              </div>

              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => setShowWashModal(false)} className="flex-1 font-black uppercase text-xs text-slate-600">Cancelar</button>
                <button type="submit" className="flex-1 bg-red-700 p-6 rounded-3xl font-black uppercase text-xs text-white shadow-xl active:scale-95 transition-transform">Confirmar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Configuración */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-slate-900 w-full max-w-sm rounded-[3.5rem] border border-slate-800 p-10">
            <h3 className="text-3xl font-black italic uppercase text-yellow-500 mb-8 flex items-center gap-3 tracking-tighter"><Settings size={32} /> Setup Boxes</h3>
            <form onSubmit={handleUpdateConfig} className="space-y-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 leading-relaxed">Cotización Dólar <br/><span className="text-slate-600">(1 USD = ? UYU)</span></label>
                <input type="number" step="0.1" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-white font-black italic text-xl" value={config.exchangeRate} onChange={e => setConfig({...config, exchangeRate: parseFloat(e.target.value)})}/>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 leading-relaxed">Sueldo Lucio <br/><span className="text-slate-600">(Pesos por cada auto)</span></label>
                <input type="number" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-white font-black italic text-xl" value={config.nephewPay} onChange={e => setConfig({...config, nephewPay: parseInt(e.target.value)})}/>
              </div>
              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => setShowSettings(false)} className="flex-1 font-black uppercase text-xs text-slate-600">Cerrar</button>
                <button type="submit" className="flex-1 bg-yellow-600 p-6 rounded-3xl font-black uppercase text-xs text-black active:scale-95 transition-transform">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Gastos */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-slate-900 w-full max-w-sm rounded-[3.5rem] border border-slate-800 p-10 shadow-2xl">
            <h3 className="text-3xl font-black italic uppercase text-red-500 mb-8 leading-none tracking-tighter">Nuevo Gasto</h3>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!expenseForm.amount) return;
              await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'expenses'), {
                description: expenseForm.desc || 'Insumos',
                amount: parseFloat(expenseForm.amount),
                date: serverTimestamp(),
                userId: user.uid
              });
              setShowExpenseModal(false);
              setExpenseForm({ desc: '', amount: '' });
            }} className="space-y-6">
              <input type="text" placeholder="¿Qué compraste?" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-white font-bold text-lg" value={expenseForm.desc} onChange={e => setExpenseForm({...expenseForm, desc: e.target.value})} />
              <input type="number" placeholder="Monto UYU" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-white text-4xl font-black italic" value={expenseForm.amount} onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})} />
              <div className="flex gap-4 pt-8">
                <button type="button" onClick={() => setShowExpenseModal(false)} className="flex-1 font-black text-slate-600 uppercase text-xs">Cerrar</button>
                <button type="submit" className="flex-1 p-6 bg-red-700 rounded-3xl font-black uppercase text-xs text-white">Registrar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;