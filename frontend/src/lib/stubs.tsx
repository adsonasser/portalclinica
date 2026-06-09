import { type ReactNode } from 'react';

export function PageStub({ title, icon, children }: { title: string; icon: string; children?: ReactNode }) {
  return (
    <div style={{ padding: '48px 28px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <i className={`ti ${icon}`} style={{ fontSize: 28, color: '#A1A1AA' }} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#09090B' }}>{title}</div>
      <div style={{ fontSize: 13, color: '#71717A' }}>Em implementação</div>
      {children}
    </div>
  );
}
