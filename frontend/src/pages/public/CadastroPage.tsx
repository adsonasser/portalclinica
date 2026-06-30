import { useState } from 'react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3002';

const EMPTY = {
  name: '', cnpj: '', email: '', phone: '', responsavel: '', password: '', confirmPassword: '',
  cep: '', street: '', addressNumber: '', complement: '', neighborhood: '', cidade: '', estado: '',
};

export function CadastroPage() {
  const [form, setForm]       = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [done, setDone]       = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [showPw, setShowPw]   = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function fetchCep(cep: string) {
    const clean = cep.replace(/\D/g, '');
    if (clean.length !== 8) return;
    setCepLoading(true);
    try {
      const res  = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm(f => ({ ...f, street: data.logradouro ?? f.street, neighborhood: data.bairro ?? f.neighborhood, cidade: data.localidade ?? f.cidade, estado: data.uf ?? f.estado }));
      }
    } catch { /* allow manual fill */ } finally { setCepLoading(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) { setError('As senhas não coincidem.'); return; }
    if (form.password.length < 6) { setError('A senha deve ter no mínimo 6 caracteres.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/public/register`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...form, cnpj: form.cnpj.replace(/\D/g, '') }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Erro ao cadastrar');
      setDone(true);
    } catch (err: any) {
      setError(err.message ?? 'Erro inesperado. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', height: 42, padding: '0 12px',
    border: '1px solid #E4E4E7', borderRadius: 8,
    fontSize: 14, color: '#09090B', background: '#FFFFFF',
    boxSizing: 'border-box', fontFamily: "'Inter', system-ui, sans-serif", outline: 'none',
  };
  const lbl: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 };
  const req = <span style={{ color: '#EF4444' }}> *</span>;

  if (done) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8F9FA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', system-ui, sans-serif", padding: 24 }}>
        <div style={{ background: '#FFFFFF', borderRadius: 20, border: '1px solid #E4E4E7', padding: '48px 40px', maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <i className="ti ti-mail-check" style={{ fontSize: 30, color: '#16A34A' }} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#09090B', margin: '0 0 10px' }}>Verifique seu e-mail!</h1>
          <p style={{ fontSize: 14, color: '#71717A', lineHeight: 1.7, margin: '0 0 28px' }}>
            Enviamos um link de confirmação para <strong style={{ color: '#09090B' }}>{form.email}</strong>.
            Clique no link para ativar sua conta e começar a usar o sistema.
          </p>
          <p style={{ fontSize: 12, color: '#A1A1AA', margin: 0 }}>Não recebeu? Verifique a pasta de spam.</p>
          <a href="/login" style={{ display: 'inline-block', marginTop: 24, fontSize: 13, color: '#000', fontWeight: 600, textDecoration: 'none' }}>
            Ir para o login →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', system-ui, sans-serif", padding: '32px 16px' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ background: '#FFFFFF', borderRadius: 20, border: '1px solid #E4E4E7', padding: '40px 40px', maxWidth: 620, width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        {/* Logo / Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <i className="ti ti-stethoscope" style={{ fontSize: 22, color: '#FFFFFF' }} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#09090B', margin: '0 0 6px' }}>Cadastre sua clínica</h1>
          <p style={{ fontSize: 14, color: '#71717A', margin: 0 }}>Crie sua conta e comece a usar o NassClin</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Empresa */}
          <div style={{ fontSize: 11, fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1px solid #E4E4E7', paddingBottom: 8 }}>
            Dados da empresa
          </div>

          <div><label style={lbl}>Nome da clínica / empresa{req}</label><input value={form.name} onChange={set('name')} placeholder="Clínica Exemplo Ltda" style={inp} required /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={lbl}>CNPJ{req}</label><input value={form.cnpj} onChange={set('cnpj')} placeholder="00.000.000/0001-00" style={inp} required /></div>
            <div><label style={lbl}>Telefone{req}</label><input value={form.phone} onChange={set('phone')} placeholder="(62) 9 9999-9999" style={inp} required /></div>
          </div>
          <div><label style={lbl}>Nome do responsável{req}</label><input value={form.responsavel} onChange={set('responsavel')} placeholder="Dr. João Silva" style={inp} required /></div>

          {/* Endereço */}
          <div style={{ fontSize: 11, fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1px solid #E4E4E7', paddingBottom: 8, marginTop: 4 }}>
            Endereço
          </div>

          <div>
            <label style={lbl}>CEP{req}</label>
            <div style={{ position: 'relative' }}>
              <input value={form.cep} onChange={e => { set('cep')(e); if (e.target.value.replace(/\D/g,'').length === 8) fetchCep(e.target.value); }} placeholder="00000-000" maxLength={9} style={{ ...inp, paddingRight: 36 }} required />
              {cepLoading && <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, border: '2px solid #E4E4E7', borderTopColor: '#000', borderRadius: '50%', animation: 'spin .75s linear infinite' }} />}
            </div>
          </div>
          <div><label style={lbl}>Rua / Logradouro{req}</label><input value={form.street} onChange={set('street')} placeholder="Rua das Flores" style={inp} required /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <div><label style={lbl}>Número</label><input value={form.addressNumber} onChange={set('addressNumber')} placeholder="123" style={inp} /></div>
            <div><label style={lbl}>Complemento</label><input value={form.complement} onChange={set('complement')} placeholder="Sala 4" style={inp} /></div>
          </div>
          <div><label style={lbl}>Bairro</label><input value={form.neighborhood} onChange={set('neighborhood')} placeholder="Centro" style={inp} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div><label style={lbl}>Cidade{req}</label><input value={form.cidade} onChange={set('cidade')} placeholder="Goiânia" style={inp} required /></div>
            <div><label style={lbl}>UF{req}</label><input value={form.estado} onChange={set('estado')} placeholder="GO" maxLength={2} style={inp} required /></div>
          </div>

          {/* Acesso */}
          <div style={{ fontSize: 11, fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1px solid #E4E4E7', paddingBottom: 8, marginTop: 4 }}>
            Dados de acesso
          </div>

          <div><label style={lbl}>E-mail (será usado para login){req}</label><input value={form.email} onChange={set('email')} placeholder="contato@clinica.com" type="email" style={inp} required /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Senha{req}</label>
              <div style={{ position: 'relative' }}>
                <input value={form.password} onChange={set('password')} placeholder="Mínimo 6 caracteres" type={showPw ? 'text' : 'password'} style={{ ...inp, paddingRight: 40 }} required />
                <button type="button" onClick={() => setShowPw(p => !p)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#71717A', padding: 0, display: 'flex' }}>
                  <i className={`ti ti-eye${showPw ? '-off' : ''}`} style={{ fontSize: 16 }} />
                </button>
              </div>
            </div>
            <div><label style={lbl}>Confirmar senha{req}</label><input value={form.confirmPassword} onChange={set('confirmPassword')} placeholder="Repita a senha" type={showPw ? 'text' : 'password'} style={inp} required /></div>
          </div>

          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#DC2626', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-alert-circle" style={{ fontSize: 15, flexShrink: 0 }} />{error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{ height: 46, background: loading ? '#52525B' : '#000000', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, color: '#FFFFFF', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 }}>
            {loading ? (
              <>
                <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .75s linear infinite' }} />
                Cadastrando...
              </>
            ) : (
              <>
                <i className="ti ti-building-plus" style={{ fontSize: 16 }} />
                Criar conta gratuitamente
              </>
            )}
          </button>

          <p style={{ textAlign: 'center', fontSize: 13, color: '#71717A', margin: 0 }}>
            Já tem uma conta?{' '}
            <a href="/login" style={{ color: '#000', fontWeight: 600, textDecoration: 'none' }}>Fazer login</a>
          </p>
        </form>
      </div>
    </div>
  );
}
