import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, addDoc, query, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { 
  Trophy, Car, LayoutDashboard, History, Plus, Target, 
  CheckCircle, Trash2, Receipt, TrendingUp, Wallet, 
  Zap, Settings, AlertCircle, Info, ChevronRight
} from 'lucide-react';

// Configuración de Firebase (Se asume que estas variables vendrán de .env en Vercel)
// Para el preview de Canvas, usamos las variables globales proporcionadas.
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: "",
      authDomain: "placeholder.firebaseapp.com",
      projectId: "placeholder",
      storageBucket: "placeholder.appspot.com",
      messagingSenderId: "000",
      appId: "000"
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
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
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ desc: '', amount: '' });
  const [error, setError] = useState(null);

  // 1. Autenticación (Regla 3)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
        setError("Error de conexión. Reintenta.");
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // 2. Escucha de Datos (Reglas 1 y 2)
  useEffect(() => {
    if (!user) return;

    const washesRef = collection(db, 'artifacts', appId, 'public', 'data', 'washes');
    const unsubWashes = onSnapshot(washesRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate() || new Date()
      }));
      setWashes(data.sort((a, b) => b.date - a.date));
      setLoading(false);
    }, (err) => {
      console.error(err);
      setError("Error al cargar lavados.");
    });

    const expensesRef = collection(db, 'artifacts', appId, 'public', 'data', 'expenses');
    const unsubExpenses = onSnapshot(expensesRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate() || new Date()
      }));
      setExpenses(data.sort((a, b) => b.date - a.date));
    }, (err) => {
      console.error(err);
      setError("Error al cargar gastos.");
    });

    return () => {
      unsubWashes();
      unsubExpenses();
    };
  }, [user]);

  // 3. Lógica de Negocio
  const stats = useMemo(() => {
    const totalEarnings = washes.reduce((sum, w) => sum + w.price, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const netProfit = totalEarnings - totalExpenses;
    const progressPercent = Math.min((netProfit / GOAL_UYU) * 100, 100);
    
    // Estadísticas Semanales
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 1));
    startOfWeek.setHours(0, 0, 0, 0);
    
    const weeklyCount = washes.filter(w => w.date >= startOfWeek).length;
    const weeklyPercent = Math.min((weeklyCount / WEEKLY_GOAL_COUNT) * 100, 100);

    return { totalEarnings, totalExpenses, netProfit, progressPercent, weeklyCount, weeklyPercent };
  }, [washes, expenses]);

  const addWash = async (type, isVan = false) => {
    if (!user) return;
    
    // Precios: Auto (420/850) | Camioneta (600/1100 sugerido)
    let price = 0;
    let label = "";
    
    if (type === 'ext') {
      price = isVan ? 600 : 420;
      label = isVan ? "Exterior (Camioneta)" : "Exterior (Auto)";
    } else {
      price = isVan ? 1100 : 850;
      label = isVan ? "Full (Camioneta)" : "Full (Auto)";
    }

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'washes'), {
        type: label,
        price: price,
        date: serverTimestamp(),
        userId: user.uid
      });
    } catch (e) { console.error(e); }
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!user || !expenseForm.amount) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'expenses'), {
        description: expenseForm.desc || 'Insumos',
        amount: parseFloat(expenseForm.amount),
        date: serverTimestamp(),
        userId: user.uid
      });
      setExpenseForm({ desc: '', amount: '' });
      setIsAddingExpense(false);
    } catch (e) { console.error(e); }
  };

  const deleteItem = async (id, collectionName) => {
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', collectionName, id));
    } catch (e) { console.error(e); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950 text-white font-sans">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="font-black italic tracking-widest text-red-500 animate-pulse uppercase">Calentando Motores...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-28 selection:bg-red-500/30">
      {/* Header F1 Pro */}
      <header className="bg-red-700 p-6 rounded-b-[3rem] shadow-[0_10px_30px_rgba(185,28,28,0.4)] border-b-4 border-black sticky top-0 z-50">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-black p-2 rounded-xl border border-white/10">
              <Zap className="text-yellow-400 fill-yellow-400" size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-black italic leading-none tracking-tighter">F1 DETAILING</h1>
              <p className="text-[10px] font-bold text-red-200 uppercase tracking-widest mt-1">Lucio's Team</p>
            </div>
          </div>
          <button className="bg-black/20 p-2.5 rounded-2xl border border-white/10 active:scale-90 transition-transform">
            <Trophy className="text-yellow-400" size={24} />
          </button>
        </div>
      </header>

      <main className="p-4 space-y-6 max-w-md mx-auto">
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 p-3 rounded-xl flex items-center gap-3 text-red-400 text-sm font-bold">
            <AlertCircle size={18} /> {error}
          </div>
        )}

        {activeTab === 'dashboard' ? (
          <>
            {/* Panel Principal de Progreso */}
            <section className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 shadow-2xl relative overflow-hidden group">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-[10px] uppercase font-black text-slate-500 tracking-[0.2em] mb-1">Ahorro Neto Total</h2>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-white italic">${stats.netProfit.toLocaleString()}</span>
                    <span className="text-xs font-bold text-slate-500">UYU</span>
                  </div>
                </div>
                <div className="bg-green-500/10 text-green-400 px-3 py-1 rounded-full text-sm font-black italic border border-green-500/20">
                  %{stats.progressPercent.toFixed(1)}
                </div>
              </div>
              
              <div className="relative h-6 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700/50 p-1">
                <div 
                  className="h-full bg-gradient-to-r from-red-600 via-orange-500 to-green-500 rounded-full transition-all duration-1000 ease-out shadow-[0_0_20px_rgba(220,38,38,0.4)]"
                  style={{ width: `${stats.progressPercent}%` }}
                />
              </div>
              
              <div className="mt-6 flex gap-3">
                <div className="flex-1 bg-black/40 p-3 rounded-2xl border border-slate-800/50">
                  <div className="flex items-center gap-2 mb-1 text-blue-400">
                    <TrendingUp size={12} />
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Ventas</span>
                  </div>
                  <p className="text-lg font-black italic">${stats.totalEarnings.toLocaleString()}</p>
                </div>
                <div className="flex-1 bg-black/40 p-3 rounded-2xl border border-slate-800/50">
                  <div className="flex items-center gap-2 mb-1 text-red-500">
                    <Wallet size={12} />
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Gastos</span>
                  </div>
                  <p className="text-lg font-black italic text-red-500">-${stats.totalExpenses.toLocaleString()}</p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-800 flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                <span>Faltan: ${(GOAL_UYU - stats.netProfit).toLocaleString()} UYU</span>
                <span className="text-slate-400">Meta: $1.000 USD</span>
              </div>
            </section>

            {/* Marcador Semanal */}
            <section className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800 flex items-center justify-between shadow-xl">
              <div className="space-y-1">
                <h3 className="text-[10px] uppercase font-black text-slate-500 tracking-[0.2em]">Objetivo Semanal</h3>
                <p className="text-3xl font-black italic text-white">{stats.weeklyCount} <span className="text-base text-slate-600 not-italic">/ {WEEKLY_GOAL_COUNT}</span></p>
                <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">
                  {stats.weeklyCount >= WEEKLY_GOAL_COUNT ? "🏆 ¡Récord de pista batido!" : `Faltan ${WEEKLY_GOAL_COUNT - stats.weeklyCount} autos`}
                </p>
              </div>
              <div className="relative w-24 h-24">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="48" cy="48" r="38" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-800" />
                  <circle 
                    cx="48" cy="48" r="38" stroke="currentColor" strokeWidth="8" fill="transparent" 
                    strokeDasharray={238.6}
                    strokeDashoffset={238.6 - (238.6 * stats.weeklyPercent / 100)}
                    strokeLinecap="round"
                    className="text-red-600 transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-black italic text-lg">
                  %{Math.round(stats.weeklyPercent)}
                </div>
              </div>
            </section>

            {/* Botonera de Boxes */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                <Info size={12} className="text-red-500" /> Selector de Servicio
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => addWash('ext')}
                  className="bg-slate-900 p-5 rounded-[2rem] border border-slate-800 border-b-4 border-b-slate-950 flex flex-col items-center gap-2 active:translate-y-1 active:border-b-0 transition-all group"
                >
                  <div className="bg-blue-600/10 p-3 rounded-2xl text-blue-500 group-active:scale-110 transition-transform"><Car size={24} /></div>
                  <span className="font-black text-[10px] uppercase tracking-wider text-slate-400">Exterior</span>
                  <span className="text-xl font-black text-white italic">$420</span>
                </button>
                <button 
                  onClick={() => addWash('full')}
                  className="bg-slate-900 p-5 rounded-[2rem] border border-slate-800 border-b-4 border-b-slate-950 flex flex-col items-center gap-2 active:translate-y-1 active:border-b-0 transition-all group shadow-[0_15px_30px_rgba(0,0,0,0.3)]"
                >
                  <div className="bg-green-600/10 p-3 rounded-2xl text-green-500 group-active:scale-110 transition-transform"><CheckCircle size={24} /></div>
                  <span className="font-black text-[10px] uppercase tracking-wider text-slate-400">Full Service</span>
                  <span className="text-xl font-black text-white italic">$850</span>
                </button>
              </div>

              {/* Botón de Gasto */}
              <button 
                onClick={() => setIsAddingExpense(true)}
                className="w-full bg-slate-900 p-4 rounded-2xl border-2 border-slate-800 border-dashed flex items-center justify-center gap-3 text-slate-500 hover:text-red-400 hover:border-red-900/50 transition-all font-black uppercase text-[10px] tracking-[0.2em]"
              >
                <Receipt size={18} /> Registrar Gasto de Insumos
              </button>
            </div>
          </>
        ) : (
          /* Historial de Actividad */
          <div className="space-y-4 animate-in fade-in duration-500">
             <h2 className="text-2xl font-black italic uppercase tracking-tighter flex items-center gap-3 mb-6 px-2">
              <History className="text-red-600" /> Registro de Boxes
            </h2>
            
            {washes.length === 0 && expenses.length === 0 ? (
              <div className="text-center py-32 border-2 border-dashed border-slate-900 rounded-[3rem]">
                <p className="text-slate-700 font-black italic uppercase tracking-widest text-lg opacity-30">Pista Despejada</p>
              </div>
            ) : (
              <div className="space-y-3">
                {[...washes.map(w => ({...w, entryType: 'wash'})), ...expenses.map(e => ({...e, entryType: 'expense'}))]
                  .sort((a, b) => b.date - a.date)
                  .map((item) => (
                    <div key={item.id} className="bg-slate-900/60 backdrop-blur-md p-4 rounded-3xl border border-slate-800 flex justify-between items-center group hover:bg-slate-900 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-2xl ${item.entryType === 'wash' ? (item.price > 500 ? 'bg-green-600/20 text-green-500' : 'bg-blue-600/20 text-blue-500') : 'bg-red-600/20 text-red-500'}`}>
                          {item.entryType === 'wash' ? <Car size={20} /> : <Receipt size={20} />}
                        </div>
                        <div>
                          <p className="font-black text-sm uppercase italic tracking-tight">{item.type || item.description}</p>
                          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">
                            {item.date.toLocaleDateString()} • {item.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`font-black text-lg italic ${item.entryType === 'wash' ? 'text-white' : 'text-red-500'}`}>
                          {item.entryType === 'wash' ? '+' : '-'}${item.price || item.amount}
                        </span>
                        <button 
                          onClick={() => deleteItem(item.id, item.entryType === 'wash' ? 'washes' : 'expenses')}
                          className="p-2 text-slate-700 hover:text-red-600 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal de Gastos (Pit Stop) */}
      {isAddingExpense && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-lg flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-slate-900 w-full max-w-xs rounded-[3rem] border border-slate-800 p-8 shadow-2xl overflow-hidden relative">
            <div className="absolute top-0 right-0 w-24 h-24 bg-red-600/10 rounded-full -mr-12 -mt-12 blur-2xl"></div>
            <h3 className="text-xl font-black italic uppercase text-red-500 mb-6 tracking-tighter">Pit Stop: Nuevo Gasto</h3>
            <form onSubmit={handleAddExpense} className="space-y-5 relative z-10">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">¿Qué compraste?</label>
                <input 
                  autoFocus
                  type="text" 
                  placeholder="Ej: Shampoo F1, Trapos..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white placeholder:text-slate-700 focus:outline-none focus:border-red-600 transition-colors font-bold text-sm"
                  value={expenseForm.desc}
                  onChange={e => setExpenseForm({...expenseForm, desc: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Monto (UYU)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-black">$</span>
                  <input 
                    type="number" 
                    inputMode="numeric"
                    placeholder="0"
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 pl-8 text-white text-3xl font-black focus:outline-none focus:border-red-600 transition-colors italic"
                    value={expenseForm.amount}
                    onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})}
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-6">
                <button 
                  type="button"
                  onClick={() => setIsAddingExpense(false)}
                  className="flex-1 p-4 rounded-2xl font-black uppercase text-[10px] tracking-widest text-slate-500 bg-slate-950/50 border border-slate-800 active:scale-95 transition-transform"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 p-4 bg-red-700 rounded-2xl font-black uppercase text-[10px] tracking-widest text-white shadow-lg shadow-red-900/30 active:scale-95 transition-transform"
                >
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Navegación Flotante */}
      <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[85%] max-w-[320px] bg-slate-900/90 backdrop-blur-xl border border-white/10 p-4 rounded-[2.5rem] flex justify-around shadow-2xl z-[60] border-t-2 border-t-white/5">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center gap-1 transition-all duration-500 ${activeTab === 'dashboard' ? 'text-red-500 scale-110' : 'text-slate-600'}`}
        >
          <LayoutDashboard size={24} />
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Dashboard</span>
        </button>
        <div className="w-[1px] h-8 bg-slate-800 my-auto opacity-50"></div>
        <button 
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center gap-1 transition-all duration-500 ${activeTab === 'history' ? 'text-red-500 scale-110' : 'text-slate-600'}`}
        >
          <History size={24} />
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Historial</span>
        </button>
      </nav>
    </div>
  );
};

export default App;