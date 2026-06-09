# Portal Clínica 2 — Regras do projeto

## Stack
- **Backend:** NestJS 11 + Prisma 7 + PostgreSQL · porta **3002**
- **Frontend:** React 18 + Vite + inline styles · porta **5174**
- **DB:** `portal_clinica_v2`
- **Prisma 7:** não usa `url` no schema; conexão via `PrismaPg({ connectionString: process.env.DATABASE_URL })`

## REGRA ZERO — Sempre reescrever do zero
- NUNCA reaproveitar estrutura, layout ou cores de versões antigas
- NUNCA usar Tailwind — somente inline styles ou CSS variables
- Se um elemento não está no briefing, perguntar antes de inventar

---

## Shell da Aplicação (AppLayout)

### Sidebar flutuante
- `position: fixed`, `left: 12`, `top: 12`, `bottom: 12`, `width: 68`
- `background: #FFFFFF`, `borderRadius: 28`, `border: 1px solid rgba(0,0,0,0.06)`, `boxShadow: 0 4px 24px rgba(0,0,0,0.05)`
- Logo: círculo preto (`#000000`) com ícone branco
- Ícones: `color: #18181B`, tamanho 18px
- Estado ativo: `background: #F4F4F5`, `border: 1px solid #E4E4E7`, `borderRadius: 50%`
- Hover: `background: #F4F4F5`
- Tooltip CSS (`.pcl-nav-btn::after`) — aparece à direita do ícone, fundo `#18181B`

### Top bar fixo
- `position: fixed`, `left: 96`, `right: 0`, `top: 0`, `height: 65`
- `background: rgba(248,249,250,0.88)`, `backdropFilter: blur(14px)`
- `borderBottom: 1px solid rgba(0,0,0,0.05)`
- Esquerda: título da página (20px, fontWeight 600, `#191C1D`) + subtítulo (13px, `#71717A`) — derivados da rota
- Direita: botão sino + notificação vermelha, botão ajuda, divider, avatar do usuário

### Área de conteúdo
- `marginLeft: 96`, `paddingTop: 65`, `height: 100vh`, `overflowY: auto`
- Background: `#F8F9FA`
- **Páginas não têm header próprio** — usam padding `24px 28px` direto no conteúdo

---

## Design System — Black Minimal

### Paleta de cores

```
Fundos
  #FAFAFA   canvas da aplicação     (--bg-background)
  #FFFFFF   cards e painéis         (--bg-surface)
  #F4F4F5   cabeçalho de tabelas    (--bg-table-head)
  #F9F9F9   hover de linhas         (--bg-row-hover)

Primário
  #000000   ações primárias, ênfase (--bg-primary)
  #18181B   hover do botão primário (--btn-primary-hover)

Menu lateral (preto)
  #0A0A0A   fundo do sidebar        (--menu-bg)
  #1A1A1A   borda do sidebar        (--menu-border)
  #71717A   ícones inativos         (--menu-icon)
  #FFFFFF   ícone/item ativo        (--menu-icon-active)
  rgba(255,255,255,.08)  fundo item ativo (--menu-item-active-bg)

Texto (zinc scale)
  #09090B   títulos                 (--text-primary)   zinc-950
  #18181B   corpo                   (--text-body)      zinc-900
  #71717A   secundário/meta         (--text-secondary) zinc-500
  #A1A1AA   desabilitado            (--text-disabled)  zinc-400

Bordas
  #E4E4E7   padrão                  (--color-border)   zinc-200
  #D4D4D8   forte                   (--color-border-strong) zinc-300

Status semânticos
  Active/success: text #16A34A  bg #DCFCE7
  Pending/muted:  text #71717A  bg #F4F4F5
  Warning:        text #D97706  bg #FFFBEB
  Danger/error:   text #DC2626  bg #FEF2F2
  Info:           text #2563EB  bg #EFF6FF
```

---

### Layout de página (OBRIGATÓRIO em toda tela)

```jsx
<div style={{
  height: '100%', display: 'flex', flexDirection: 'column',
  overflow: 'hidden', background: '#FAFAFA',
  fontFamily: "'Inter', system-ui, sans-serif"
}}>
  {/* Header */}
  <div style={{
    flexShrink: 0, background: '#FFFFFF',
    borderBottom: '1px solid #E4E4E7',
    padding: '20px 40px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
  }}>
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#09090B', letterSpacing: '-0.3px' }}>{titulo}</h1>
      <p style={{ fontSize: 13, color: '#71717A', marginTop: 2 }}>{subtitulo}</p>
    </div>
    <div style={{ display: 'flex', gap: 8 }}>
      {/* botões */}
    </div>
  </div>

  {/* Tabs (quando existir) */}
  <div style={{
    flexShrink: 0, background: '#FFFFFF',
    borderBottom: '1px solid #E4E4E7', padding: '0 40px'
  }}>
    {/* abas */}
  </div>

  {/* Body — ÚNICO elemento que rola */}
  <div style={{ flex: 1, padding: '24px 40px', overflowY: 'auto', minHeight: 0 }}>
    {/* conteúdo */}
  </div>
</div>
```

---

### Botões

```jsx
// Primário — preto sólido
<button style={{
  height: 36, padding: '0 16px',
  background: '#000000', border: 'none', borderRadius: 8,
  fontSize: 13, fontWeight: 600, color: '#FFFFFF',
  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
}}>
  <i className="ti ti-plus" style={{ fontSize: 14 }} /> {label}
</button>

// Secundário — outline preto
<button style={{
  height: 36, padding: '0 14px',
  background: '#FFFFFF', border: '1px solid #000000', borderRadius: 8,
  fontSize: 13, fontWeight: 500, color: '#000000',
  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
}}>{label}</button>

// Ghost / Tertiary
<button style={{
  height: 36, padding: '0 12px',
  background: 'transparent', border: 'none',
  fontSize: 13, fontWeight: 500, color: '#71717A',
  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5
}}>
  <i className="ti ti-plus" style={{ fontSize: 13 }} /> {label}
</button>

// Danger
<button style={{
  height: 36, padding: '0 14px',
  background: '#EF4444', border: 'none', borderRadius: 8,
  fontSize: 13, fontWeight: 600, color: '#FFFFFF', cursor: 'pointer'
}}>{label}</button>
```

---

### Cards

```jsx
// Card padrão
const cardStyle = {
  background: '#FFFFFF',
  borderRadius: 20,
  border: '1px solid #EAECEF',
  padding: '18px 20px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
};

// Hover em card
onMouseEnter={e => {
  e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.08)';
  e.currentTarget.style.borderColor = '#D4D4D8';
}}
onMouseLeave={e => {
  e.currentTarget.style.boxShadow = 'none';
  e.currentTarget.style.borderColor = '#E4E4E7';
}}

// Hover em linha de tabela
onMouseEnter={e => e.currentTarget.style.background = '#F9F9F9'}
onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
```

---

### Kanban Card

```jsx
<div style={{
  background: '#FFFFFF', borderRadius: 10,
  border: '1px solid #E4E4E7', padding: '14px 16px',
  cursor: 'pointer'
}}>
  {/* Topo: título + tag */}
  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
    <span style={{ fontSize: 13, fontWeight: 600, color: '#09090B' }}>{titulo}</span>
    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
      background: '#F4F4F5', color: '#71717A', letterSpacing: '.04em', textTransform: 'uppercase' }}>
      {tag}
    </span>
  </div>
  {/* Descrição */}
  <p style={{ fontSize: 12, color: '#71717A', lineHeight: 1.5, marginBottom: 12 }}>{descricao}</p>
  {/* Rodapé: valor + avatar */}
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <span style={{ fontSize: 14, fontWeight: 700, color: '#09090B' }}>{valor}</span>
    {avatar && (
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#F4F4F5',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 600, color: '#71717A' }}>
        {iniciais}
      </div>
    )}
  </div>
</div>
```

---

### Tabela / List Item

```jsx
<table style={{ width: '100%', borderCollapse: 'collapse' }}>
  <thead>
    <tr style={{ background: '#F4F4F5', borderBottom: '1px solid #E4E4E7' }}>
      <th style={{
        padding: '10px 16px', textAlign: 'left',
        fontSize: 11, fontWeight: 600, color: '#71717A',
        textTransform: 'uppercase', letterSpacing: '.06em'
      }}>NOME</th>
      <th style={{ /* igual acima */ }}>STATUS</th>
    </tr>
  </thead>
  <tbody>
    <tr style={{ borderBottom: '1px solid #F4F4F5', cursor: 'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = '#F9F9F9'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      {/* Avatar com iniciais */}
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#F4F4F5',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 600, color: '#18181B', flexShrink: 0 }}>
            {iniciais}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#09090B' }}>{nome}</div>
            <div style={{ fontSize: 12, color: '#71717A' }}>{sub}</div>
          </div>
        </div>
      </td>
    </tr>
  </tbody>
</table>
```

---

### Badges de status

```jsx
// Active / Ativo / Pago / Confirmado
<span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99,
  background: '#DCFCE7', color: '#16A34A' }}>Active</span>

// Pending / Aguardando / Processando
<span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99,
  background: '#F4F4F5', color: '#71717A' }}>Pending</span>

// Warning / Atenção
<span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99,
  background: '#FFFBEB', color: '#D97706' }}>Warning</span>

// Danger / Cancelado / Em risco
<span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99,
  background: '#FEF2F2', color: '#DC2626' }}>Danger</span>
```

---

### Inputs & Forms

```jsx
// Search input
<div style={{
  display: 'flex', alignItems: 'center', gap: 8,
  background: '#FFFFFF', border: '1px solid #E4E4E7',
  borderRadius: 8, padding: '0 12px', height: 36, width: 280
}}>
  <i className="ti ti-search" style={{ fontSize: 14, color: '#A1A1AA' }} />
  <input placeholder="Search patients or opportunities..."
    style={{ border: 'none', background: 'transparent', fontSize: 13,
      outline: 'none', width: '100%', color: '#09090B' }} />
</div>

// Dropdown padrão
<select style={{
  height: 36, padding: '0 12px',
  border: '1px solid #E4E4E7', borderRadius: 8,
  fontSize: 13, color: '#09090B', background: '#FFFFFF', cursor: 'pointer'
}}>
  <option>Select an option</option>
</select>
```

---

### Abas (tabs)

```jsx
<div style={{ display: 'flex', padding: '0 40px', background: '#FFFFFF', borderBottom: '1px solid #E4E4E7' }}>
  {tabs.map(t => (
    <button key={t.key} onClick={() => setTab(t.key)} style={{
      padding: '10px 14px', fontSize: 13, fontWeight: 500,
      color: ativa === t.key ? '#09090B' : '#71717A',
      background: 'none', border: 'none',
      borderBottom: ativa === t.key ? '2px solid #000000' : '2px solid transparent',
      cursor: 'pointer', marginBottom: -1
    }}>
      {t.label}
      {t.count !== undefined && (
        <span style={{
          marginLeft: 6, fontSize: 11, padding: '1px 6px', borderRadius: 99,
          background: ativa === t.key ? '#000000' : '#F4F4F5',
          color: ativa === t.key ? '#FFFFFF' : '#71717A'
        }}>{t.count}</span>
      )}
    </button>
  ))}
</div>
```

---

### KPI Cards

```jsx
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(N, 1fr)', gap: 16 }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 16,
    padding: '20px 24px', borderRadius: 12,
    border: '1px solid #E4E4E7', background: '#FFFFFF' }}>
    {/* Ícone — obrigatório */}
    <div style={{ width: 48, height: 48, borderRadius: 12,
      background: iconBg, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <i className={`ti ${icon}`} style={{ fontSize: 22, color: iconColor }} />
    </div>
    <div>
      <div style={{ fontSize: 12, color: '#71717A', fontWeight: 500, marginBottom: 4,
        textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#09090B', lineHeight: 1.1 }}>{valor}</div>
      <div style={{ fontSize: 12, color: '#71717A', marginTop: 2 }}>{sub}</div>
    </div>
  </div>
</div>
```

---

### Ícones
Usar **Tabler Icons** via CDN (já incluído): `<i className="ti ti-xxx" style={{ fontSize: N, color: cor }} />`

### Ícones de KPI — fundo para cada categoria
```
Pacientes/pessoas:   bg #EFF6FF  icon #2563EB
Financeiro/dinheiro: bg #F0FDF4  icon #16A34A
Agenda/tempo:        bg #FFFBEB  icon #D97706
Risco/alerta:        bg #FEF2F2  icon #DC2626
CRM/leads:           bg #F5F3FF  icon #7C3AED
Neutro/muted:        bg #F4F4F5  icon #71717A
```

---

## Como rodar

```bash
# Backend (porta 3002)
cd backend && npm run start:dev

# Frontend (porta 5174)
cd frontend && npm run dev

# Seed inicial
cd backend && npx tsx prisma/seed.ts
# Login: admin@clinica.com / admin123
```
