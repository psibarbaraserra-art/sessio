/* Sessio · camada de dados.
   Com o Supabase configurado (js/config.js), tudo fica no banco, protegido por RLS.
   Sem configuração, roda em modo demonstração: dados fictícios guardados só neste aparelho. */
(function(){
const CFG = window.SESSIO_CONFIG || {};
const LIVE = !!(CFG.supabaseUrl && CFG.supabaseKey && window.supabase);
const sb = LIVE ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {auth:{persistSession:true, autoRefreshToken:true}}) : null;
const COBRAVEL = ['agendada','realizada','falta'];
const D = {LIVE, sb, COBRAVEL, userId:null};

const ok = ({data, error}) => { if (error) throw new Error(error.message || 'Erro ao falar com o servidor'); return data; };
const iso = d => new Date(d).toISOString();
const agora = () => new Date().toISOString();

/* =================== modo demonstração (local) =================== */
const L = {
  get db(){ return U.store.get('demo', null); },
  save(db){ U.store.set('demo', db); },
  seed(){
    const hoje = U.startOfDay(new Date());
    const seg = U.startOfWeek(hoje);
    const pac = [
      ['Mariana Alves',   '92991110001', 'mariana@exemplo.com', 180, 0, '09:00', 'presencial'],
      ['João Pedro Lima', '92991110002', 'joao@exemplo.com',    150, 0, '14:00', 'online'],
      ['Camila Souza',    '92991110003', '',                    180, 1, '10:00', 'presencial'],
      ['Rafael Mendes',   '92991110004', 'rafael@exemplo.com',  160, 2, '16:00', 'online'],
      ['Beatriz Rocha',   '92991110005', 'bia@exemplo.com',     180, 3, '08:00', 'presencial'],
      ['Lucas Ferreira',  '92991110006', '',                    120, 3, '18:00', 'presencial'],
    ].map(([nome, telefone, email, valor, wd, hora, mod]) => ({
      id:U.uuid(), nome, telefone, email, valor_sessao:valor, lembretes:true, observacao:'', ativo:true,
      criado_em:agora(), atualizado_em:agora(), _wd:wd, _hora:hora, _mod:mod
    }));
    const sessoes = [];
    pac.forEach((p, i) => {
      const serie = U.uuid();
      for (let w = -6; w <= 8; w++) {
        const dia = U.addDays(seg, w * 7 + p._wd);
        const ini = U.at(U.ymd(dia), p._hora);
        const passado = ini < new Date();
        let status = passado ? 'realizada' : 'agendada', pagamento = passado ? 'pago' : 'pendente';
        if (passado && w === -2 && i === 3) status = 'falta';
        if (passado && w >= -1 && (i === 1 || i === 5)) pagamento = 'pendente';
        let confirmacao = 'pendente';
        if (!passado && w === 0) confirmacao = i % 2 ? 'confirmada' : 'pendente';
        if (!passado && w === 1 && i === 2) confirmacao = 'desmarcada';
        sessoes.push({
          id:U.uuid(), paciente_id:p.id, inicio:iso(ini), duracao_min:50, modalidade:p._mod,
          link:p._mod === 'online' ? 'https://meet.google.com/abc-defg-hij' : null,
          status, valor:p.valor_sessao, pagamento, pago_em: pagamento === 'pago' ? U.ymd(ini) : null,
          forma_pagamento: pagamento === 'pago' ? (i % 2 ? 'pix' : 'transferencia') : null,
          serie_id:serie, recorrencia:'semanal', encaixe:false, confirmacao,
          confirmacao_em: confirmacao !== 'pendente' ? agora() : null, lembrete_enviado_em:null,
          token:U.uuid(), observacao:'', criado_em:agora(), atualizado_em:agora()
        });
      }
      delete p._wd; delete p._hora; delete p._mod;
    });
    const sex = U.addDays(seg, 4);
    const bloqueios = [{id:U.uuid(), inicio:iso(U.at(U.ymd(sex), '12:00')), fim:iso(U.at(U.ymd(sex), '14:00')), motivo:'Supervisão', criado_em:agora()}];
    const db = {
      perfil:{nome:'Psicóloga Exemplo', crp:'CRP 20/00000', whatsapp:'92900000000', fuso:U.fusoLocal(), valor_padrao:180,
              duracao_padrao:50, lembrete_auto:true, lembrete_horas:24, bloqueado:false},
      pacientes:pac, sessoes, bloqueios
    };
    L.save(db); return db;
  },
  ensure(){ return L.db || L.seed(); }
};

/* =================== API =================== */
D.inicio = async () => { if (!LIVE) L.ensure(); };
D.resetDemo = () => { U.store.del('demo'); L.seed(); };

D.perfil = async () => {
  if (!LIVE) return L.ensure().perfil;
  return ok(await sb.from('perfis').select('*').eq('id', D.userId).maybeSingle());
};
D.salvarPerfil = async (p) => {
  const campos = ['nome','crp','whatsapp','fuso','valor_padrao','duracao_padrao','lembrete_auto','lembrete_horas'];
  const row = {}; campos.forEach(k => { if (k in p) row[k] = p[k]; });
  row.atualizado_em = agora();
  if (!LIVE) { const db = L.ensure(); db.perfil = {...db.perfil, ...row}; L.save(db); return db.perfil; }
  return ok(await sb.from('perfis').upsert({id:D.userId, ...row}).select().single());
};
D.assinatura = async (email) => {
  if (!LIVE) return {status:'ativa', expira_em:null, origem:'demo'};
  return ok(await sb.from('assinaturas').select('status, expira_em, origem').ilike('email', email).maybeSingle());
};

/* pacientes */
D.pacientes = async () => {
  if (!LIVE) return [...L.ensure().pacientes].sort((a,b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return ok(await sb.from('pacientes').select('*').order('nome'));
};
D.salvarPaciente = async (p) => {
  const row = {nome:p.nome, telefone:p.telefone || null, email:p.email || null, valor_sessao:p.valor_sessao,
               lembretes:!!p.lembretes, observacao:p.observacao || null, ativo:p.ativo !== false, atualizado_em:agora()};
  if (!LIVE) {
    const db = L.ensure();
    if (p.id) { const i = db.pacientes.findIndex(x => x.id === p.id); db.pacientes[i] = {...db.pacientes[i], ...row}; L.save(db); return db.pacientes[i]; }
    const novo = {id:U.uuid(), criado_em:agora(), ...row}; db.pacientes.push(novo); L.save(db); return novo;
  }
  if (p.id) return ok(await sb.from('pacientes').update(row).eq('id', p.id).select().single());
  return ok(await sb.from('pacientes').insert(row).select().single());
};
D.excluirPaciente = async (id) => {
  if (!LIVE) { const db = L.ensure(); db.pacientes = db.pacientes.filter(p => p.id !== id); db.sessoes = db.sessoes.filter(s => s.paciente_id !== id); L.save(db); return; }
  ok(await sb.from('pacientes').delete().eq('id', id));
};

/* sessões */
D.sessoes = async ({de, ate, paciente_id, serie_id} = {}) => {
  if (!LIVE) {
    return L.ensure().sessoes.filter(s =>
      (!de || new Date(s.inicio) >= new Date(de)) && (!ate || new Date(s.inicio) < new Date(ate)) &&
      (!paciente_id || s.paciente_id === paciente_id) && (!serie_id || s.serie_id === serie_id)
    ).sort((a,b) => new Date(a.inicio) - new Date(b.inicio));
  }
  let q = sb.from('sessoes').select('*').order('inicio');
  if (de) q = q.gte('inicio', iso(de));
  if (ate) q = q.lt('inicio', iso(ate));
  if (paciente_id) q = q.eq('paciente_id', paciente_id);
  if (serie_id) q = q.eq('serie_id', serie_id);
  return ok(await q.limit(2000));
};
D.sessao = async (id) => {
  if (!LIVE) return L.ensure().sessoes.find(s => s.id === id) || null;
  return ok(await sb.from('sessoes').select('*').eq('id', id).maybeSingle());
};
D.pendencias = async () => {
  if (!LIVE) {
    const n = new Date();
    return L.ensure().sessoes.filter(s => COBRAVEL.includes(s.status) && s.pagamento === 'pendente' && new Date(s.inicio) < n)
      .sort((a,b) => new Date(a.inicio) - new Date(b.inicio));
  }
  return ok(await sb.from('sessoes').select('*').in('status', COBRAVEL).eq('pagamento', 'pendente').lt('inicio', agora()).order('inicio').limit(2000));
};
D.desmarcadas = async () => {
  if (!LIVE) return L.ensure().sessoes.filter(s => s.status === 'agendada' && s.confirmacao === 'desmarcada' && new Date(s.inicio) > new Date());
  return ok(await sb.from('sessoes').select('*').eq('status', 'agendada').eq('confirmacao', 'desmarcada').gt('inicio', agora()).order('inicio'));
};
const camposSessao = ['paciente_id','inicio','duracao_min','modalidade','link','status','valor','pagamento','pago_em','forma_pagamento',
                      'serie_id','recorrencia','encaixe','confirmacao','confirmacao_em','lembrete_enviado_em','observacao'];
const limpar = (s) => { const r = {}; camposSessao.forEach(k => { if (k in s) r[k] = s[k]; }); return r; };
D.inserirSessoes = async (lista) => {
  const rows = lista.map(s => ({...limpar(s), atualizado_em:agora()}));
  if (!LIVE) {
    const db = L.ensure();
    const novos = rows.map(r => ({id:U.uuid(), status:'agendada', pagamento:'pendente', confirmacao:'pendente', encaixe:false,
      token:U.uuid(), lembrete_enviado_em:null, criado_em:agora(), ...r}));
    db.sessoes.push(...novos); L.save(db); return novos;
  }
  return ok(await sb.from('sessoes').insert(rows).select());
};
D.atualizarSessoes = async (ids, patch) => {
  const row = {...limpar(patch), atualizado_em:agora()};
  if (!LIVE) {
    const db = L.ensure();
    db.sessoes = db.sessoes.map(s => ids.includes(s.id) ? {...s, ...row} : s); L.save(db);
    return db.sessoes.filter(s => ids.includes(s.id));
  }
  return ok(await sb.from('sessoes').update(row).in('id', ids).select());
};
/* várias sessões, cada uma com sua própria alteração (ex.: mudar o horário de toda a série) */
D.atualizarCada = async (lista) => {
  if (!LIVE) { for (const {id, patch} of lista) await D.atualizarSessoes([id], patch); return; }
  for (const {id, patch} of lista) ok(await sb.from('sessoes').update({...limpar(patch), atualizado_em:agora()}).eq('id', id));
};
D.excluirSessoes = async (ids) => {
  if (!LIVE) { const db = L.ensure(); db.sessoes = db.sessoes.filter(s => !ids.includes(s.id)); L.save(db); return; }
  ok(await sb.from('sessoes').delete().in('id', ids));
};
D.enviarLembrete = async (id) => {
  if (!LIVE) { const db = L.ensure(); const s = db.sessoes.find(x => x.id === id); if (s) s.lembrete_enviado_em = agora(); L.save(db); return {ok:true, demo:true}; }
  const {data, error} = await sb.functions.invoke('lembretes', {body:{sessao_id:id}});
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); if (j && j.erro) msg = j.erro; } catch(e){}
    throw new Error(msg);
  }
  return data;
};

/* bloqueios */
D.bloqueios = async ({de, ate} = {}) => {
  if (!LIVE) return L.ensure().bloqueios.filter(b => (!ate || new Date(b.inicio) < new Date(ate)) && (!de || new Date(b.fim) > new Date(de)))
    .sort((a,b) => new Date(a.inicio) - new Date(b.inicio));
  let q = sb.from('bloqueios').select('*').order('inicio');
  if (ate) q = q.lt('inicio', iso(ate));
  if (de) q = q.gt('fim', iso(de));
  return ok(await q.limit(1000));
};
D.inserirBloqueio = async (b) => {
  const row = {inicio:iso(b.inicio), fim:iso(b.fim), motivo:b.motivo || null};
  if (!LIVE) { const db = L.ensure(); const n = {id:U.uuid(), criado_em:agora(), ...row}; db.bloqueios.push(n); L.save(db); return n; }
  return ok(await sb.from('bloqueios').insert(row).select().single());
};
D.excluirBloqueio = async (id) => {
  if (!LIVE) { const db = L.ensure(); db.bloqueios = db.bloqueios.filter(b => b.id !== id); L.save(db); return; }
  ok(await sb.from('bloqueios').delete().eq('id', id));
};

/* exportação completa (portabilidade, LGPD) */
D.exportar = async () => {
  const [perfil, pacientes, sessoes, bloqueios] = await Promise.all([D.perfil(), D.pacientes(), D.sessoes(), D.bloqueios()]);
  return {exportado_em:agora(), perfil, pacientes, sessoes, bloqueios};
};

window.D = D;
})();
