
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  TrendingDown, 
  Wallet,
  Search,
  Filter,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  BrainCircuit,
  FileSpreadsheet,
  X,
  LayoutDashboard,
  TableProperties,
  Menu,
  Pencil,
  RefreshCw,
  Settings,
  Copy,
  History,
  Layers,
  CalendarDays,
  Circle,
  Zap,
  ArrowRight,
  DatabaseZap,
  Trash2,
  Info,
  ToggleLeft,
  ToggleRight,
  Activity,
  AlertTriangle,
  Bell,
  Check
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

// --- Types ---
interface ExpenseItem {
  expectedDate: string;   
  paymentDate: string;    
  invoiceNo: string;      
  content: string;        
  provider: string;       
  income: number;         
  expense: number;        
  balance: number;        
  code: string;           
  documentLink: string;   
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  date: string;
  read: boolean;
}

interface Summary {
  totalIncome: number;
  totalExpense: number;
  currentBalance: number;
  pendingCount: number;
  overdueCount: number;
  todayExpenses: ExpenseItem[];
  tomorrowExpenses: ExpenseItem[];
}

type ViewType = 'overview' | 'cashbook' | 'ai-analysis';

// --- CHUẨN HÓA NGÀY THÁNG - RÀNG BUỘT TUYỆT ĐỐI DD/MM/YYYY ---
const normalizeDateStr = (val: any): string => {
  if (val === undefined || val === null) return '';
  let s = String(val).trim();
  if (!s || s === 'null' || s === 'undefined' || s === '-') return '';

  let match = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3];
    return `${day}/${month}/${year}`;
  }

  match = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) {
    const year = match[1];
    const month = match[2].padStart(2, '0');
    const day = match[3].padStart(2, '0');
    return `${day}/${month}/${year}`;
  }

  return s;
};

// Hàm hỗ trợ parse chuỗi DD/MM/YYYY thành Date Object để so sánh chính xác
const parseDDMMYYYY = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);
  const date = new Date(year, month, day);
  return isNaN(date.getTime()) ? null : date;
};

const getTodayStr = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const getTomorrowStr = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const isItemOverdue = (expectedDate: string, paymentDate: string) => {
  if (paymentDate && paymentDate.trim() !== '') return false;
  if (!expectedDate) return false;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const expDate = parseDDMMYYYY(expectedDate);
  if (!expDate) return false;
  
  return expDate < today;
};

const App: React.FC = () => {
  const [data, setData] = useState<ExpenseItem[]>([]);
  const [activeView, setActiveView] = useState<ViewType>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'pending' | 'overdue'>('all');
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isScanningSheets, setIsScanningSheets] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => localStorage.getItem('last_sync_time'));
  const [isAutoSync, setIsAutoSync] = useState(() => localStorage.getItem('auto_sync_enabled') === 'true');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  
  // Notification Settings
  const [notifyOnSync, setNotifyOnSync] = useState(() => localStorage.getItem('notify_on_sync') !== 'false');
  const [notifyOnOverdue, setNotifyOnOverdue] = useState(() => localStorage.getItem('notify_on_overdue') !== 'false');
  const [notifyOnToday, setNotifyOnToday] = useState(() => localStorage.getItem('notify_on_today') !== 'false');

  const [sheetScriptUrl, setSheetScriptUrl] = useState(() => localStorage.getItem('sheet_script_url') || '');
  const [targetSheetName, setTargetSheetName] = useState(() => localStorage.getItem('sheet_target_name') || 'Cashbook');
  const [availableSheets, setAvailableSheets] = useState<string[]>(() => {
    const saved = localStorage.getItem('available_sheets');
    return saved ? JSON.parse(saved) : [];
  });

  const syncTimerRef = useRef<number | null>(null);

  const fetchAvailableSheets = useCallback(async (silent = false) => {
    if (!sheetScriptUrl) return null;
    if (!silent) setIsScanningSheets(true);
    try {
      const url = new URL(sheetScriptUrl);
      url.searchParams.set('action', 'getSheets');
      const response = await fetch(url.toString());
      const result = await response.json();
      if (Array.isArray(result)) {
        setAvailableSheets(result);
        localStorage.setItem('available_sheets', JSON.stringify(result));
        return result;
      }
    } catch (e) {
      console.error("Lỗi quét danh sách sheet:", e);
    } finally {
      if (!silent) setIsScanningSheets(false);
    }
    return null;
  }, [sheetScriptUrl]);

  const handleSyncFromSheet = useCallback(async (isAuto = false, customSheetName?: string) => {
    if (!sheetScriptUrl || isSyncing) return;
    
    let sheetToFetch = customSheetName || targetSheetName;
    setIsSyncing(true);
    
    try {
      const urlWithParams = new URL(sheetScriptUrl);
      urlWithParams.searchParams.set('sheet', sheetToFetch);

      const response = await fetch(urlWithParams.toString(), { 
        method: 'GET',
        mode: 'cors'
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      
      if (result && result.error) {
        const sheets = await fetchAvailableSheets(true);
        if (sheets && sheets.length > 0 && sheetToFetch !== sheets[0]) {
           setIsSyncing(false);
           return handleSyncFromSheet(isAuto, sheets[0]);
        }
        throw new Error(result.error);
      }

      if (Array.isArray(result)) {
        const normalized = result.map(item => ({
          ...item,
          expectedDate: normalizeDateStr(item.expectedDate),
          paymentDate: normalizeDateStr(item.paymentDate)
        }));
        
        setData(normalized);
        const now = new Date().toLocaleString('vi-VN');
        setLastSyncTime(now);
        localStorage.setItem('last_sync_time', now);
        localStorage.setItem('cashbook_data', JSON.stringify(normalized));
        localStorage.setItem('sheet_target_name', sheetToFetch);
        setTargetSheetName(sheetToFetch);

        // Generate Notifications
        const newNotifications: Notification[] = [];
        const todayStr = getTodayStr();
        
        // 1. Sync Success
        if (!isAuto && notifyOnSync) {
            newNotifications.push({
                id: Date.now().toString() + '-sync',
                title: 'Đồng bộ thành công',
                message: `Đã cập nhật dữ liệu từ sheet "${sheetToFetch}" lúc ${now.split(' ')[1]}`,
                type: 'success',
                date: now,
                read: false
            });
        }

        // 2. Overdue Items
        if (notifyOnOverdue) {
            const overdueCount = normalized.filter(item => isItemOverdue(item.expectedDate, item.paymentDate)).length;
            if (overdueCount > 0) {
                 newNotifications.push({
                    id: Date.now().toString() + '-overdue',
                    title: 'Cảnh báo quá hạn',
                    message: `Bạn có ${overdueCount} khoản chi phí đã quá hạn thanh toán.`,
                    type: 'error',
                    date: now,
                    read: false
                });
            }
        }

        // 3. Today Items
        if (notifyOnToday) {
            const todayCount = normalized.filter(item => item.expectedDate === todayStr && item.paymentDate.trim() === '').length;
            if (todayCount > 0) {
                 newNotifications.push({
                    id: Date.now().toString() + '-today',
                    title: 'Lịch chi hôm nay',
                    message: `Hôm nay có ${todayCount} khoản cần thanh toán.`,
                    type: 'info',
                    date: now,
                    read: false
                });
            }
        }

        if (newNotifications.length > 0) {
            setNotifications(prev => {
                // Merge and keep only last 20
                const merged = [...newNotifications, ...prev];
                return merged.slice(0, 20);
            });
        }
      }
    } catch (error: any) {
      console.error("Sync Error:", error);
      if (!isAuto) alert("Lỗi đồng bộ: " + error.message);
    } finally {
      setIsSyncing(false);
    }
  }, [sheetScriptUrl, targetSheetName, fetchAvailableSheets, isSyncing, notifyOnSync, notifyOnOverdue, notifyOnToday]);

  const handleFullRefresh = async () => {
    try {
      const sheets = await fetchAvailableSheets(true);
      let nextSheet = targetSheetName;
      if (sheets && sheets.length > 0 && !sheets.includes(targetSheetName)) {
        nextSheet = sheets[0];
      }
      await handleSyncFromSheet(true, nextSheet);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (isAutoSync && sheetScriptUrl) {
      syncTimerRef.current = window.setInterval(() => {
        handleFullRefresh();
      }, 120000); 
    } else {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    }
    return () => {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    };
  }, [isAutoSync, sheetScriptUrl, targetSheetName]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isAutoSync && sheetScriptUrl) {
        handleFullRefresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isAutoSync, sheetScriptUrl, targetSheetName]);

  const toggleAutoSync = () => {
    const newState = !isAutoSync;
    setIsAutoSync(newState);
    localStorage.setItem('auto_sync_enabled', String(newState));
  };

  const handleClearCache = () => {
    if (confirm("Xóa bộ nhớ tạm và tải lại dữ liệu mới nhất?")) {
      localStorage.removeItem('cashbook_data');
      localStorage.removeItem('available_sheets');
      localStorage.removeItem('last_sync_time');
      setData([]);
      setLastSyncTime(null);
      handleFullRefresh();
    }
  };

  useEffect(() => {
    const savedData = localStorage.getItem('cashbook_data');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        const reNormalized = parsed.map((item: ExpenseItem) => ({
          ...item,
          expectedDate: normalizeDateStr(item.expectedDate),
          paymentDate: normalizeDateStr(item.paymentDate)
        }));
        setData(reNormalized);
      } catch (e) {}
    }
    if (sheetScriptUrl) {
      handleFullRefresh();
    }
  }, [sheetScriptUrl]);

  const handleSheetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newName = e.target.value;
    setTargetSheetName(newName);
    handleSyncFromSheet(false, newName);
  };

  const summary = useMemo((): Summary => {
    const todayStr = getTodayStr();
    const tomorrowStr = getTomorrowStr();

    return data.reduce((acc, item) => {
      acc.totalIncome += item.income;
      acc.totalExpense += item.expense;
      acc.currentBalance = item.balance;
      
      const isPaid = item.paymentDate.trim() !== '';
      const overdue = isItemOverdue(item.expectedDate, item.paymentDate);
      
      if (!isPaid && !overdue) acc.pendingCount++;
      if (overdue) acc.overdueCount++;

      if (item.expectedDate === todayStr) acc.todayExpenses.push(item);
      if (item.expectedDate === tomorrowStr) acc.tomorrowExpenses.push(item);

      return acc;
    }, { 
      totalIncome: 0, 
      totalExpense: 0, 
      currentBalance: 0, 
      pendingCount: 0, 
      overdueCount: 0,
      todayExpenses: [] as ExpenseItem[],
      tomorrowExpenses: [] as ExpenseItem[]
    });
  }, [data]);

  // Lọc và sắp xếp các khoản quá hạn cho Dashboard
  const overdueItemsForDashboard = useMemo(() => {
    const overdue = data.filter(item => isItemOverdue(item.expectedDate, item.paymentDate));
    return overdue.sort((a, b) => {
      const dateA = parseDDMMYYYY(a.expectedDate);
      const dateB = parseDDMMYYYY(b.expectedDate);
      if (!dateA || !dateB) return 0;
      return dateB.getTime() - dateA.getTime();
    }).slice(0, 15);
  }, [data]);

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const search = searchTerm.toLowerCase();
      const matchesSearch = 
        item.content.toLowerCase().includes(search) ||
        item.provider.toLowerCase().includes(search) ||
        item.code.toLowerCase().includes(search);
      const isPaid = item.paymentDate.trim() !== '';
      const overdue = isItemOverdue(item.expectedDate, item.paymentDate);
      const isPending = !isPaid && !overdue;
      if (!matchesSearch) return false;
      if (filterStatus === 'paid') return isPaid;
      if (filterStatus === 'pending') return isPending;
      if (filterStatus === 'overdue') return overdue;
      return true;
    });
  }, [data, searchTerm, filterStatus]);

  const navigateToItemInCashbook = (item: ExpenseItem) => {
    setSearchTerm(item.content); 
    setActiveView('cashbook');
    setFilterStatus('all');
  };

  const runAiAnalysis = async () => {
    setIsAiAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Dữ liệu chi tiêu: ${JSON.stringify(data.slice(-50))}. Phân tích và cảnh báo rủi ro bằng tiếng Việt.`;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });
      setAiInsight(response.text || "AI không phản hồi.");
    } catch (error) {
      setAiInsight("Lỗi kết nối Gemini.");
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  const scriptCode = `function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const action = e && e.parameter && e.parameter.action;

  if (action === "getSheets") {
    const sheetNames = ss.getSheets().map(function(s) { return s.getName(); });
    return createJsonResponse(sheetNames);
  }
  
  const targetName = (e && e.parameter && e.parameter.sheet) ? e.parameter.sheet : ss.getSheets()[0].getName(); 
  let sheet = ss.getSheetByName(targetName);
  
  if (!sheet) return createJsonResponse({error: "Không tìm thấy Sheet!"});
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 8) return createJsonResponse([]);
  
  const rawValues = sheet.getRange(8, 1, lastRow - 7, 10).getValues();
  
  const result = rawValues
    .filter(function(row) {
      return row[0] !== null && row[0] !== undefined && row[0].toString().trim() !== "";
    })
    .map(function(row) {
      var formatDate = function(date) {
        if (!date) return "";
        if (date instanceof Date) return Utilities.formatDate(date, Session.getScriptTimeZone(), "dd/MM/yyyy");
        return date.toString();
      };
      return {
        expectedDate: formatDate(row[0]),
        paymentDate: formatDate(row[1]),
        invoiceNo: (row[2] || "").toString(),
        content: (row[3] || "").toString(),
        provider: (row[4] || "").toString(),
        income: parseFloat(row[5]) || 0,
        expense: parseFloat(row[6]) || 0,
        balance: parseFloat(row[7]) || 0,
        code: (row[8] || "").toString(),
        documentLink: (row[9] || "").toString()
      };
    });
  
  return createJsonResponse(result);
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}`;

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const balanceColorClass = summary.currentBalance > 0 ? 'text-emerald-600' : summary.currentBalance < 0 ? 'text-rose-600' : 'text-slate-900';

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans">
      {/* Desktop Sidebar */}
      <aside className={`hidden md:flex bg-slate-900 text-white transition-all duration-300 flex-col z-30 shrink-0 ${isSidebarOpen ? 'w-64' : 'w-20'}`}>
        <div className="p-6 flex items-center gap-3 border-b border-slate-800">
          <div className="bg-blue-600 p-2 rounded-xl shrink-0 shadow-lg shadow-blue-500/20">
            <FileSpreadsheet className="w-5 h-5 text-white" />
          </div>
          {isSidebarOpen && (
            <div className="flex flex-col leading-tight">
              <span className="font-black text-xl tracking-tighter">CASHBOOK</span>
              <span className="text-[10px] font-bold text-blue-500 tracking-[0.3em]">CXP</span>
            </div>
          )}
        </div>
        <nav className="flex-1 py-6 px-3 space-y-2">
          <SidebarItem icon={<LayoutDashboard className="w-5 h-5" />} label="Tổng quan" active={activeView === 'overview'} collapsed={!isSidebarOpen} onClick={() => setActiveView('overview')} />
          <SidebarItem icon={<TableProperties className="w-5 h-5" />} label="Cashbook" active={activeView === 'cashbook'} collapsed={!isSidebarOpen} onClick={() => { setActiveView('cashbook'); setSearchTerm(''); }} />
          <SidebarItem icon={<BrainCircuit className="w-5 h-5" />} label="Gemini AI" active={activeView === 'ai-analysis'} collapsed={!isSidebarOpen} onClick={() => setActiveView('ai-analysis')} />
          <SidebarItem icon={<Settings className="w-5 h-5" />} label="Cài đặt" active={false} collapsed={!isSidebarOpen} onClick={() => setShowConfigModal(true)} />
        </nav>
        <div className="p-4 border-t border-slate-800 flex items-center justify-between">
            {isSidebarOpen && (
              <div className="flex items-center gap-2 cursor-pointer group" onClick={toggleAutoSync}>
                 {isAutoSync ? <ToggleRight className="text-emerald-500 w-6 h-6" /> : <ToggleLeft className="text-slate-500 w-6 h-6" />}
                 <span className={`text-[9px] font-black uppercase tracking-tighter ${isAutoSync ? 'text-emerald-500' : 'text-slate-500'}`}>
                    {isAutoSync ? 'Auto Sync: On' : 'Auto Sync: Off'}
                 </span>
              </div>
            )}
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-500">
                <Menu className="w-5 h-5" />
            </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-4 md:px-8 shrink-0 z-20">
          <div className="flex items-center gap-3 md:gap-6 overflow-hidden">
            {/* Mobile Logo/Title */}
            <div className="md:hidden bg-blue-600 p-1.5 rounded-lg shrink-0 shadow-lg shadow-blue-500/20">
              <FileSpreadsheet className="w-4 h-4 text-white" />
            </div>

            <div className="flex flex-col overflow-hidden">
              <h2 className="text-base md:text-lg font-bold text-slate-800 truncate">
                {activeView === 'overview' ? 'Tổng quan' : activeView === 'cashbook' ? 'Thu Chi' : 'AI Phân tích'}
              </h2>
              <div className="flex items-center gap-2">
                {lastSyncTime && (
                  <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1 truncate">
                    <History className="w-3 h-3" /> {lastSyncTime.split(' ')[1]}
                  </span>
                )}
                {isAutoSync && (
                  <span className="flex items-center gap-1 text-[9px] font-black text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-md animate-pulse">
                    <Activity className="w-3 h-3" /> AUTO
                  </span>
                )}
              </div>
            </div>
            
            <div className="hidden md:flex items-center gap-1">
              <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-2xl px-4 py-2 hover:border-blue-400 transition-all focus-within:ring-4 focus-within:ring-blue-100 group cursor-pointer relative min-w-[200px]">
                <Layers className="w-4 h-4 text-blue-500" />
                <select 
                  value={targetSheetName} 
                  onChange={handleSheetChange}
                  className="bg-transparent border-none outline-none text-xs font-bold text-slate-700 w-full appearance-none pr-6 cursor-pointer"
                >
                  {availableSheets.length > 0 ? (
                      availableSheets.map(s => <option key={s} value={s}>{s}</option>)
                  ) : (
                      <option value={targetSheetName}>{targetSheetName}</option>
                  )}
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-4 pointer-events-none" />
              </div>
              <button 
                onClick={() => fetchAvailableSheets()} 
                disabled={isScanningSheets}
                className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                title="Quét danh sách Sheet mới"
              >
                <DatabaseZap className={`w-4 h-4 ${isScanningSheets ? 'animate-spin text-blue-500' : ''}`} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            {/* Mobile Sheet Selector Trigger (Simplified) */}
            <div className="md:hidden">
               <select 
                  value={targetSheetName} 
                  onChange={handleSheetChange}
                  className="bg-slate-100 border border-slate-200 text-slate-700 text-xs rounded-lg py-1.5 px-2 outline-none max-w-[100px] truncate"
                >
                  {availableSheets.length > 0 ? (
                      availableSheets.map(s => <option key={s} value={s}>{s}</option>)
                  ) : (
                      <option value={targetSheetName}>{targetSheetName}</option>
                  )}
                </select>
            </div>

            {/* Notification Bell */}
            <div className="relative">
                <button 
                    onClick={() => setShowNotifications(!showNotifications)}
                    className={`p-2 md:p-2.5 rounded-xl transition-all relative ${showNotifications ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'}`}
                >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                        <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border border-white animate-pulse"></span>
                    )}
                </button>

                {/* Notification Dropdown */}
                {showNotifications && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)}></div>
                        <div className="fixed top-[70px] right-4 w-[calc(100vw-32px)] md:absolute md:top-full md:right-0 md:w-96 md:mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                <h3 className="font-black text-slate-800 text-sm">Thông báo</h3>
                                {unreadCount > 0 && (
                                    <button onClick={markAllRead} className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                                        <Check className="w-3 h-3" /> Đánh dấu đã đọc
                                    </button>
                                )}
                            </div>
                            <div className="max-h-[400px] overflow-y-auto">
                                {notifications.length > 0 ? (
                                    <div className="divide-y divide-slate-50">
                                        {notifications.map(n => (
                                            <div key={n.id} className={`p-4 hover:bg-slate-50 transition-colors ${!n.read ? 'bg-blue-50/30' : ''}`}>
                                                <div className="flex gap-3">
                                                    <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${n.type === 'error' ? 'bg-rose-500' : n.type === 'success' ? 'bg-emerald-500' : 'bg-blue-500'}`}></div>
                                                    <div className="flex-1">
                                                        <h4 className={`text-xs font-bold mb-1 ${!n.read ? 'text-slate-900' : 'text-slate-600'}`}>{n.title}</h4>
                                                        <p className="text-[11px] text-slate-500 leading-relaxed">{n.message}</p>
                                                        <span className="text-[9px] text-slate-400 mt-2 block font-medium">{n.date}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-8 text-center text-slate-400">
                                        <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                        <p className="text-xs font-medium">Không có thông báo mới</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>

            <button 
              onClick={handleFullRefresh} 
              disabled={isSyncing} 
              className={`flex items-center gap-2 px-3 md:px-5 py-2 md:py-2.5 rounded-xl md:rounded-2xl text-xs md:text-sm font-bold transition-all shadow-lg ${isSyncing ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100'}`}
            >
              <RefreshCw className={`w-3 h-3 md:w-4 md:h-4 ${isSyncing ? 'animate-spin' : ''}`} /> 
              <span className="hidden md:inline">{isSyncing ? 'Đang tải...' : 'Làm mới'}</span>
            </button>
            <button 
              onClick={handleClearCache}
              className="p-2 md:p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all hidden md:block"
              title="Xóa bộ nhớ tạm"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setShowConfigModal(true)}
              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all md:hidden"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-3 md:p-8 pb-24 md:pb-8">
          <div className="max-w-full mx-auto space-y-4 md:space-y-6">
            {activeView === 'overview' && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                  <StatCard title="Số Dư" value={summary.currentBalance.toLocaleString()} unit="đ" icon={<Wallet className={balanceColorClass} />} color="blue" valueClass={balanceColorClass} />
                  <StatCard title="Thu" value={summary.totalIncome.toLocaleString()} unit="đ" icon={<span className="text-emerald-600 text-xl md:text-2xl font-black">+</span>} color="emerald" />
                  <StatCard title="Chi" value={summary.totalExpense.toLocaleString()} unit="đ" icon={<span className="text-rose-600 text-xl md:text-2xl font-black">-</span>} color="rose" />
                  <StatCard title="Quá Hạn" value={summary.overdueCount.toString()} unit="khoản" icon={<AlertCircle className={summary.overdueCount > 0 ? 'text-white' : 'text-amber-600'} />} color="amber" highlight={summary.overdueCount > 0} bgOverride={summary.overdueCount > 0 ? 'bg-rose-500 text-white shadow-rose-200' : ''} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-8">
                  <div className="bg-white rounded-3xl p-5 md:p-8 border border-slate-200 shadow-sm flex flex-col h-[400px] md:h-[450px]">
                    <div className="flex items-center justify-between mb-4 md:mb-6 shrink-0">
                        <h3 className="font-black text-slate-800 text-lg md:text-xl flex items-center gap-2">
                           <Clock className="w-5 h-5 text-indigo-500" /> Chi hôm nay
                        </h3>
                        <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-xl text-xs font-black">{summary.todayExpenses.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar -mx-2 px-2">
                        {summary.todayExpenses.length > 0 ? (
                            <table className="w-full text-left text-xs border-separate border-spacing-y-2">
                                <thead className="sticky top-0 bg-white z-10">
                                    <tr className="text-slate-400 uppercase tracking-widest">
                                        <th className="pb-2 px-2 md:px-4 font-black">Nội dung</th>
                                        <th className="pb-2 px-2 md:px-6 font-black text-right">Số tiền</th>
                                        <th className="pb-2 px-2 md:px-4 font-black text-center w-10 md:w-20">TT</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {summary.todayExpenses.map((item, idx) => (
                                        <tr key={idx} onClick={() => navigateToItemInCashbook(item)} className="bg-slate-50 hover:bg-white hover:shadow-lg transition-all cursor-pointer group rounded-2xl">
                                            <td className="py-3 md:py-4 px-2 md:px-4 font-bold text-slate-800 rounded-l-2xl truncate max-w-[120px] md:max-w-[220px]">{item.content}</td>
                                            <td className="py-3 md:py-4 px-2 md:px-6 text-right font-black text-rose-600">-{item.expense.toLocaleString()}</td>
                                            <td className="py-3 md:py-4 px-2 md:px-4 text-center rounded-r-2xl">
                                                {item.paymentDate.trim() !== '' ? <CheckCircle2 className="text-emerald-500 w-4 h-4 md:w-5 md:h-5 mx-auto" /> : <Circle className="text-slate-300 w-4 h-4 md:w-5 md:h-5 mx-auto" />}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center px-6">
                                <CheckCircle2 className="w-12 h-12 mb-3 opacity-20" />
                                <p className="font-bold">Hôm nay không có lịch chi.</p>
                            </div>
                        )}
                    </div>
                  </div>

                  <div className="bg-white rounded-3xl p-5 md:p-8 border border-slate-200 shadow-sm flex flex-col h-[400px] md:h-[450px]">
                    <div className="flex items-center justify-between mb-4 md:mb-6 shrink-0">
                        <h3 className="font-black text-slate-800 text-lg md:text-xl flex items-center gap-2">
                           <CalendarDays className="w-5 h-5 text-blue-500" /> Chi ngày mai
                        </h3>
                        <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-xl text-xs font-black">{summary.tomorrowExpenses.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar -mx-2 px-2">
                        {summary.tomorrowExpenses.length > 0 ? (
                            <table className="w-full text-left text-xs border-separate border-spacing-y-2">
                                <thead className="sticky top-0 bg-white z-10">
                                    <tr className="text-slate-400 uppercase tracking-widest">
                                        <th className="pb-2 px-2 md:px-4 font-black">Nội dung</th>
                                        <th className="pb-2 px-2 md:px-6 font-black text-right">Số tiền</th>
                                        <th className="pb-2 px-2 md:px-4 font-black text-center w-10 md:w-20"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {summary.tomorrowExpenses.map((item, idx) => (
                                        <tr key={idx} onClick={() => navigateToItemInCashbook(item)} className="bg-slate-50 hover:bg-white hover:shadow-lg transition-all cursor-pointer group rounded-2xl">
                                            <td className="py-3 md:py-4 px-2 md:px-4 font-bold text-slate-800 rounded-l-2xl truncate max-w-[120px] md:max-w-[220px]">{item.content}</td>
                                            <td className="py-3 md:py-4 px-2 md:px-6 text-right font-black text-rose-600">-{item.expense.toLocaleString()}</td>
                                            <td className="py-3 md:py-4 px-2 md:px-4 text-center rounded-r-2xl">
                                                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 mx-auto" />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center px-6">
                                <CalendarDays className="w-12 h-12 mb-3 opacity-20" />
                                <p className="font-bold">Ngày mai trống.</p>
                            </div>
                        )}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-3xl p-5 md:p-8 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4 md:mb-8">
                    <div className="flex flex-col">
                        <h3 className="font-black text-rose-600 text-lg md:text-xl flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 md:w-6 md:h-6 animate-pulse" /> Quá hạn
                        </h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest hidden md:block">Chỉ hiện những khoản trước ngày hôm nay chưa thanh toán</p>
                    </div>
                    <button onClick={() => { setActiveView('cashbook'); setFilterStatus('overdue'); }} className="text-[9px] md:text-[10px] font-black uppercase text-rose-600 tracking-[0.2em] bg-rose-50 px-3 py-2 md:px-4 md:py-2 rounded-xl hover:bg-rose-600 hover:text-white transition-all">Xem tất cả</button>
                  </div>
                  <div className="overflow-x-auto">
                    {overdueItemsForDashboard.length > 0 ? (
                      <table className="w-full text-left text-xs min-w-[600px] md:min-w-0">
                        <thead>
                          <tr className="text-slate-400 uppercase tracking-[0.1em] border-b border-slate-100">
                            <th className="pb-4 font-black">Ngày (A)</th>
                            <th className="pb-4 font-black">Nội dung (D)</th>
                            <th className="pb-4 font-black">Mã (I)</th>
                            <th className="pb-4 font-black text-right">Số tiền (G)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {overdueItemsForDashboard.map((item, idx) => (
                            <tr key={idx} onClick={() => navigateToItemInCashbook(item)} className="hover:bg-rose-50/50 transition-all cursor-pointer group animate-in slide-in-from-right duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                              <td className="py-4 md:py-5 font-bold text-rose-500">{item.expectedDate}</td>
                              <td className="py-4 md:py-5 font-black text-slate-800 truncate max-w-[150px] md:max-w-[250px]">{item.content}</td>
                              <td className="py-4 md:py-5"><span className="bg-rose-50 text-rose-600 px-2 md:px-3 py-1 rounded-xl text-[10px] font-black border border-rose-100">{item.code || 'N/A'}</span></td>
                              <td className="py-4 md:py-5 text-right font-black text-rose-600 text-sm">-{item.expense.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="py-8 md:py-12 flex flex-col items-center justify-center text-slate-400">
                        <CheckCircle2 className="w-10 h-10 md:w-12 md:h-12 text-emerald-500 opacity-20 mb-3" />
                        <p className="font-bold text-sm md:text-base">Tuyệt vời! Không có khoản nào quá hạn.</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {activeView === 'cashbook' && (
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden w-full flex flex-col h-[calc(100vh-180px)] md:h-auto">
                <div className="p-4 md:p-8 border-b border-slate-100 flex flex-col lg:flex-row gap-4 md:gap-6 items-center justify-between bg-white shrink-0">
                  <div className="relative w-full lg:w-[400px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                    <input type="text" placeholder="Tìm kiếm..." className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full lg:w-auto pb-1">
                    <FilterButton active={filterStatus === 'all'} label="Tất cả" count={data.length} onClick={() => setFilterStatus('all')} />
                    <FilterButton active={filterStatus === 'paid'} label="Đã chi" count={data.filter(i => i.paymentDate.trim() !== '').length} onClick={() => setFilterStatus('paid')} />
                    <FilterButton active={filterStatus === 'pending'} label="Chờ chi" count={summary.pendingCount} onClick={() => setFilterStatus('pending')} />
                    <FilterButton active={filterStatus === 'overdue'} label="Quá hạn" count={summary.overdueCount} onClick={() => setFilterStatus('overdue')} isAlert />
                  </div>
                </div>
                
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto w-full flex-1">
                  <table className="w-full text-left border-collapse table-fixed text-sm min-w-[1300px]">
                    <thead className="sticky top-0 bg-white z-10 shadow-sm">
                      <tr className="bg-slate-50/50 text-slate-400 text-[11px] uppercase tracking-[0.1em] font-black">
                        <th className="px-6 py-5 border-b w-36">Dự kiến (A)</th>
                        <th className="px-6 py-5 border-b w-36">Ngày chi (B)</th>
                        <th className="px-4 py-5 border-b w-32">Số HĐ (C)</th>
                        <th className="px-6 py-5 border-b w-auto">Nội dung chi phí (D)</th>
                        <th className="px-6 py-5 border-b w-64">NCC/Người chi (E)</th>
                        <th className="px-4 py-5 border-b text-right w-32">Thu (F)</th>
                        <th className="px-4 py-5 border-b text-right w-32">Chi (G)</th>
                        <th className="px-4 py-5 border-b text-right w-36">Số dư (H)</th>
                        <th className="px-4 py-5 border-b w-32 text-center">Mã (I)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredData.map((item, idx) => {
                        const isPaid = item.paymentDate && item.paymentDate.trim() !== '';
                        const isOverdue = isItemOverdue(item.expectedDate, item.paymentDate);
                        
                        let rowClass = "hover:shadow-inner transition-all cursor-pointer group ";
                        if (isPaid) {
                          rowClass += "bg-emerald-50/70 text-emerald-900";
                        } else if (isOverdue) {
                          rowClass += "bg-rose-100/80 animate-pulse-red border-l-4 border-rose-500 text-rose-900";
                        } else {
                          rowClass += "bg-white text-slate-800";
                        }

                        return (
                          <tr key={idx} className={rowClass}>
                            <td className="px-6 py-5 font-bold">{item.expectedDate}</td>
                            <td className="px-6 py-5">
                              {isPaid ? (
                                <span className="font-bold bg-emerald-200/50 px-2 py-1 rounded-lg border border-emerald-300/50">{item.paymentDate}</span>
                              ) : isOverdue ? (
                                <span className="text-[10px] font-black text-white bg-rose-600 px-2 py-1 rounded-lg shadow-sm">QUÁ HẠN</span>
                              ) : (
                                <span className="text-[10px] text-slate-400 font-black border border-slate-200 px-2 py-1 rounded-lg uppercase">Chờ chi</span>
                              )}
                            </td>
                            <td className="px-4 py-5 text-xs font-mono truncate">{item.invoiceNo || '-'}</td>
                            <td className="px-6 py-5 font-bold break-words relative">{item.content}</td>
                            <td className="px-6 py-5 font-medium truncate opacity-80">{item.provider}</td>
                            <td className="px-4 py-5 text-right font-mono font-black text-base">{item.income > 0 ? `+${item.income.toLocaleString()}` : '-'}</td>
                            <td className="px-4 py-5 text-right font-mono font-black text-base">{item.expense > 0 ? `-${item.expense.toLocaleString()}` : '-'}</td>
                            <td className="px-4 py-5 text-right font-mono font-black">{item.balance.toLocaleString()}</td>
                            <td className="px-4 py-5 text-center">
                              <span className={`text-[10px] font-black px-2.5 py-1 rounded-xl uppercase border ${isPaid ? 'bg-emerald-200/50 border-emerald-300/50' : isOverdue ? 'bg-rose-200/50 border-rose-300/50' : 'bg-blue-50 border-blue-100 text-blue-600'}`}>
                                {item.code || 'N/A'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50">
                   {filteredData.map((item, idx) => {
                        const isPaid = item.paymentDate && item.paymentDate.trim() !== '';
                        const isOverdue = isItemOverdue(item.expectedDate, item.paymentDate);
                        
                        let cardClass = "rounded-2xl p-4 shadow-sm border transition-all ";
                        if (isPaid) {
                          cardClass += "bg-white border-emerald-100";
                        } else if (isOverdue) {
                          cardClass += "bg-rose-50 border-rose-200";
                        } else {
                          cardClass += "bg-white border-slate-200";
                        }

                        return (
                          <div key={idx} className={cardClass}>
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">{item.expectedDate}</span>
                                    <h4 className="font-bold text-slate-800 text-sm line-clamp-2">{item.content}</h4>
                                </div>
                                <div className="text-right shrink-0 ml-2">
                                    {item.expense > 0 ? (
                                        <span className="block font-black text-rose-600 text-base">-{item.expense.toLocaleString()}</span>
                                    ) : (
                                        <span className="block font-black text-emerald-600 text-base">+{item.income.toLocaleString()}</span>
                                    )}
                                </div>
                            </div>
                            
                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100/50">
                                <div className="flex items-center gap-2">
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg uppercase border ${isPaid ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : isOverdue ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                        {item.code || 'N/A'}
                                    </span>
                                    {item.invoiceNo && <span className="text-[10px] font-mono text-slate-400">#{item.invoiceNo}</span>}
                                </div>
                                
                                <div>
                                    {isPaid ? (
                                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                                            <CheckCircle2 className="w-3 h-3" /> {item.paymentDate}
                                        </span>
                                    ) : isOverdue ? (
                                        <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-100 px-2 py-1 rounded-lg">
                                            <AlertCircle className="w-3 h-3" /> Quá hạn
                                        </span>
                                    ) : (
                                        <span className="text-[10px] font-bold text-slate-400">Chờ thanh toán</span>
                                    )}
                                </div>
                            </div>
                          </div>
                        );
                   })}
                   {filteredData.length === 0 && (
                       <div className="text-center py-10 text-slate-400">
                           <p>Không tìm thấy dữ liệu</p>
                       </div>
                   )}
                </div>
              </div>
            )}

            {activeView === 'ai-analysis' && (
              <div className="max-w-4xl mx-auto space-y-6 md:space-y-8">
                <div className="bg-gradient-to-br from-slate-900 to-blue-900 rounded-[32px] md:rounded-[40px] p-6 md:p-12 text-white shadow-2xl relative overflow-hidden">
                  <div className="relative z-10">
                    <div className="flex items-center gap-4 mb-6 md:mb-8">
                      <div className="bg-blue-600 p-3 md:p-4 rounded-2xl md:rounded-3xl"><BrainCircuit className="w-8 h-8 md:w-10 md:h-10" /></div>
                      <div>
                        <h2 className="text-2xl md:text-3xl font-black">Gemini AI</h2>
                        <p className="text-blue-200 font-bold uppercase tracking-widest text-[10px] md:text-xs mt-1">Phân tích dòng tiền</p>
                      </div>
                    </div>
                    <p className="text-sm md:text-lg text-blue-100 leading-relaxed mb-6 md:mb-10 max-w-2xl">Phân tích dữ liệu từ sheet <b>"{targetSheetName}"</b> để nhận diện các rủi ro thanh toán và xu hướng chi tiêu.</p>
                    
                    {aiInsight && (
                      <div className="bg-white/10 backdrop-blur-xl rounded-2xl md:rounded-[32px] p-4 md:p-8 border border-white/20 mb-6 md:mb-8 whitespace-pre-wrap font-medium leading-loose text-xs md:text-sm italic">
                        {aiInsight}
                      </div>
                    )}

                    <button 
                      onClick={runAiAnalysis} 
                      disabled={isAiAnalyzing} 
                      className="w-full md:w-auto py-4 md:py-5 px-6 md:px-10 bg-white text-blue-900 rounded-xl md:rounded-2xl font-black text-sm md:text-base hover:bg-blue-50 transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-2xl active:scale-95"
                    >
                      {isAiAnalyzing ? <RefreshCw className="w-5 h-5 md:w-6 md:h-6 animate-spin" /> : <Zap className="w-5 h-5 md:w-6 md:h-6" />}
                      {isAiAnalyzing ? 'Đang phân tích...' : 'Bắt đầu phân tích'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 py-3 flex justify-between items-center z-50 pb-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <button onClick={() => setActiveView('overview')} className={`flex flex-col items-center gap-1 ${activeView === 'overview' ? 'text-blue-600' : 'text-slate-400'}`}>
            <LayoutDashboard className={`w-6 h-6 ${activeView === 'overview' ? 'fill-blue-100' : ''}`} />
            <span className="text-[10px] font-bold">Tổng quan</span>
        </button>
        <button onClick={() => { setActiveView('cashbook'); setSearchTerm(''); }} className={`flex flex-col items-center gap-1 ${activeView === 'cashbook' ? 'text-blue-600' : 'text-slate-400'}`}>
            <TableProperties className={`w-6 h-6 ${activeView === 'cashbook' ? 'fill-blue-100' : ''}`} />
            <span className="text-[10px] font-bold">Cashbook</span>
        </button>
        <button onClick={() => setActiveView('ai-analysis')} className={`flex flex-col items-center gap-1 ${activeView === 'ai-analysis' ? 'text-blue-600' : 'text-slate-400'}`}>
            <BrainCircuit className={`w-6 h-6 ${activeView === 'ai-analysis' ? 'fill-blue-100' : ''}`} />
            <span className="text-[10px] font-bold">AI</span>
        </button>
      </div>

      {showConfigModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
          <div className="bg-white rounded-[40px] w-full max-w-2xl shadow-2xl overflow-hidden my-auto border border-slate-100 animate-in fade-in slide-in-from-bottom-8 duration-500 max-h-[90vh] flex flex-col">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-4">
                <div className="bg-blue-600 p-3 rounded-2xl shadow-xl shadow-blue-200"><Settings className="text-white w-6 h-6" /></div>
                <div>
                  <h3 className="font-black text-slate-800 text-xl">Cấu hình kết nối</h3>
                </div>
              </div>
              <button onClick={() => setShowConfigModal(false)} className="bg-white p-2 rounded-full text-slate-400 hover:text-slate-600 transition-all border border-slate-100"><X className="w-6 h-6" /></button>
            </div>
            
            <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar">
              <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex gap-3">
                  <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700 leading-relaxed">
                      Lưu ý: Để hệ thống hoạt động chính xác nhất, vui lòng đảm bảo Apps Script của bạn đã được triển khai (Deploy) dưới dạng <b>Web App</b> với quyền truy cập <b>"Anyone"</b>.
                  </p>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Mã Apps Script (Google Sheets)</label>
                <div className="relative group">
                  <pre className="bg-slate-900 text-emerald-400 p-5 rounded-3xl text-[10px] font-mono overflow-x-auto h-44 border border-slate-800 shadow-inner">
                    {scriptCode}
                  </pre>
                  <button onClick={() => { navigator.clipboard.writeText(scriptCode); alert("Đã copy!"); }} className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white p-2 rounded-xl backdrop-blur-sm transition-all"><Copy className="w-4 h-4" /></button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">URL Web App (Google Script)</label>
                <input 
                  type="text" 
                  placeholder="https://script.google.com/macros/s/..." 
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:border-blue-500 outline-none transition-all" 
                  defaultValue={sheetScriptUrl} 
                  id="sheet_url_input" 
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Tùy chọn thông báo</label>
                <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-700">Khi đồng bộ thành công</span>
                        <div onClick={() => { setNotifyOnSync(!notifyOnSync); localStorage.setItem('notify_on_sync', String(!notifyOnSync)); }} className="cursor-pointer">
                            {notifyOnSync ? <ToggleRight className="text-blue-600 w-8 h-8" /> : <ToggleLeft className="text-slate-300 w-8 h-8" />}
                        </div>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-700">Cảnh báo quá hạn thanh toán</span>
                        <div onClick={() => { setNotifyOnOverdue(!notifyOnOverdue); localStorage.setItem('notify_on_overdue', String(!notifyOnOverdue)); }} className="cursor-pointer">
                            {notifyOnOverdue ? <ToggleRight className="text-blue-600 w-8 h-8" /> : <ToggleLeft className="text-slate-300 w-8 h-8" />}
                        </div>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-700">Nhắc nhở lịch chi hôm nay</span>
                        <div onClick={() => { setNotifyOnToday(!notifyOnToday); localStorage.setItem('notify_on_today', String(!notifyOnToday)); }} className="cursor-pointer">
                            {notifyOnToday ? <ToggleRight className="text-blue-600 w-8 h-8" /> : <ToggleLeft className="text-slate-300 w-8 h-8" />}
                        </div>
                    </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                <button onClick={() => { 
                  const input = document.getElementById('sheet_url_input') as HTMLInputElement; 
                  const newUrl = input.value.trim();
                  localStorage.setItem('sheet_script_url', newUrl);
                  setSheetScriptUrl(newUrl);
                  setShowConfigModal(false);
                  setTimeout(() => handleFullRefresh(), 500);
                }} className="px-10 py-3 rounded-2xl text-sm font-black bg-emerald-600 text-white hover:bg-emerald-700 shadow-xl shadow-emerald-100 transition-all active:scale-95">Lưu cấu hình</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SidebarItem: React.FC<{ icon: React.ReactNode; label: string; active: boolean; collapsed: boolean; onClick: () => void; }> = ({ icon, label, active, collapsed, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all ${active ? 'bg-blue-600 text-white shadow-xl shadow-blue-900/40' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
    <span className="shrink-0">{icon}</span>
    {!collapsed && <span className="font-black text-sm tracking-tight">{label}</span>}
  </button>
);

const StatCard: React.FC<{ title: string; value: string; unit: string; icon: React.ReactNode; color: string; highlight?: boolean; bgOverride?: string; valueClass?: string; }> = ({ title, value, unit, icon, color, highlight, bgOverride, valueClass }) => (
  <div className={`${bgOverride ? bgOverride : 'bg-white'} p-4 md:p-7 rounded-2xl md:rounded-[32px] shadow-sm border ${highlight && !bgOverride ? 'border-amber-400' : 'border-slate-100'} transition-all hover:shadow-2xl hover:-translate-y-1 group relative overflow-hidden`}>
    <div className="flex items-center justify-between mb-3 md:mb-6 relative z-10">
      <div className={`p-3 md:p-4 rounded-xl md:rounded-2xl shadow-sm ${bgOverride ? 'bg-white/20' : `bg-${color}-50`} group-hover:scale-110 transition-transform`}>{icon}</div>
    </div>
    <div className={`${bgOverride ? 'text-white/70' : 'text-slate-400'} text-[9px] md:text-[10px] font-black mb-1 uppercase tracking-[0.2em] relative z-10`}>{title}</div>
    <div className="flex items-baseline gap-1.5 relative z-10">
      <span className={`text-lg md:text-2xl font-black truncate tracking-tight ${valueClass ? valueClass : (bgOverride ? 'text-white' : 'text-slate-900')}`}>{value}</span>
      <span className={`text-[9px] md:text-[10px] font-black uppercase tracking-widest ${bgOverride ? 'text-white/60' : 'text-slate-400'}`}>{unit}</span>
    </div>
  </div>
);

const FilterButton: React.FC<{ active: boolean; label: string; count: number; onClick: () => void; isAlert?: boolean; }> = ({ active, label, count, onClick, isAlert }) => (
  <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2 md:px-5 md:py-2.5 rounded-xl md:rounded-2xl text-[10px] md:text-[11px] font-black whitespace-nowrap transition-all border shrink-0 ${active ? 'bg-slate-900 text-white border-slate-900 shadow-xl' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-400 hover:text-blue-600'}`}>
    {label}
    <span className={`px-1.5 py-0.5 md:px-2 md:py-0.5 rounded-lg text-[9px] ${active ? 'bg-slate-700 text-slate-100' : (isAlert && count > 0 ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-500')}`}>{count}</span>
  </button>
);

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
