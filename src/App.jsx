import React, { useState, useEffect, useMemo, Component } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, addDoc, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { 
  Trophy, Car, LayoutDashboard, History, 
  Trash2, Receipt, Zap, AlertCircle, 
  Settings, Plus, Database, TriangleAlert,
  ChevronLeft, ChevronRight
} from 'lucide-react';

// --- 1. SISTEMA ANTICRASH ---
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("Error capturado:", error, errorInfo);
    this.setState({ errorInfo });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 p-8 text-white flex flex-col justify-center">
          <AlertCircle size={64} className="text-red-500 mb-6 mx-auto" />
          <h1 className="text-3xl font-black italic uppercase text-center mb-2">Error de Sistema</h1>
          <p className="text-center text-slate-400 text-sm mb-6">Dato corrupto detectado en Firebase.</p>
          <button onClick={() => window.location.reload()} className="mx-auto bg-red-600 p-4 rounded-xl font-black uppercase tracking-widest text-xs">
            Reiniciar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- 2. CONFIGURACIÓN DE FIREBASE ---
let firebaseConfig = null;
try {
  const envValue = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_FIREBASE_CONFIG : null;
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

const parseSafeDate = (val) => {
  try {
    if (!val) return new Date();
    if (typeof val.toDate === 'function') return val.toDate();
    if (val instanceof Date) return val;
    return new Date(val); 
  } catch (e) {
    return new Date();
  }
};

// Formateador de Fechas
const formatWeek = (start, end) => {
  const opts = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('es-ES', opts)} al ${end.toLocaleDateString('es-ES', opts)}`;
};

// --- 3. APLICACIÓN PRINCIPAL ---
const AppContent = () => {
  const [user, setUser] = useState(null);
  const [washes, setWashes] = useState([]);
  const [expenses, setExpenses] = useState([]);
  
  // Configuración con meta de autos agregada
  const [config, setConfig] = useState({ exchangeRate: 40, priceExt: 420, priceFull: 850, weeklyGoal: 9 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Navegación Semanal (0 = actual, -1 = pasada, etc.)
  const [weekOffset, setWeekOffset] = useState(0);
  
  // Estados de carga de formularios (Anti Doble Clic)
  const [isSubmittingWash, setIsSubmittingWash] = useState(false);
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

  const [showWashModal, setShowWashModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  const [washForm, setWashForm] = useState({ type: 'Exterior', detail: '', price: 420, discount: 0, tip: 0 });
  const [expenseForm, setExpenseForm] = useState({ desc: '', amount: '' });

  // Autenticación
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
        setError("Error de autenticación: " + err.message);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  // Carga de Datos desde Firebase
  useEffect(() => {
    if (!user || !db) return;

    const configRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
    const unsubConfig = onSnapshot(configRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setConfig(prev => ({ 
          exchangeRate: Number(data.exchangeRate) || prev.exchangeRate, 
          priceExt: Number(data.priceExt) || prev.priceExt,
          priceFull: Number(data.priceFull) || prev.priceFull,
          weeklyGoal: Number(data.weeklyGoal) || prev.weeklyGoal
        }));
      }
    });

    const washesRef = collection(db, 'artifacts', appId, 'public', 'data', 'washes');
    const unsubWashes = onSnapshot(washesRef, (snap) => {
      try {
        const data = snap.docs.map(d => {
          const raw = d.data();
          return { id: d.id, ...raw, date: parseSafeDate(raw.date) };
        });
        setWashes(data.sort((a,b) => b.date - a.date));
        setLoading(false);
      } catch (e) {
        setError("Error filtrando lavados: " + e.message);
      }
    });

    const expensesRef = collection(db, 'artifacts', appId, 'public', 'data', 'expenses');
    const unsubExpenses = onSnapshot(expensesRef, (snap) => {
      try {
        const data = snap.docs.map(d => {
          const raw = d.data();
          return { id: d.id, ...raw, date: parseSafeDate(raw.date) };
        });
        setExpenses(data.sort((a,b) => b.date - a.date));
      } catch (e) {
        console.error("Error en gastos:", e);
      }
    });

    return () => { unsubConfig(); unsubWashes(); unsubExpenses(); };
  }, [user]);

  // Cálculos Correctos
  const stats = useMemo(() => {
    const exRate = Math.max(Number(config.exchangeRate) || 40, 1);
    const weeklyGoal = Math.max(Number(config.weeklyGoal) || 9, 1);

    const totalSales = washes.reduce((sum, w) => sum + (Number(w.price) || 0) - (Number(w.discount) || 0), 0);
    const totalTips = washes.reduce((sum, w) => sum + (Number(w.tip) || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const totalNephewPay = washes.length * config.priceExt; // O el pago acordado, aquí lo calculábamos según la caja. 
    // Nota: Dejamos la variable de sueldo viejo mapeada por si acaso, pero el Prompt dice que ya configuramos los precios base.
    
    // El Net Profit que se va sumando para la meta (Caja Base - Gastos)
    const netProfitUYU = totalSales - totalExpenses;
    const netProfitUSD = netProfitUYU / exRate;
    const progressPercent = Math.min(Math.max((netProfitUSD / GOAL_USD) * 100, 0), 100);
    const remainingUSD = Math.max(GOAL_USD - netProfitUSD, 0);

    // --- LÓGICA DE SEMANAS ---
    const today = new Date();
    const startOfCurrentWeek = new Date(today);
    startOfCurrentWeek.setHours(0,0,0,0);
    const currentDayOfWeek = startOfCurrentWeek.getDay() || 7; // Dom=7, Lun=1
    startOfCurrentWeek.setDate(startOfCurrentWeek.getDate() - (currentDayOfWeek - 1)); // Lunes

    const startOfSelectedWeek = new Date(startOfCurrentWeek);
    startOfSelectedWeek.setDate(startOfSelectedWeek.getDate() + (weekOffset * 7));
    const endOfSelectedWeek = new Date(startOfSelectedWeek);
    endOfSelectedWeek.setDate(endOfSelectedWeek.getDate() + 6);
    endOfSelectedWeek.setHours(23,59,59,999);

    const washesThisWeek = washes.filter(w => w.date >= startOfSelectedWeek && w.date <= endOfSelectedWeek);
    const carsThisWeek = washesThisWeek.length;

    // Cálculo de Ritmo Ideal (Pacing)
    let expectedCars = weeklyGoal;
    if (weekOffset === 0) {
      // Si estamos a mitad de la semana actual, promediamos según qué día es
      expectedCars = Math.round((weeklyGoal / 7) * currentDayOfWeek);
    } else if (weekOffset > 0) {
      expectedCars = 0; // Semanas futuras todavía no empezaron
    }

    const paceDiff = carsThisWeek - expectedCars;
    let paceText = "";
    if (weekOffset > 0) paceText = "Semana futura";
    else if (paceDiff > 0) paceText = `🔥 Adelantado por ${paceDiff} auto${paceDiff > 1 ? 's' : ''}`;
    else if (paceDiff < 0) paceText = `⚠️ Atrasado por ${Math.abs(paceDiff)} auto${Math.abs(paceDiff) > 1 ? 's' : ''}`;
    else paceText = `✅ Ritmo ideal`;

    // --- LÓGICA DE PROYECCIÓN (ETA) ---
    // Usamos el valor Full Service para la proyección
    const profitPerFullCarUYU = config.priceFull; 
    const profitPerFullCarUSD = profitPerFullCarUYU / exRate;
    const projectedWeeklyProfitUSD = profitPerFullCarUSD * weeklyGoal;

    let etaText = "";
    if (remainingUSD <= 0) {
      etaText = "¡OBJETIVO CUMPLIDO!";
    } else if (projectedWeeklyProfitUSD > 0) {
      const weeksLeft = remainingUSD / projectedWeeklyProfitUSD;
      const daysLeft = Math.round(weeksLeft * 7);
      const monthsLeft = Math.floor(daysLeft / 30);
      const remDays = daysLeft % 30;
      
      let timeParts = [];
      if (monthsLeft > 0) timeParts.push(`${monthsLeft} mes${monthsLeft > 1 ? 'es' : ''}`);
      if (remDays > 0 || monthsLeft === 0) timeParts.push(`${remDays} día${remDays !== 1 ? 's' : ''}`);
      
      etaText = `Faltan aprox. ${timeParts.join(' y ')} para la meta`;
    } else {
      etaText = "Rentabilidad insuficiente para proyectar";
    }

    return { 
      totalSales, 
      totalExpenses, 
      totalTips, 
      netProfitUSD, 
      progressPercent, 
      remainingUSD,
      startOfSelectedWeek,
      endOfSelectedWeek,
      carsThisWeek,
      weeklyGoal,
      weeklyPercent: Math.min((carsThisWeek / weeklyGoal) * 100, 100),
      paceText,
      etaText
    };
  }, [washes, expenses, config, weekOffset]);

  // Funciones de acción
  const handleOpenWashModal = () => {
    setWashForm({ type: 'Exterior', detail: '', price: config.priceExt, discount: 0, tip: 0 });
    setShowWashModal(true);
  };

  const handleAddWash = async (e) => {
    e.preventDefault();
    if (!db || isSubmittingWash) return;
    setIsSubmittingWash(true);
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'washes'), {
        type: String(washForm.type || 'Lavado'),
        detail: String(washForm.detail || ''),
        price: Number(washForm.price) || 0,
        discount: Number(washForm.discount) || 0,
        tip: Number(washForm.tip) || 0,
        date: serverTimestamp(),
        userId: user.uid
      });
      setShowWashModal(false);
    } catch(err) {
      alert("Error: " + err.message);
    } finally {
      setIsSubmittingWash(false);
    }
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!expenseForm.amount || isSubmittingExpense) return;
    setIsSubmittingExpense(true);
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'expenses'), {
        description: String(expenseForm.desc || 'Insumos'),
        amount: Number(expenseForm.amount) || 0,
        date: serverTimestamp(),
        userId: user.uid
      });
      setShowExpenseModal(false);
      setExpenseForm({ desc: '', amount: '' });
    } catch(err) {
      alert("Error: " + err.message);
    } finally {
      setIsSubmittingExpense(false);
    }
  };

  const handleDelete = async (id, coll) => {
    if (window.confirm("¿Seguro que quieres borrar este registro?")) {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', coll, id));
    }
  };

  const handleDeleteAll = async () => {
    if (window.confirm("🚨 PELIGRO: Esto borrará TODO el historial. Quedará en 0. ¿Estás seguro?")) {
      if (window.confirm("¿ÚLTIMA ADVERTENCIA? NO se puede deshacer.")) {
        try {
          const promises = [];
          washes.forEach(w => promises.push(deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'washes', w.id))));
          expenses.forEach(e => promises.push(deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'expenses', e.id))));
          await Promise.all(promises);
          alert("Base de datos limpia. Empezamos de cero.");
          setShowSettings(false);
        } catch (error) {
          alert("Error al borrar: " + error.message);
        }
      }
    }
  };

  if (!hasConfig) return (
    <div className="h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center text-white">
      <AlertCircle size={48} className="text-red-500 mb-4 animate-bounce" />
      <h1 className="text-xl font-black italic uppercase">Falta Configuración</h1>
      <p className="text-slate-500 text-xs mt-2">Copia el JSON de Firebase en Vercel.</p>
    </div>
  );

  if (loading) return (
    <div className="h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
      <Zap className="text-red-600 animate-pulse" size={50} />
      <p className="text-red-600 font-black italic uppercase tracking-widest text-xl">Revisando Motores...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-36">
      {/* HEADER */}
      <header className="bg-red-700 p-6 rounded-b-[3.5rem] shadow-2xl border-b-4 border-black sticky top-0 z-50">
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
          <button onClick={() => setShowSettings(true)} className="p-2 bg-black/20 rounded-full active:scale-90 transition-transform">
            <Settings size={22} className="text-white" />
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="p-4 space-y-6 max-w-md mx-auto">
        {activeTab === 'dashboard' ? (
          <>
            {/* Meta Card USD */}
            <section className="bg-slate-900 p-7 rounded-[3rem] border border-slate-800 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/5 rounded-full -mr-16 -mt-16 blur-3xl opacity-50"></div>
              <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="space-y-1">
                  <h2 className="text-[10px] uppercase font-black text-slate-500 tracking-widest leading-none">Total Recaudado</h2>
                  <p className="text-5xl font-black text-white italic tracking-tighter leading-none">
                    ${Math.round(stats.netProfitUSD)} <span className="text-sm text-slate-600 not-italic uppercase">USD</span>
                  </p>
                </div>
                <Trophy className="text-yellow-500" size={36} />
              </div>

              <div className="space-y-3 mt-6 relative z-10">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <span>Progreso</span>
                  <span>Meta: $1.000 USD</span>
                </div>
                <div className="h-6 w-full bg-slate-800 rounded-full overflow-hidden p-1.5 border border-slate-700">
                  <div 
                    className="h-full bg-gradient-to-r from-red-600 via-yellow-500 to-green-500 rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(220,38,38,0.3)]" 
                    style={{ width: `${stats.progressPercent}%` }} 
                  />
                </div>
                <div className="text-center mt-2">
                  <p className="text-[10px] font-bold italic text-slate-400 uppercase tracking-widest">
                    {stats.etaText}
                  </p>
                </div>
              </div>
            </section>

            {/* Contador de Autos Semanal */}
            <section className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 shadow-xl">
              <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-4">
                <button onClick={() => setWeekOffset(w => w - 1)} className="p-2 text-slate-500 hover:text-white transition-colors"><ChevronLeft size={20}/></button>
                <div className="text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white">
                    {weekOffset === 0 ? 'Esta Semana' : weekOffset === -1 ? 'Semana Pasada' : weekOffset === 1 ? 'Próxima Semana' : `Semana ${weekOffset}`}
                  </p>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                    {formatWeek(stats.startOfSelectedWeek, stats.endOfSelectedWeek)}
                  </p>
                </div>
                <button onClick={() => setWeekOffset(w => w + 1)} className="p-2 text-slate-500 hover:text-white transition-colors"><ChevronRight size={20}/></button>
              </div>
              <div className="flex justify-between items-center px-2">
                <div>
                  <h3 className="text-[10px] uppercase font-black text-slate-500 tracking-widest">Autos Lavados</h3>
                  <p className="text-4xl font-black italic text-white leading-none tracking-tighter mt-1">
                    {stats.carsThisWeek} <span className="text-xl text-slate-600 font-normal">/ {stats.weeklyGoal}</span>
                  </p>
                  <p className="text-[9px] font-bold text-slate-400 italic mt-2 uppercase tracking-widest">
                    {stats.paceText}
                  </p>
                </div>
                <div className="relative w-20 h-20 flex items-center justify-center">
                  <svg className="absolute inset-0 w-full h-full -rotate-90">
                    <circle cx="40" cy="40" r="35" stroke="#1e293b" strokeWidth="8" fill="none" />
                    <circle cx="40" cy="40" r="35" stroke="#dc2626" strokeWidth="8" fill="none" strokeDasharray="220" strokeDashoffset={220 - (220 * stats.weeklyPercent / 100)} strokeLinecap="round" className="transition-all duration-1000" />
                  </svg>
                  <span className="font-black italic text-sm text-white">%{Math.round(stats.weeklyPercent)}</span>
                </div>
              </div>
            </section>

            {/* Cajas de Pesos */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900 p-5 rounded-[2rem] border border-slate-800 flex flex-col justify-center">
                <p className="text-[9px] font-black text-slate-500 mb-1 uppercase tracking-widest">Efectivo (UYU)</p>
                <p className="text-2xl font-black italic text-blue-400 tracking-tighter">${Math.round(stats.totalSales + stats.totalTips).toLocaleString()}</p>
                <p className="text-[9px] text-slate-600 mt-1 uppercase tracking-widest font-bold">Incluye propinas</p>
              </div>
              <div className="bg-slate-900 p-5 rounded-[2rem] border border-slate-800 flex flex-col justify-center">
                <p className="text-[9px] font-black text-slate-500 mb-1 uppercase tracking-widest">Gastos (UYU)</p>
                <p className="text-2xl font-black italic text-red-500 tracking-tighter">-${Math.round(stats.totalExpenses).toLocaleString()}</p>
                <p className="text-[9px] text-slate-600 mt-1 uppercase tracking-widest font-bold">Insumos y extra</p>
              </div>
            </div>

            {/* Botones */}
            <div className="grid grid-cols-2 gap-5">
              <button onClick={handleOpenWashModal} className="bg-red-700 p-8 rounded-[3rem] border-b-8 border-black active:translate-y-2 active:border-b-0 transition-all flex flex-col items-center gap-4 group">
                <Plus className="text-white group-active:scale-90" size={32} />
                <span className="font-black italic uppercase text-xs text-white tracking-widest">Nuevo Lavado</span>
              </button>
              <button onClick={() => setShowExpenseModal(true)} className="bg-slate-900 p-8 rounded-[3rem] border-b-8 border-black active:translate-y-2 active:border-b-0 transition-all flex flex-col items-center gap-4 group shadow-xl">
                <Receipt className="text-slate-400 group-active:scale-90" size={32} />
                <span className="font-black italic uppercase text-xs text-slate-400 tracking-widest">Gasto Insumos</span>
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-4 pt-2">
            <h2 className="text-3xl font-black italic uppercase flex items-center gap-3 mb-8 px-2 tracking-tighter">
              <History className="text-red-600" /> Historial
            </h2>
            {(washes.length === 0 && expenses.length === 0) ? (
              <div className="text-center py-20 opacity-20"><Database size={64} className="mx-auto" /></div>
            ) : (
              [...washes.map(w => ({...w, t: 'w'})), ...expenses.map(e => ({...e, t: 'e'}))]
                .sort((a,b) => b.date - a.date)
                .map(item => {
                  const isWash = item.t === 'w';
                  const title = isWash ? `${item.type}` : String(item.description || 'GASTO');
                  const valPrice = Number(item.price) || 0;
                  const valDisc = Number(item.discount) || 0;
                  const valTip = Number(item.tip) || 0;
                  const valAmount = Number(item.amount) || 0;
                  const displayDate = item.date instanceof Date ? item.date.toLocaleDateString() : '--/--/----';
                  const finalAmount = isWash ? (valPrice - valDisc + valTip) : valAmount;

                  return (
                    <div key={item.id} className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 flex justify-between items-center group">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-2xl ${isWash ? 'bg-blue-600/10 text-blue-500' : 'bg-red-600/10 text-red-500'}`}>
                          {isWash ? <Car size={26} /> : <Receipt size={26} />}
                        </div>
                        <div>
                          <p className="font-black italic text-lg uppercase leading-none text-white tracking-tight">
                            {title}
                          </p>
                          {isWash && item.detail && <p className="text-[11px] text-slate-400 font-bold mt-1 uppercase">{item.detail}</p>}
                          <p className="text-[9px] text-slate-600 font-bold mt-2 uppercase tracking-widest">{displayDate}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <span className={`block font-black italic text-xl ${isWash ? 'text-white' : 'text-red-500'}`}>
                            {isWash ? '+' : '-'}${Math.round(finalAmount)}
                          </span>
                          {isWash && valTip > 0 && <span className="text-[9px] text-green-500 font-bold uppercase block mt-1">+$ {valTip} propina</span>}
                          {isWash && valDisc > 0 && <span className="text-[9px] text-red-400 font-bold uppercase block">-$ {valDisc} dcto</span>}
                        </div>
                        <button onClick={() => handleDelete(item.id, isWash ? 'washes' : 'expenses')} className="text-slate-800 hover:text-red-600 p-2"><Trash2 size={20} /></button>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        )}
      </main>

      {/* BOTTOM NAV */}
      <nav className="fixed bottom-10 left-1/2 -translate-x-1/2 w-[90%] max-w-[360px] bg-slate-900/95 backdrop-blur-xl border border-white/10 p-5 rounded-[3rem] flex justify-around shadow-2xl z-50">
        <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center gap-1 ${activeTab === 'dashboard' ? 'text-red-500 scale-110' : 'text-slate-600'}`}>
          <LayoutDashboard size={28} /><span className="text-[10px] uppercase font-black">Panel</span>
        </button>
        <button onClick={() => setActiveTab('history')} className={`flex flex-col items-center gap-1 ${activeTab === 'history' ? 'text-red-500 scale-110' : 'text-slate-600'}`}>
          <History size={28} /><span className="text-[10px] uppercase font-black">Boxes</span>
        </button>
      </nav>

      {/* MODAL: NUEVO LAVADO */}
      {showWashModal && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-6">
          <div className="bg-slate-900 w-full max-w-sm rounded-[3.5rem] border border-slate-800 p-8">
            <h3 className="text-2xl font-black italic uppercase text-red-600 mb-6 leading-none tracking-tighter">Nuevo Lavado</h3>
            <form onSubmit={handleAddWash} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setWashForm({...washForm, type: 'Exterior', price: config.priceExt})}
                  className={`p-4 rounded-2xl font-black uppercase text-[10px] border-2 tracking-widest transition-colors ${washForm.type === 'Exterior' ? 'border-red-600 bg-red-600/10 text-white' : 'border-slate-800 text-slate-500'}`}
                >Exterior</button>
                <button type="button" onClick={() => setWashForm({...washForm, type: 'Full Service', price: config.priceFull})}
                  className={`p-4 rounded-2xl font-black uppercase text-[10px] border-2 tracking-widest transition-colors ${washForm.type === 'Full Service' ? 'border-red-600 bg-red-600/10 text-white' : 'border-slate-800 text-slate-500'}`}
                >Full</button>
              </div>
              
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-2">Detalle (Cliente/Auto)</label>
                <input type="text" placeholder="Ej: VW Golf - Juan" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold text-sm focus:border-red-600 outline-none" 
                  value={washForm.detail} onChange={e => setWashForm({...washForm, detail: e.target.value})}/>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-2">Precio Base ($ UYU)</label>
                <input type="number" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-black italic text-xl focus:border-red-600 outline-none" 
                  value={washForm.price === 0 ? '' : washForm.price} 
                  onChange={e => setWashForm({...washForm, price: e.target.value === '' ? 0 : Number(e.target.value)})}/>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-2">Dcto ($)</label>
                  <input type="number" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-red-500 font-black italic focus:border-red-600 outline-none" 
                    value={washForm.discount === 0 ? '' : washForm.discount} 
                    onChange={e => setWashForm({...washForm, discount: e.target.value === '' ? 0 : Number(e.target.value)})}/>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-2">Propa ($)</label>
                  <input type="number" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-green-500 font-black italic focus:border-red-600 outline-none" 
                    value={washForm.tip === 0 ? '' : washForm.tip} 
                    onChange={e => setWashForm({...washForm, tip: e.target.value === '' ? 0 : Number(e.target.value)})}/>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowWashModal(false)} className="flex-1 font-black uppercase text-xs text-slate-600" disabled={isSubmittingWash}>Cancelar</button>
                <button type="submit" className={`flex-1 p-5 rounded-3xl font-black uppercase text-xs text-white ${isSubmittingWash ? 'bg-slate-700' : 'bg-red-700'}`} disabled={isSubmittingWash}>
                  {isSubmittingWash ? 'Guardando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIGURACIÓN */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-6">
          <div className="bg-slate-900 w-full max-w-sm rounded-[3.5rem] border border-slate-800 p-8 overflow-y-auto max-h-[90vh]">
            <h3 className="text-2xl font-black italic uppercase text-yellow-500 mb-6 tracking-tighter leading-none">Setup Boxes</h3>
            <form onSubmit={async (e) => {
              e.preventDefault();
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global'), {
                exchangeRate: Number(config.exchangeRate) || 40,
                priceExt: Number(config.priceExt) || 420,
                priceFull: Number(config.priceFull) || 850,
                weeklyGoal: Number(config.weeklyGoal) || 9
              });
              setShowSettings(false);
            }} className="space-y-5">
              
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-2">Cotización Dólar</label>
                <input type="number" step="0.1" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-black italic text-lg" 
                  value={config.exchangeRate} onChange={e => setConfig({...config, exchangeRate: e.target.value})}/>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-2">Precio: Exterior</label>
                  <input type="number" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-black italic text-lg" 
                    value={config.priceExt} onChange={e => setConfig({...config, priceExt: e.target.value})}/>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-2">Precio: Full</label>
                  <input type="number" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-black italic text-lg" 
                    value={config.priceFull} onChange={e => setConfig({...config, priceFull: e.target.value})}/>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-2">Meta Semanal (Cant. Autos)</label>
                <input type="number" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-black italic text-lg" 
                  value={config.weeklyGoal} onChange={e => setConfig({...config, weeklyGoal: e.target.value})}/>
              </div>

              <div className="pt-4 border-t border-slate-800">
                <button type="button" onClick={handleDeleteAll} className="w-full bg-red-950/40 border border-red-900 text-red-500 p-4 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 hover:bg-red-900/60 transition-colors">
                  <TriangleAlert size={16} /> Borrar Historial
                </button>
              </div>

              <div className="flex gap-4 pt-2">
                <button type="button" onClick={() => setShowSettings(false)} className="flex-1 font-black uppercase text-xs text-slate-600">Cerrar</button>
                <button type="submit" className="flex-1 bg-yellow-600 p-5 rounded-3xl font-black uppercase text-xs text-black">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: GASTOS */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-6">
          <div className="bg-slate-900 w-full max-w-sm rounded-[3.5rem] border border-slate-800 p-10 shadow-2xl">
            <h3 className="text-3xl font-black italic uppercase text-red-500 mb-8 leading-none tracking-tighter">Nuevo Gasto</h3>
            <form onSubmit={handleAddExpense} className="space-y-6">
              <input type="text" placeholder="¿Qué compraste?" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-white font-bold text-lg focus:border-red-600 outline-none" 
                value={expenseForm.desc} 
                onChange={e => setExpenseForm({...expenseForm, desc: e.target.value})} />
              <input type="number" placeholder="Monto UYU" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-white text-4xl font-black italic focus:border-red-600 outline-none" 
                value={expenseForm.amount} 
                onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})} />
              <div className="flex gap-4 pt-8">
                <button type="button" onClick={() => setShowExpenseModal(false)} className="flex-1 font-black text-slate-600 uppercase text-xs" disabled={isSubmittingExpense}>Cerrar</button>
                <button type="submit" className={`flex-1 p-6 rounded-3xl font-black uppercase text-xs text-white ${isSubmittingExpense ? 'bg-slate-700' : 'bg-red-700'}`} disabled={isSubmittingExpense}>
                  {isSubmittingExpense ? 'Guardando...' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// --- 4. EXPORTACIÓN SEGURA ---
const App = () => (
  <ErrorBoundary>
    <AppContent />
  </ErrorBoundary>
);

export default App;