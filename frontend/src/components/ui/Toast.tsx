import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const STYLES: Record<ToastType, { color: string; icon: string }> = {
  success: { color: '#16A34A', icon: 'ti-circle-check' },
  error:   { color: '#DC2626', icon: 'ti-circle-x' },
  info:    { color: '#2563EB', icon: 'ti-info-circle' },
  warning: { color: '#D97706', icon: 'ti-alert-circle' },
};

function SingleToast({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const s = STYLES[item.type];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 14px', background: '#FFFFFF',
      border: '1px solid #E4E4E7', borderLeft: `3px solid ${s.color}`,
      borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
      minWidth: 280, maxWidth: 400, animation: 'toastIn 0.2s ease',
    }}>
      <i className={`ti ${s.icon}`} style={{ fontSize: 16, color: s.color, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: '#191C1D', flex: 1, lineHeight: 1.4, fontFamily: "'Inter', system-ui, sans-serif" }}>
        {item.message}
      </span>
      <button onClick={onClose}
        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#A1A1AA', padding: 2, display: 'flex', alignItems: 'center', flexShrink: 0 }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#71717A'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#A1A1AA'}
      >
        <i className="ti ti-x" style={{ fontSize: 13 }} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev.slice(-4), { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3800);
  }, []);

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {toasts.length > 0 && (
        <>
          <style>{`@keyframes toastIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }`}</style>
          <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {toasts.map(t => <SingleToast key={t.id} item={t} onClose={() => remove(t.id)} />)}
          </div>
        </>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
