/* Sessio · utilitários compartilhados (datas, dinheiro, telefone, ícones). */
(function(){
const U = {};
U.$ = (s, r) => (r || document).querySelector(s);
U.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
U.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

U.toast = msg => { const t = U.$('#toast'); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(U.toast._t); U.toast._t = setTimeout(() => t.hidden = true, 2600); };

U.store = {
  get(k, d){ try { const v = localStorage.getItem('sessio:' + k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem('sessio:' + k, JSON.stringify(v)); } catch(e){} },
  del(k){ try { localStorage.removeItem('sessio:' + k); } catch(e){} }
};

U.uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c === 'x' ? r : (r&3|8)).toString(16); }));

/* ---------- datas (sempre no fuso do aparelho) ---------- */
const pad = n => String(n).padStart(2, '0');
U.pad = pad;
U.ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
U.hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
U.fromYmd = s => { const [y,m,d] = String(s).split('-').map(Number); return new Date(y, m-1, d); };
U.at = (ymd, hm) => { const d = U.fromYmd(ymd); const [h,mi] = String(hm || '00:00').split(':').map(Number); d.setHours(h||0, mi||0, 0, 0); return d; };
U.addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
U.addMin = (d, n) => new Date(new Date(d).getTime() + n * 60000);
U.startOfDay = d => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
U.startOfWeek = d => { const x = U.startOfDay(d); const wd = (x.getDay() + 6) % 7; return U.addDays(x, -wd); }; // segunda
U.startOfMonth = d => new Date(d.getFullYear(), d.getMonth(), 1);
U.addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
U.sameDay = (a, b) => U.ymd(new Date(a)) === U.ymd(new Date(b));
const fmt = (o) => new Intl.DateTimeFormat('pt-BR', o);
U.fDia = d => fmt({weekday:'long', day:'numeric', month:'long'}).format(new Date(d));
U.fDiaCurto = d => fmt({weekday:'short', day:'2-digit', month:'2-digit'}).format(new Date(d)).replace('.', '');
U.fData = d => fmt({day:'2-digit', month:'2-digit', year:'numeric'}).format(new Date(d));
U.fMes = d => fmt({month:'long', year:'numeric'}).format(new Date(d));
U.fMesCurto = d => fmt({month:'short'}).format(new Date(d)).replace('.', '');
U.fSemana = d => fmt({weekday:'short'}).format(new Date(d)).replace('.', '').slice(0,3);
U.fHora = d => U.hm(new Date(d));
U.cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
U.fusoLocal = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo'; } catch(e){ return 'America/Sao_Paulo'; } };

/* ---------- dinheiro ---------- */
const brl = new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'});
U.brl = v => brl.format(Number(v) || 0);
U.brlCurto = v => { const n = Number(v) || 0; return n >= 10000 ? 'R$ ' + (n/1000).toLocaleString('pt-BR', {maximumFractionDigits:1}) + ' mil' : brl.format(n); };
U.parseValor = s => {
  let t = String(s == null ? '' : s).replace(/[^\d,.-]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};
U.valorInput = v => v == null || v === '' ? '' : Number(v).toFixed(2).replace('.', ',');

/* ---------- telefone e WhatsApp ---------- */
U.digits = s => String(s || '').replace(/\D/g, '');
U.waNumber = s => { let d = U.digits(s); if (!d) return ''; if (d.length <= 11) d = '55' + d.replace(/^0+/, ''); return d; };
U.waLink = (fone, texto) => { const n = U.waNumber(fone); return 'https://wa.me/' + n + '?text=' + encodeURIComponent(texto || ''); };
U.fFone = s => { const d = U.digits(s).replace(/^55(?=\d{10,11}$)/, ''); if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`; if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`; return s || ''; };

/* CRP: região 01 a 24 + número */
U.normCRP = s => {
  // aceita "20/13.134", "20/13134", "CRP 20/13.134", "20-13134" ou "20 13134"
  const t = String(s || '').toUpperCase().replace(/CRP/g, '').trim();
  const m = t.match(/^(\d{1,2})\s*[\/\-\s]\s*(\d{1,3}(?:\.\d{3})+|\d{3,6})$/);
  if (!m) return '';
  const r = Number(m[1]); if (r < 1 || r > 24) return '';
  const n = m[2].replace(/\./g, '');
  if (n.length < 3 || n.length > 6) return '';
  return `CRP ${pad(r)}/${n.length > 3 ? n.replace(/\B(?=(\d{3})+$)/g, '.') : n}`;
};
U.primeiroNome = s => String(s || '').trim().split(/\s+/)[0] || '';
U.iniciais = s => { const p = String(s || '').trim().split(/\s+/).filter(Boolean); return ((p[0]||'')[0]||'') + (p.length > 1 ? p[p.length-1][0] : ''); };
U.norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

U.copiar = async (texto) => {
  try { await navigator.clipboard.writeText(texto); U.toast('Copiado'); }
  catch(e){ const t = document.createElement('textarea'); t.value = texto; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); U.toast('Copiado'); } catch(_){} t.remove(); }
};

U.baixar = (nome, conteudo, tipo) => {
  const blob = new Blob([conteudo], {type: tipo || 'text/plain;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
};
U.csv = (linhas) => '﻿' + linhas.map(l => l.map(c => { const s = String(c == null ? '' : c); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');

/* ---------- ícones (traço 1.6, cantos arredondados) ---------- */
const ic = (d, extra) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra||''}>${d}</svg>`;
U.ico = {
  prev: ic('<path d="M15 18l-6-6 6-6"/>'),
  next: ic('<path d="M9 18l6-6-6-6"/>'),
  back: ic('<path d="M19 12H5M11 18l-6-6 6-6"/>'),
  plus: ic('<path d="M12 5v14M5 12h14"/>'),
  search: ic('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  whats: ic('<path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.4z"/><path d="M9 9.5c.3 1.8 2.2 4 4.5 4.6l1.2-1.1 1.8.8c-.2 1-1 1.7-2 1.7-3.3 0-6.5-3.2-6.5-6.5 0-1 .7-1.8 1.7-2l.8 1.8z"/>'),
  mail: ic('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 7l8 6 8-6"/>'),
  link: ic('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  lock: ic('<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  video: ic('<rect x="3" y="6" width="13" height="12" rx="3"/><path d="M16 10.5l5-3v9l-5-3"/>'),
  pin: ic('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  repeat: ic('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>'),
  money: ic('<rect x="3" y="6" width="18" height="12" rx="3"/><circle cx="12" cy="12" r="2.5"/><path d="M7 12h.01M17 12h.01"/>'),
  check: ic('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  x: ic('<path d="M6 6l12 12M18 6L6 18"/>'),
  phone: ic('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'),
  download: ic('<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>'),
  ban: ic('<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>'),
  user: ic('<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'),
};
U.psi = (size) => `<svg width="${size||22}" height="${size||22}" viewBox="0 0 48 48" fill="none" aria-hidden="true">
  <circle cx="24" cy="24" r="22.5" stroke="var(--olive)" stroke-opacity=".35"/>
  <g stroke="var(--gold)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M24 11v26"/><path d="M14.5 15.5v4.5a9.5 9.5 0 0 0 19 0v-4.5"/><path d="M19 37h10"/></g></svg>`;

/* tema salvo pelo usuário (auto | light | dark) */
U.aplicarTema = t => { if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; };
U.aplicarTema(U.store.get('tema', 'auto'));

window.U = U;
})();
