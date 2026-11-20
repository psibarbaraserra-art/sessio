/* Sessio · agenda clínica · by Psique Ferramentas */
(function(){
const {$, $$, esc, ico} = U;
const CFG = window.SESSIO_CONFIG || {};
const LIVE = D.LIVE, sb = D.sb;
const IDLE_MS = 30 * 60 * 1000;
const app = $('#app');

/* ---------- estado ---------- */
let S = {view:'agenda', dia:U.ymd(new Date())};
let user = null, perfil = null, assin = null, ativa = true;
let pacientes = [], pmap = {};
let seq = 0;               // evita que uma tela antiga sobrescreva a nova
let onSeg = {};            // reações aos botões segmentados da tela atual

const STATUS = {agendada:'Agendada', realizada:'Realizada', falta:'Falta', desmarcada:'Desmarcada', cancelada:'Cancelada'};
const PAG = {pendente:'Pendente', pago:'Pago', isento:'Isento'};
const FORMAS = {pix:'Pix', dinheiro:'Dinheiro', cartao:'Cartão', transferencia:'Transferência', convenio:'Convênio', outro:'Outro'};
const REP = {nao:'Não repete', semanal:'Semanal', quinzenal:'Quinzenal', mensal:'A cada 4 semanas'};
const PASSO = {semanal:7, quinzenal:14, mensal:28};
const FUSOS = [['America/Noronha','Fernando de Noronha (UTC−2)'],['America/Sao_Paulo','Brasília (UTC−3)'],['America/Bahia','Bahia (UTC−3)'],
  ['America/Fortaleza','Fortaleza (UTC−3)'],['America/Recife','Recife (UTC−3)'],['America/Belem','Belém (UTC−3)'],
  ['America/Cuiaba','Cuiabá (UTC−4)'],['America/Campo_Grande','Campo Grande (UTC−4)'],['America/Porto_Velho','Porto Velho (UTC−4)'],
  ['America/Boa_Vista','Boa Vista (UTC−4)'],['America/Manaus','Manaus (UTC−4)'],['America/Rio_Branco','Rio Branco (UTC−5)']];

/* ---------- navegação ---------- */
function go(view, params, opt){
  S = {view, ...(params || {})};
  if (!(opt && opt.replace)) history.pushState(S, ''); else history.replaceState(S, '');
  render(); window.scrollTo(0, 0);
}
function voltar(padrao){ if (history.state && history.length > 1 && S.view !== 'agenda') history.back(); else go(padrao || 'agenda'); }
window.addEventListener('popstate', e => { if (e.state && e.state.view) { S = e.state; render(); } });

function paint(html, opt){
  opt = opt || {};
  app.innerHTML = (opt.bare ? '' : topbar()) + avisos() + html + (opt.foot === false ? '' : rodape());
}
function topbar(){
  const it = [['agenda','Agenda'],['pacientes','Pacientes'],['financeiro','Financeiro'],['ajustes','Ajustes']];
  const atual = {sessao:'agenda', bloqueio:'agenda', paciente:'pacientes', pacienteForm:'pacientes'}[S.view] || S.view;
  return `<header class="topbar no-print">
    <button class="brand" data-act="nav" data-v="agenda" aria-label="Sessio, ir para a agenda">
      <img src="icons/icon.svg" alt=""><span><span class="brand-name">Sessio</span><span class="brand-sub">by Psique Ferramentas</span></span>
    </button>
    <nav class="nav" aria-label="Seções">${it.map(([v,t]) => `<button data-act="nav" data-v="${v}" aria-current="${atual === v}">${t}</button>`).join('')}</nav>
  </header>`;
}
function avisos(){
  let h = '';
  if (!LIVE) h += `<div class="banner no-print"><span><strong>Modo demonstração.</strong> Os dados são fictícios e ficam só neste aparelho.</span></div>`;
  if (LIVE && user && !ativa) h += `<div class="banner bad no-print"><span>Sua assinatura não está ativa. Você pode consultar e exportar seus dados, mas não pode criar nem alterar.</span>${CFG.checkoutUrl ? `<a class="btn primary" href="${esc(CFG.checkoutUrl)}" target="_blank" rel="noopener">Assinar</a>` : ''}</div>`;
  return h;
}
function rodape(){
  return `<footer class="foot no-print">
    <span class="psi">${U.psi(22)} Psique Ferramentas</span>
    <span>Responsável técnica: ${esc(CFG.responsavel || '')}${CFG.crp ? ' · ' + esc(CFG.crp) : ''}</span>
    <span><a href="termos.html">Termos de Uso</a> · <a href="privacidade.html">Privacidade</a> · v${esc(CFG.versao || '')}</span>
  </footer>`;
}
const carregando = () => paint('<div class="loading">Carregando…</div>');
const falha = (e) => { console.error(e); U.toast(traduzErro(e)); };
function traduzErro(e){
  const m = String((e && e.message) || e || '');
  if (/row-level security|permission denied|violates row-level/i.test(m)) return ativa ? 'Sem permissão para esta ação.' : 'Assinatura inativa: não é possível alterar dados.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sem conexão. Confira a internet e tente de novo.';
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/already registered|already been registered/i.test(m)) return 'Este e-mail já tem cadastro. Use "Entrar".';
  if (/Password should be/i.test(m)) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  return m || 'Algo deu errado. Tente de novo.';
}

async function carregarPacientes(){ pacientes = await D.pacientes(); pmap = {}; pacientes.forEach(p => pmap[p.id] = p); }
const nomeP = id => (pmap[id] && pmap[id].nome) || 'Paciente removido';
const linkConfirmacao = s => (CFG.appUrl ? CFG.appUrl.replace(/\/+$/, '') + '/' : new URL('.', location.href).href) + 'confirmar.html?t=' + s.token;
const cobravel = s => D.COBRAVEL.includes(s.status) && s.pagamento !== 'isento';
const fimDe = s => U.addMin(s.inicio, s.duracao_min);

/* ---------- componentes ---------- */
const seg = (name, opts, val) => `<div class="seg" role="group" data-seg="${name}">${Object.entries(opts).map(([v,t]) =>
  `<button type="button" data-act="seg" data-v="${v}" aria-pressed="${String(val) === v}">${t}</button>`).join('')}</div>
  <input type="hidden" id="${name}" value="${esc(val)}">`;
const segVal = name => ($('#' + name) || {}).value;

function pillsSessao(s){
  const p = [];
  const passou = new Date(s.inicio) < new Date();
  if (s.status === 'agendada') {
    if (s.confirmacao === 'confirmada') p.push('<span class="pill ok">Confirmada</span>');
    else if (s.confirmacao === 'desmarcada') p.push('<span class="pill bad">Pediu para desmarcar</span>');
    else if (!passou) p.push('<span class="pill line">Aguardando</span>');
  } else {
    const cls = {realizada:'ok', falta:'warn', desmarcada:'line', cancelada:'line'}[s.status];
    p.push(`<span class="pill ${cls}">${STATUS[s.status]}</span>`);
  }
  if (s.modalidade === 'online') p.push('<span class="pill line">On-line</span>');
  if (s.encaixe) p.push('<span class="pill gold">Encaixe</span>');
  if (cobravel(s) && passou) p.push(s.pagamento === 'pago' ? '<span class="pill ok">Pago</span>' : '<span class="pill warn">A receber</span>');
  return p.join('');
}

function msgWhats(s){
  const p = pmap[s.paciente_id] || {};
  const online = s.modalidade === 'online';
  return `Olá, ${U.primeiroNome(p.nome)}! Passando para lembrar do seu horário ${U.fDia(s.inicio)}, às ${U.fHora(s.inicio)}${online ? ' (on-line)' : ''}.\n\nPor favor, confirme sua presença ou avise se precisar desmarcar por este link:\n${linkConfirmacao(s)}`;
}

/* =================================================================
   TELAS
   ================================================================= */
const V = {};

/* ---------- agenda ---------- */
V.agenda = async (t) => {
  if (!S.dia) S.dia = U.ymd(new Date());
  const dia = U.fromYmd(S.dia);
  const ini = U.startOfWeek(dia), fim = U.addDays(ini, 7);
  const [sess, blqs, desm] = await Promise.all([D.sessoes({de:ini, ate:fim}), D.bloqueios({de:ini, ate:fim}), D.desmarcadas(), carregarPacientes()]);
  if (t !== seq) return;
  const hoje = U.ymd(new Date());
  const visiveis = s => !['desmarcada','cancelada'].includes(s.status);

  const dias = [...Array(7)].map((_, i) => {
    const d = U.addDays(ini, i), k = U.ymd(d);
    const n = sess.filter(s => U.ymd(new Date(s.inicio)) === k && visiveis(s)).length;
    const b = blqs.some(x => new Date(x.inicio) < U.addDays(d, 1) && new Date(x.fim) > d);
    const dots = n > 4 ? `<i></i><b>${n}</b>` : '<i></i>'.repeat(n) + (b && n < 4 ? '<i class="b"></i>' : '');
    return `<button class="day ${k === hoje ? 'today' : ''} ${i > 4 && !n ? 'off' : ''}" data-act="dia" data-v="${k}" aria-pressed="${k === S.dia}" aria-label="${esc(U.fDia(d))}, ${n} sessões">
      <span class="wd">${U.fSemana(d)}</span><span class="dn">${d.getDate()}</span><span class="dots">${dots}</span></button>`;
  }).join('');

  const dIni = U.fromYmd(S.dia), dFim = U.addDays(dIni, 1);
  const doDia = sess.filter(s => U.ymd(new Date(s.inicio)) === S.dia);
  const blDia = blqs.filter(b => new Date(b.inicio) < dFim && new Date(b.fim) > dIni);
  const itens = [...doDia.map(s => ({t:new Date(s.inicio), s})), ...blDia.map(b => ({t:new Date(Math.max(new Date(b.inicio), dIni)), b}))].sort((a,b) => a.t - b.t);
  const ativos = doDia.filter(visiveis);
  const conf = ativos.filter(s => s.confirmacao === 'confirmada').length;

  const linhas = itens.map(it => {
    if (it.b) {
      const b = it.b, i0 = new Date(b.inicio), f0 = new Date(b.fim);
      const inteiro = i0 <= dIni && f0 >= dFim;
      return `<button class="slot block" data-act="bloqueio-abrir" data-id="${b.id}">
        <span class="time"><b>${inteiro ? 'Dia' : U.fHora(i0 < dIni ? dIni : i0)}</b><span>${inteiro ? 'todo' : (f0 > dFim ? '24:00' : U.fHora(f0))}</span></span>
        <span class="bar"></span><span class="grow"><span class="t">${esc(b.motivo || 'Horário bloqueado')}</span><span class="tags"><span class="pill line">${ico.lock.replace('<svg', '<svg width="11" height="11"')} Bloqueado</span></span></span></button>`;
    }
    const s = it.s;
    const cls = {realizada:'done', falta:'miss', desmarcada:'gone', cancelada:'gone'}[s.status] || '';
    return `<button class="slot ${cls}" data-act="sessao" data-id="${s.id}">
      <span class="time"><b>${U.fHora(s.inicio)}</b><span>${U.fHora(fimDe(s))}</span></span>
      <span class="bar"></span>
      <span class="grow"><span class="t">${esc(nomeP(s.paciente_id))}</span><span class="tags">${pillsSessao(s)}</span></span></button>`;
  }).join('');

  const avisoDesm = desm.slice(0, 3).map(s => `<div class="banner bad"><span><strong>${esc(U.primeiroNome(nomeP(s.paciente_id)))}</strong> pediu para desmarcar ${esc(U.fDiaCurto(s.inicio))}, ${U.fHora(s.inicio)}.</span>
    <button class="btn ghost" data-act="sessao" data-id="${s.id}">Ver</button></div>`).join('');

  const semPac = !pacientes.length;
  paint(`
    ${avisoDesm}
    ${semPac ? `<div class="card stack center"><p class="eyebrow">Primeiro passo</p><h2>Cadastre seus <em>pacientes</em></h2>
      <p class="muted small">Depois é só montar a agenda, com recorrência, encaixes e bloqueios.</p>
      <button class="btn primary" data-act="paciente-novo">${ico.plus} Cadastrar paciente</button></div>` : ''}
    <section class="stack">
      <div class="cal-head">
        <button class="iconbtn" data-act="semana" data-v="-1" aria-label="Semana anterior">${ico.prev}</button>
        <div class="center stack tight" style="gap:2px"><h2>${esc(U.cap(U.fMes(dIni)))}</h2>
          ${S.dia !== hoje ? `<button class="linkbtn small" data-act="dia" data-v="${hoje}">Voltar para hoje</button>` : '<span class="eyebrow">Hoje</span>'}</div>
        <button class="iconbtn" data-act="semana" data-v="1" aria-label="Próxima semana">${ico.next}</button>
      </div>
      <div class="week">${dias}</div>
    </section>
    <section class="stack">
      <div class="dayhead"><h3>${esc(U.cap(U.fDia(dIni)))}</h3>
        <span class="muted small">${ativos.length ? `${ativos.length} ${ativos.length === 1 ? 'sessão' : 'sessões'}${conf ? ` · ${conf} confirmada${conf > 1 ? 's' : ''}` : ''}` : 'Dia livre'}</span></div>
      ${itens.length ? `<div class="list">${linhas}</div>` : `<div class="list"><div class="empty">Nenhuma sessão neste dia.</div></div>`}
      <div class="btn-row no-print">
        <button class="btn primary" data-act="sessao-nova" ${semPac ? 'disabled' : ''}>${ico.plus} Nova sessão</button>
        <button class="btn ghost" data-act="bloqueio-novo">${ico.lock} Bloquear horário</button>
      </div>
    </section>`);
};

/* ---------- sessão (nova ou existente) ---------- */
V.sessao = async (t) => {
  await carregarPacientes();
  const s = S.id ? await D.sessao(S.id) : null;
  if (t !== seq) return;
  if (S.id && !s) { paint('<div class="card empty">Sessão não encontrada.</div>'); return; }
  const novo = !s;
  const ref = s || {};
  const pid = ref.paciente_id || S.paciente_id || '';
  const pac = pmap[pid];
  const ini = s ? new Date(s.inicio) : U.at(S.diaNovo || S.dia || U.ymd(new Date()), S.hora || proximaHora());
  const dur = ref.duracao_min || (perfil && perfil.duracao_padrao) || 50;
  const valor = s ? s.valor : (pac && pac.valor_sessao != null ? pac.valor_sessao : (perfil && perfil.valor_padrao) || 0);
  const passou = s && new Date(s.inicio) < new Date();
  const ativos = pacientes.filter(p => p.ativo || p.id === pid);

  let topo = '';
  if (s) {
    const p = pmap[s.paciente_id] || {};
    const temFone = !!U.digits(p.telefone), temMail = /@/.test(p.email || '');
    const confTxt = {pendente:'Aguardando resposta do paciente', confirmada:'Paciente confirmou presença', desmarcada:'Paciente pediu para desmarcar'}[s.confirmacao];
    topo = `
      <div class="card stack">
        <div class="between"><div class="stack tight" style="gap:2px">
          <span class="eyebrow">${s.serie_id ? 'Sessão recorrente' : 'Sessão'}</span>
          <h2>${esc(nomeP(s.paciente_id))}</h2>
          <span class="muted">${esc(U.cap(U.fDia(s.inicio)))} · ${U.fHora(s.inicio)}–${U.fHora(fimDe(s))}</span></div>
          <button class="btn soft sm" data-act="paciente" data-id="${s.paciente_id}">${ico.user} Ficha</button></div>
        <div class="tags" style="display:flex;gap:6px;flex-wrap:wrap">${pillsSessao(s)}</div>
        ${s.status === 'agendada' && !passou ? `
        <div class="formsec">
          <p class="small"><strong>Lembrete e confirmação.</strong> <span class="muted">${esc(confTxt)}${s.confirmacao_em && s.confirmacao !== 'pendente' ? ' em ' + U.fDiaCurto(s.confirmacao_em) + ', ' + U.fHora(s.confirmacao_em) : ''}.</span></p>
          <div class="btn-row">
            <a class="btn soft" ${temFone ? `href="${esc(U.waLink(p.telefone, msgWhats(s)))}" target="_blank" rel="noopener"` : 'aria-disabled="true" style="opacity:.5;pointer-events:none"'}>${ico.whats} WhatsApp</a>
            <button class="btn soft" data-act="lembrete-email" data-id="${s.id}" ${temMail ? '' : 'disabled'}>${ico.mail} E-mail</button>
            <button class="btn ghost" data-act="copiar-link" data-id="${s.id}">${ico.link} Copiar link</button>
          </div>
          <p class="muted tiny">${!temFone && !temMail ? 'Cadastre telefone ou e-mail na ficha do paciente para enviar lembretes. ' : ''}${s.lembrete_enviado_em ? 'Lembrete por e-mail enviado em ' + U.fDiaCurto(s.lembrete_enviado_em) + ', ' + U.fHora(s.lembrete_enviado_em) + '.' : (perfil && perfil.lembrete_auto && temMail && p.lembretes ? `O e-mail automático sai ${perfil.lembrete_horas} h antes.` : '')}</p>
        </div>` : ''}
        ${passou && s.status === 'agendada' ? `
        <div class="formsec"><p class="small"><strong>Como foi esta sessão?</strong></p>
          <div class="btn-row"><button class="btn soft" data-act="rapido" data-v="realizada">${ico.check} Realizada</button>
          <button class="btn ghost" data-act="rapido" data-v="falta">${ico.x} Falta</button>
          ${s.pagamento === 'pendente' ? `<button class="btn gold" data-act="rapido" data-v="pago">${ico.money} Pago</button>` : ''}</div></div>` : ''}
      </div>`;
  }

  paint(`
    <button class="back no-print" data-act="voltar">${ico.back.replace('<svg', '<svg width="16" height="16"')} Voltar</button>
    ${novo ? `<div class="section-head stack tight"><span class="eyebrow">Agenda</span><h2>Nova <em>sessão</em></h2></div>` : topo}
    <form class="card stack" id="fs" novalidate>
      <div class="formsec">
        <label class="f">Paciente
          <select class="input" id="s-pac" required>
            <option value="">Escolha…</option>
            ${ativos.map(p => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}
            <option value="__novo">＋ Novo paciente…</option>
          </select></label>
        <div id="novo-pac" class="fields r" hidden>
          <label class="f full">Nome completo<input class="input" id="np-nome" autocomplete="off"></label>
          <label class="f">Telefone (WhatsApp)<input class="input" id="np-fone" inputmode="tel" placeholder="(92) 99999-9999"></label>
          <label class="f">E-mail<input class="input" id="np-mail" type="email" inputmode="email"></label>
        </div>
        <div class="fields">
          <label class="f">Data<input class="input" type="date" id="s-data" value="${U.ymd(ini)}" required></label>
          <label class="f">Início<input class="input" type="time" id="s-hora" value="${U.hm(ini)}" step="300" required></label>
          <label class="f">Duração (min)<input class="input num" type="number" id="s-dur" value="${dur}" min="5" max="600" step="5" inputmode="numeric"></label>
          <label class="f">Valor (R$)<input class="input num" id="s-valor" value="${U.valorInput(valor)}" inputmode="decimal" placeholder="0,00"></label>
        </div>
        <fieldset><legend>Modalidade</legend>${seg('s-mod', {presencial:'Presencial', online:'On-line'}, ref.modalidade || 'presencial')}</fieldset>
        <label class="f" id="w-link" ${(ref.modalidade || 'presencial') === 'online' ? '' : 'hidden'}>Link da chamada <span class="hint">vai no lembrete do paciente</span>
          <input class="input" id="s-link" type="url" inputmode="url" value="${esc(ref.link || '')}" placeholder="https://meet.google.com/…"></label>
      </div>
      ${novo ? `
      <div class="formsec">
        <fieldset><legend>Repetir</legend>${seg('s-rep', REP, 'nao')}</fieldset>
        <label class="f" id="w-qtd" hidden>Quantas sessões criar <span class="hint">você pode criar mais depois</span>
          <input class="input num" type="number" id="s-qtd" value="12" min="2" max="52" inputmode="numeric"></label>
      </div>` : `
      <div class="formsec">
        <fieldset><legend>Situação</legend>${seg('s-status', STATUS, s.status)}</fieldset>
        <fieldset><legend>Confirmação do paciente</legend>${seg('s-conf', {pendente:'Aguardando', confirmada:'Confirmou', desmarcada:'Desmarcou'}, s.confirmacao)}</fieldset>
      </div>`}
      <div class="formsec">
        <fieldset><legend>Pagamento</legend>${seg('s-pag', PAG, ref.pagamento || 'pendente')}</fieldset>
        <div class="fields" id="w-pago" ${ref.pagamento === 'pago' ? '' : 'hidden'}>
          <label class="f">Forma<select class="input" id="s-forma"><option value="">—</option>${Object.entries(FORMAS).map(([k,v]) => `<option value="${k}" ${ref.forma_pagamento === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="f">Pago em<input class="input" type="date" id="s-pagoem" value="${esc(ref.pago_em || U.ymd(new Date()))}"></label>
        </div>
      </div>
      <div class="formsec">
        <label class="f">Observação administrativa <span class="hint">Ex.: "paga por mês". Não registre conteúdo clínico aqui.</span>
          <textarea class="input" id="s-obs" maxlength="500" rows="2">${esc(ref.observacao || '')}</textarea></label>
        ${s && s.serie_id ? `<label class="check"><input type="checkbox" id="s-serie"> <span>Aplicar mudanças de data, horário, duração, modalidade e valor às <strong>próximas sessões desta série</strong></span></label>` : ''}
      </div>
      <div class="btn-row"><button class="btn primary" type="submit">${novo ? 'Agendar' : 'Salvar alterações'}</button>
        <button class="btn ghost" type="button" data-act="voltar">Cancelar</button></div>
    </form>
    ${s ? `<div class="btn-row no-print">
      <button class="btn danger" data-act="sessao-excluir" data-v="uma">Excluir sessão</button>
      ${s.serie_id ? '<button class="btn danger" data-act="sessao-excluir" data-v="proximas">Excluir esta e as próximas</button>' : ''}</div>` : ''}
  `);

  onSeg = {
    's-mod': v => { $('#w-link').hidden = v !== 'online'; },
    's-rep': v => { $('#w-qtd').hidden = v === 'nao'; },
    's-pag': v => { $('#w-pago').hidden = v !== 'pago'; },
  };
  $('#s-pac').onchange = e => {
    const v = e.target.value; $('#novo-pac').hidden = v !== '__novo';
    if (v === '__novo') { $('#np-nome').focus(); return; }
    const p = pmap[v]; if (novo && p) $('#s-valor').value = U.valorInput(p.valor_sessao != null ? p.valor_sessao : (perfil && perfil.valor_padrao) || 0);
  };
  $('#fs').onsubmit = e => { e.preventDefault(); salvarSessao(s).catch(falha); };
};

function proximaHora(){ const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(Math.min(Math.max(d.getHours() + 1, 8), 20)); return U.hm(d); }

async function conflitos(lista, ignorar){
  if (!lista.length) return [];
  const de = U.addDays(lista[0].ini, -1), ate = U.addDays(lista[lista.length - 1].fim, 1);
  const [ss, bb] = await Promise.all([D.sessoes({de, ate}), D.bloqueios({de, ate})]);
  const out = [];
  for (const o of lista) {
    const s1 = ss.find(x => !ignorar.includes(x.id) && !['desmarcada','cancelada'].includes(x.status) && new Date(x.inicio) < o.fim && fimDe(x) > o.ini);
    const b1 = bb.find(x => new Date(x.inicio) < o.fim && new Date(x.fim) > o.ini);
    if (s1 || b1) out.push({o, motivo: s1 ? `${U.fDiaCurto(o.ini)} ${U.fHora(o.ini)}: já há sessão com ${U.primeiroNome(nomeP(s1.paciente_id))}` : `${U.fDiaCurto(o.ini)} ${U.fHora(o.ini)}: horário bloqueado`});
  }
  return out;
}

async function salvarSessao(s){
  let pid = $('#s-pac').value;
  const data = $('#s-data').value, hora = $('#s-hora').value;
  const dur = Math.round(Number($('#s-dur').value));
  const valor = U.parseValor($('#s-valor').value);
  if (!pid) return U.toast('Escolha o paciente.');
  if (!data || !hora) return U.toast('Informe a data e o horário.');
  if (!(dur >= 5 && dur <= 600)) return U.toast('Duração entre 5 e 600 minutos.');
  if (valor == null && $('#s-valor').value.trim()) return U.toast('Valor inválido. Ex.: 180,00');
  const mod = segVal('s-mod');
  const pag = segVal('s-pag');
  const base = {
    duracao_min:dur, modalidade:mod, link: mod === 'online' ? ($('#s-link').value.trim() || null) : null,
    valor: valor || 0, pagamento:pag,
    forma_pagamento: pag === 'pago' ? ($('#s-forma').value || null) : null,
    pago_em: pag === 'pago' ? ($('#s-pagoem').value || U.ymd(new Date())) : null,
    observacao: $('#s-obs').value.trim() || null,
  };
  const ini = U.at(data, hora);

  if (pid === '__novo') {
    const nome = $('#np-nome').value.trim();
    if (!nome) { $('#np-nome').focus(); return U.toast('Informe o nome do novo paciente.'); }
    const p = await D.salvarPaciente({nome, telefone:$('#np-fone').value.trim(), email:$('#np-mail').value.trim(), valor_sessao:valor, lembretes:true});
    pid = p.id; pmap[p.id] = p; pacientes.push(p);
  }

  if (!s) {
    const rep = segVal('s-rep');
    const n = rep === 'nao' ? 1 : Math.min(52, Math.max(2, Math.round(Number($('#s-qtd').value) || 2)));
    const lista = [...Array(n)].map((_, i) => { const d = U.addDays(ini, i * (PASSO[rep] || 0)); return {ini:d, fim:U.addMin(d, dur)}; });
    const cf = await conflitos(lista, []);
    if (cf.length && !confirm(`Há ${cf.length === 1 ? 'um conflito' : cf.length + ' conflitos'} de horário:\n\n${cf.slice(0, 6).map(c => '• ' + c.motivo).join('\n')}${cf.length > 6 ? '\n…' : ''}\n\nAgendar mesmo assim? ${cf.length === 1 && n === 1 ? 'A sessão' : 'Essas sessões'} ficará marcada como encaixe.`)) return;
    const serie = n > 1 ? U.uuid() : null;
    const rows = lista.map(o => ({...base, paciente_id:pid, inicio:o.ini.toISOString(), serie_id:serie, recorrencia: n > 1 ? rep : null,
      encaixe: cf.some(c => c.o === o), status:'agendada', confirmacao:'pendente',
      pagamento: pag, pago_em: base.pago_em, forma_pagamento: base.forma_pagamento}));
    await D.inserirSessoes(rows);
    U.toast(n > 1 ? `${n} sessões agendadas` : 'Sessão agendada');
    S.dia = data;
    go('agenda', {dia:data}, {replace:true});
    return;
  }

  const patch = {...base, paciente_id:pid, inicio:ini.toISOString(), status:segVal('s-status'), confirmacao:segVal('s-conf')};
  const mudouHora = +new Date(s.inicio) !== +ini;
  if (patch.confirmacao !== s.confirmacao) patch.confirmacao_em = patch.confirmacao === 'pendente' ? null : new Date().toISOString();
  if (mudouHora) {
    const cf = await conflitos([{ini, fim:U.addMin(ini, dur)}], [s.id]);
    if (cf.length && !confirm(`${cf[0].motivo}.\n\nSalvar mesmo assim como encaixe?`)) return;
    patch.encaixe = !!cf.length;
    if (s.status === 'agendada') { patch.confirmacao = 'pendente'; patch.confirmacao_em = null; patch.lembrete_enviado_em = null; }
  }
  await D.atualizarSessoes([s.id], patch);

  if ($('#s-serie') && $('#s-serie').checked) {
    const desloc = ini - new Date(s.inicio);
    const prox = (await D.sessoes({serie_id:s.serie_id, de:U.addMin(s.inicio, 1)})).filter(x => x.status === 'agendada' && x.id !== s.id);
    await D.atualizarCada(prox.map(x => {
      const p = {duracao_min:dur, modalidade:mod, link:base.link, valor:base.valor};
      if (desloc) { p.inicio = new Date(new Date(x.inicio).getTime() + desloc).toISOString(); p.confirmacao = 'pendente'; p.confirmacao_em = null; p.lembrete_enviado_em = null; }
      return {id:x.id, patch:p};
    }));
    U.toast(`Sessão e mais ${prox.length} da série atualizadas`);
  } else U.toast('Alterações salvas');
  voltar();
}

/* ---------- bloqueio de horário ---------- */
V.bloqueio = async (t) => {
  const dia = S.dia || U.ymd(new Date());
  paint(`
    <button class="back" data-act="voltar">${ico.back.replace('<svg', '<svg width="16" height="16"')} Voltar</button>
    <div class="section-head stack tight"><span class="eyebrow">Agenda</span><h2>Bloquear <em>horário</em></h2>
      <p class="muted small">Para folgas, férias, supervisão ou compromissos. O horário aparece como indisponível na agenda.</p></div>
    <form class="card stack" id="fb" novalidate>
      <label class="check"><input type="checkbox" id="b-todo"> <span>Dia inteiro (ou vários dias, como férias)</span></label>
      <div class="fields">
        <label class="f">De<input class="input" type="date" id="b-d1" value="${dia}"></label>
        <label class="f" id="w-h1">Às<input class="input" type="time" id="b-h1" value="12:00" step="300"></label>
        <label class="f">Até<input class="input" type="date" id="b-d2" value="${dia}"></label>
        <label class="f" id="w-h2">Às<input class="input" type="time" id="b-h2" value="13:00" step="300"></label>
        <label class="f full">Motivo <span class="hint">opcional, só você vê</span><input class="input" id="b-motivo" maxlength="120" placeholder="Ex.: Supervisão"></label>
      </div>
      <div class="btn-row"><button class="btn primary" type="submit">Bloquear</button><button class="btn ghost" type="button" data-act="voltar">Cancelar</button></div>
    </form>`);
  $('#b-todo').onchange = e => { $('#w-h1').hidden = $('#w-h2').hidden = e.target.checked; };
  $('#b-d1').onchange = e => { if ($('#b-d2').value < e.target.value) $('#b-d2').value = e.target.value; };
  $('#fb').onsubmit = async e => {
    e.preventDefault();
    const todo = $('#b-todo').checked;
    const i = todo ? U.at($('#b-d1').value, '00:00') : U.at($('#b-d1').value, $('#b-h1').value);
    const f = todo ? U.addDays(U.at($('#b-d2').value, '00:00'), 1) : U.at($('#b-d2').value, $('#b-h2').value);
    if (!(f > i)) return U.toast('O fim precisa ser depois do início.');
    try {
      const ss = (await D.sessoes({de:U.addDays(i, -1), ate:f})).filter(x => x.status === 'agendada' && new Date(x.inicio) < f && fimDe(x) > i);
      if (ss.length && !confirm(`Há ${ss.length} ${ss.length === 1 ? 'sessão agendada' : 'sessões agendadas'} nesse período. Elas continuam na agenda; desmarque com os pacientes se for o caso.\n\nBloquear mesmo assim?`)) return;
      await D.inserirBloqueio({inicio:i, fim:f, motivo:$('#b-motivo').value.trim()});
      U.toast('Horário bloqueado'); go('agenda', {dia:U.ymd(i)}, {replace:true});
    } catch(err){ falha(err); }
  };
};

/* ---------- pacientes ---------- */
V.pacientes = async (t) => {
  const agora = new Date();
  const [_, prox, pend] = await Promise.all([carregarPacientes(), D.sessoes({de:agora, ate:U.addDays(agora, 120)}), D.pendencias()]);
  if (t !== seq) return;
  const proxima = {}, devido = {};
  prox.filter(s => s.status === 'agendada').forEach(s => { if (!proxima[s.paciente_id]) proxima[s.paciente_id] = s; });
  pend.forEach(s => devido[s.paciente_id] = (devido[s.paciente_id] || 0) + Number(s.valor));
  const q = S.q || '', arq = !!S.arq;
  const nArq = pacientes.filter(p => !p.ativo).length;

  const lista = () => {
    const f = pacientes.filter(p => (arq ? !p.ativo : p.ativo) && (!q || U.norm(p.nome).includes(U.norm(q)) || U.digits(p.telefone).includes(U.digits(q) || '#')));
    if (!f.length) return `<div class="empty">${pacientes.length ? 'Nenhum paciente encontrado.' : 'Nenhum paciente cadastrado ainda.'}</div>`;
    return f.map(p => {
      const pr = proxima[p.id];
      return `<button class="row" data-act="paciente" data-id="${p.id}"><span class="avatar">${esc(U.iniciais(p.nome))}</span>
        <span class="grow"><span class="t" style="display:block">${esc(p.nome)}</span>
        <span class="s" style="display:block">${pr ? 'Próxima: ' + esc(U.fDiaCurto(pr.inicio)) + ', ' + U.fHora(pr.inicio) : 'Sem sessão agendada'}${p.telefone ? ' · ' + esc(U.fFone(p.telefone)) : ''}</span></span>
        ${devido[p.id] ? `<span class="end"><span class="pill warn">${esc(U.brl(devido[p.id]))}</span></span>` : ''}</button>`;
    }).join('');
  };

  paint(`
    <div class="between"><div class="stack tight" style="gap:2px"><span class="eyebrow">${pacientes.filter(p => p.ativo).length} ativos</span><h2>Pacientes</h2></div>
      <button class="btn primary" data-act="paciente-novo">${ico.plus} Novo</button></div>
    <div class="search">${ico.search}<input class="input" id="q" type="search" placeholder="Buscar por nome ou telefone" value="${esc(q)}" autocomplete="off"></div>
    ${nArq ? seg('arq', {'0':'Ativos', '1':`Arquivados (${nArq})`}, arq ? '1' : '0') : ''}
    <div class="list" id="lp">${lista()}</div>`);
  $('#q').oninput = e => { S.q = e.target.value; history.replaceState(S, ''); $('#lp').innerHTML = lista(); };
  onSeg = {arq: v => { S.arq = v === '1'; history.replaceState(S, ''); $('#lp').innerHTML = lista(); }};
};

V.paciente = async (t) => {
  await carregarPacientes();
  const p = pmap[S.id];
  if (t !== seq) return;
  if (!p) { paint('<div class="card empty">Paciente não encontrado.</div>'); return; }
  const todas = await D.sessoes({paciente_id:p.id});
  if (t !== seq) return;
  const agora = new Date();
  const futuras = todas.filter(s => new Date(s.inicio) >= agora && s.status === 'agendada');
  const passadas = todas.filter(s => new Date(s.inicio) < agora).reverse();
  const pend = passadas.filter(s => cobravel(s) && s.pagamento === 'pendente');
  const totalPend = pend.reduce((a, s) => a + Number(s.valor), 0);
  const realizadas = passadas.filter(s => ['realizada','agendada'].includes(s.status)).length;
  const faltas = passadas.filter(s => s.status === 'falta').length;
  const linha = s => `<button class="row" data-act="sessao" data-id="${s.id}"><span class="grow"><span class="t" style="display:block">${esc(U.cap(U.fDiaCurto(s.inicio)))}, ${U.fHora(s.inicio)}</span>
    <span class="s" style="display:block">${esc(U.brl(s.valor))}${s.modalidade === 'online' ? ' · on-line' : ''}</span></span><span class="end" style="flex-direction:row;flex-wrap:wrap;justify-content:flex-end">${pillsSessao(s)}</span></button>`;
  const fone = U.digits(p.telefone);

  paint(`
    <button class="back" data-act="voltar">${ico.back.replace('<svg', '<svg width="16" height="16"')} Voltar</button>
    <div class="card stack">
      <div style="display:flex;gap:14px;align-items:center"><span class="avatar" style="width:52px;height:52px;font-size:1.5rem;border-radius:16px">${esc(U.iniciais(p.nome))}</span>
        <div class="stack tight" style="gap:2px;min-width:0"><h2 style="overflow-wrap:anywhere">${esc(p.nome)}</h2>
        <span class="muted small">${p.ativo ? 'Ativo' : 'Arquivado'} · ${esc(U.brl(p.valor_sessao != null ? p.valor_sessao : (perfil && perfil.valor_padrao) || 0))} por sessão</span></div></div>
      <div class="btn-row">
        ${fone ? `<a class="btn soft sm" href="${esc(U.waLink(p.telefone, ''))}" target="_blank" rel="noopener">${ico.whats} WhatsApp</a><a class="btn ghost sm" href="tel:+${U.waNumber(p.telefone)}">${ico.phone} Ligar</a>` : ''}
        ${p.email ? `<a class="btn ghost sm" href="mailto:${esc(p.email)}">${ico.mail} E-mail</a>` : ''}
      </div>
      <dl class="kv">
        <dt>Telefone</dt><dd>${esc(U.fFone(p.telefone) || '—')}</dd>
        <dt>E-mail</dt><dd>${esc(p.email || '—')}</dd>
        <dt>Lembretes</dt><dd>${p.lembretes ? 'Recebe por e-mail' : 'Não recebe por e-mail'}</dd>
        ${p.observacao ? `<dt>Obs.</dt><dd style="font-weight:500">${esc(p.observacao)}</dd>` : ''}
      </dl>
      <div class="btn-row"><button class="btn primary" data-act="sessao-nova" data-pac="${p.id}" ${p.ativo ? '' : 'disabled'}>${ico.plus} Agendar sessão</button>
        <button class="btn soft" data-act="paciente-editar" data-id="${p.id}">Editar ficha</button></div>
    </div>
    <div class="stats">
      <div class="stat"><span class="k">Sessões</span><span class="v">${realizadas}</span><span class="d">já passaram</span></div>
      <div class="stat"><span class="k">Faltas</span><span class="v">${faltas}</span><span class="d">registradas</span></div>
      <div class="stat ${totalPend ? 'warn' : ''}"><span class="k">A receber</span><span class="v">${esc(U.brl(totalPend))}</span><span class="d">${pend.length} ${pend.length === 1 ? 'sessão' : 'sessões'}</span></div>
      <div class="stat"><span class="k">Agendadas</span><span class="v">${futuras.length}</span><span class="d">daqui em diante</span></div>
    </div>
    ${pend.length ? `<section class="stack"><div class="between"><h3>Pagamentos pendentes</h3><button class="btn gold sm" data-act="pagar-todas" data-id="${p.id}">${ico.check} Marcar todas como pagas</button></div>
      <div class="list">${pend.map(linha).join('')}</div></section>` : ''}
    <section class="stack"><h3>Próximas sessões</h3>
      <div class="list">${futuras.length ? futuras.slice(0, 8).map(linha).join('') + (futuras.length > 8 ? `<div class="empty">e mais ${futuras.length - 8}</div>` : '') : '<div class="empty">Nenhuma sessão agendada.</div>'}</div></section>
    <section class="stack"><h3>Histórico</h3>
      <div class="list">${passadas.length ? passadas.slice(0, 12).map(linha).join('') : '<div class="empty">Ainda sem sessões.</div>'}</div></section>
    <div class="btn-row no-print">
      <button class="btn ghost" data-act="paciente-arquivar" data-id="${p.id}">${p.ativo ? 'Arquivar paciente' : 'Reativar paciente'}</button>
      <button class="btn danger" data-act="paciente-excluir" data-id="${p.id}">Excluir paciente</button></div>
    <p class="muted tiny center">Arquivar esconde o paciente da lista e mantém o histórico. Excluir apaga o paciente e todas as sessões dele, sem volta.</p>`);
};

V.pacienteForm = async (t) => {
  await carregarPacientes();
  if (t !== seq) return;
  const p = S.id ? pmap[S.id] : {lembretes:true, ativo:true};
  if (S.id && !p) { paint('<div class="card empty">Paciente não encontrado.</div>'); return; }
  paint(`
    <button class="back" data-act="voltar">${ico.back.replace('<svg', '<svg width="16" height="16"')} Voltar</button>
    <div class="section-head stack tight"><span class="eyebrow">Pacientes</span><h2>${S.id ? 'Editar <em>ficha</em>' : 'Novo <em>paciente</em>'}</h2></div>
    <form class="card stack" id="fp" novalidate>
      <div class="fields r">
        <label class="f full">Nome completo<input class="input" id="p-nome" value="${esc(p.nome || '')}" required maxlength="160" autocomplete="off"></label>
        <label class="f">Telefone (WhatsApp)<input class="input" id="p-fone" value="${esc(U.fFone(p.telefone || ''))}" inputmode="tel" placeholder="(92) 99999-9999"></label>
        <label class="f">E-mail<input class="input" id="p-mail" type="email" inputmode="email" value="${esc(p.email || '')}"></label>
        <label class="f">Valor por sessão (R$)<input class="input num" id="p-valor" inputmode="decimal" value="${esc(U.valorInput(p.valor_sessao))}" placeholder="${esc(U.valorInput((perfil && perfil.valor_padrao) || 0))} (padrão)"></label>
      </div>
      <label class="check"><input type="checkbox" id="p-lemb" ${p.lembretes ? 'checked' : ''}> <span>Enviar lembretes automáticos por e-mail<br><span class="muted small">Combine isso com o paciente. Ele confirma ou desmarca por um link, sem precisar de cadastro.</span></span></label>
      <label class="f">Observação administrativa <span class="hint">Ex.: responsável financeiro, forma de pagamento combinada. Não registre conteúdo clínico aqui.</span>
        <textarea class="input" id="p-obs" maxlength="1000" rows="3">${esc(p.observacao || '')}</textarea></label>
      <div class="btn-row"><button class="btn primary" type="submit">Salvar</button><button class="btn ghost" type="button" data-act="voltar">Cancelar</button></div>
    </form>`);
  $('#p-nome').focus();
  $('#fp').onsubmit = async e => {
    e.preventDefault();
    const nome = $('#p-nome').value.trim().replace(/\s+/g, ' ');
    if (!nome) return U.toast('Informe o nome.');
    const mail = $('#p-mail').value.trim();
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return U.toast('E-mail inválido.');
    const vs = $('#p-valor').value.trim();
    const valor = vs ? U.parseValor(vs) : null;
    if (vs && valor == null) return U.toast('Valor inválido. Ex.: 180,00');
    try {
      const r = await D.salvarPaciente({id:S.id, nome, telefone:U.digits($('#p-fone').value) || null, email:mail || null, valor_sessao:valor,
        lembretes:$('#p-lemb').checked, observacao:$('#p-obs').value.trim(), ativo:p.ativo !== false});
      U.toast('Ficha salva');
      if (S.id) voltar(); else go('paciente', {id:r.id}, {replace:true});
    } catch(err){ falha(err); }
  };
};

/* ---------- financeiro ---------- */
V.financeiro = async (t) => {
  const mes = U.fromYmd(S.mes || U.ymd(U.startOfMonth(new Date())));
  const fim = U.addMonths(mes, 1);
  const [ss, pend] = await Promise.all([D.sessoes({de:mes, ate:fim}), D.pendencias(), carregarPacientes()]);
  if (t !== seq) return;
  const agora = new Date();
  const cob = ss.filter(cobravel);
  const soma = l => l.reduce((a, s) => a + Number(s.valor || 0), 0);
  const recebidoL = ss.filter(s => s.pagamento === 'pago');
  const receberL = cob.filter(s => s.pagamento === 'pendente' && new Date(s.inicio) < agora);
  const futuroL = cob.filter(s => s.pagamento === 'pendente' && new Date(s.inicio) >= agora);
  const previsto = soma(cob), recebido = soma(recebidoL), receber = soma(receberL), futuro = soma(futuroL);
  const faltas = ss.filter(s => s.status === 'falta').length;
  const desm = ss.filter(s => ['desmarcada','cancelada'].includes(s.status)).length;
  const tot = Math.max(1, recebido + receber + futuro);
  const formas = {};
  recebidoL.forEach(s => { const k = s.forma_pagamento || 'nao'; formas[k] = (formas[k] || 0) + Number(s.valor); });

  const porPac = {};
  pend.forEach(s => { const o = porPac[s.paciente_id] || (porPac[s.paciente_id] = {n:0, v:0, desde:s.inicio}); o.n++; o.v += Number(s.valor); });
  const pendRows = Object.entries(porPac).sort((a, b) => b[1].v - a[1].v);
  const ehMesAtual = U.ymd(mes) === U.ymd(U.startOfMonth(agora));

  paint(`
    <div class="cal-head">
      <button class="iconbtn" data-act="mes" data-v="-1" aria-label="Mês anterior">${ico.prev}</button>
      <div class="center stack tight" style="gap:2px"><span class="eyebrow">Financeiro</span><h2>${esc(U.cap(U.fMes(mes)))}</h2></div>
      <button class="iconbtn" data-act="mes" data-v="1" aria-label="Próximo mês">${ico.next}</button>
    </div>
    ${!ehMesAtual ? `<button class="linkbtn small" style="align-self:center" data-act="mes" data-v="0">Voltar para o mês atual</button>` : ''}
    <div class="stats">
      <div class="stat hl"><span class="k">Previsto no mês</span><span class="v">${esc(U.brl(previsto))}</span><span class="d">${cob.length} ${cob.length === 1 ? 'sessão cobrável' : 'sessões cobráveis'}</span></div>
      <div class="stat"><span class="k">Recebido</span><span class="v" style="color:var(--t0)">${esc(U.brl(recebido))}</span><span class="d">${recebidoL.length} pagas</span></div>
      <div class="stat ${receber ? 'warn' : ''}"><span class="k">A receber</span><span class="v">${esc(U.brl(receber))}</span><span class="d">sessões que já passaram</span></div>
      <div class="stat"><span class="k">Por vir</span><span class="v">${esc(U.brl(futuro))}</span><span class="d">sessões agendadas</span></div>
    </div>
    <div class="card stack tight">
      <div class="meter" role="img" aria-label="Recebido ${Math.round(recebido/tot*100)}%, a receber ${Math.round(receber/tot*100)}%, por vir ${Math.round(futuro/tot*100)}%">
        <i style="width:${recebido/tot*100}%;background:var(--t0)"></i><i style="width:${receber/tot*100}%;background:var(--t2)"></i><i style="width:${futuro/tot*100}%;background:var(--line)"></i></div>
      <div class="between small muted"><span><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--t0)"></span> Recebido · <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--t2)"></span> A receber · <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--line)"></span> Por vir</span>
        <span>${faltas} falta${faltas === 1 ? '' : 's'} · ${desm} desmarcada${desm === 1 ? '' : 's'}</span></div>
      ${Object.keys(formas).length ? `<p class="small muted">Recebido por forma: ${Object.entries(formas).map(([k, v]) => `${k === 'nao' ? 'Não informada' : FORMAS[k]} ${esc(U.brl(v))}`).join(' · ')}</p>` : ''}
    </div>
    <section class="stack"><div class="between"><h3>Pendências de todos os meses</h3><span class="muted small">${esc(U.brl(pend.reduce((a, s) => a + Number(s.valor), 0)))}</span></div>
      <div class="list">${pendRows.length ? pendRows.map(([pid, o]) => `<button class="row" data-act="paciente" data-id="${pid}"><span class="avatar">${esc(U.iniciais(nomeP(pid)))}</span>
        <span class="grow"><span class="t" style="display:block">${esc(nomeP(pid))}</span><span class="s" style="display:block">${o.n} ${o.n === 1 ? 'sessão' : 'sessões'} · desde ${esc(U.fDiaCurto(o.desde))}</span></span>
        <span class="end"><span class="pill warn">${esc(U.brl(o.v))}</span></span></button>`).join('') : '<div class="empty">Nenhum pagamento pendente. 🌿</div>'}</div></section>
    <section class="stack"><div class="between"><h3>Sessões do mês</h3><button class="btn ghost sm" data-act="csv-mes">${ico.download} Planilha</button></div>
      <div class="list">${ss.length ? ss.map(s => `<div class="row" role="button" tabindex="0" data-act="sessao" data-id="${s.id}">
        <span class="grow"><span class="t" style="display:block">${esc(nomeP(s.paciente_id))}</span>
        <span class="s" style="display:block">${esc(U.fDiaCurto(s.inicio))}, ${U.fHora(s.inicio)} · ${STATUS[s.status]}${s.pagamento === 'pago' && s.forma_pagamento ? ' · ' + FORMAS[s.forma_pagamento] : ''}</span></span>
        <span class="end"><b class="num">${esc(U.brl(s.valor))}</b>${!cobravel(s) ? `<span class="pill line">${s.pagamento === 'isento' ? 'Isento' : 'Não cobrada'}</span>` : s.pagamento === 'pago' ? '<span class="pill ok">Pago</span>' :
          `<button class="btn gold sm" style="padding:4px 10px;font-size:.75rem" data-act="pagar" data-id="${s.id}">Marcar pago</button>`}</span></div>`).join('') : '<div class="empty">Nenhuma sessão neste mês.</div>'}</div></section>
    <p class="muted tiny center">Contam como cobráveis as sessões agendadas, realizadas e as faltas, exceto as isentas. Sessões desmarcadas ou canceladas não entram no total.</p>`);
  V.financeiro._ss = ss;
};

/* ---------- ajustes ---------- */
V.ajustes = async (t) => {
  const p = perfil || {};
  const tema = U.store.get('tema', 'auto');
  const fusoLocal = U.fusoLocal();
  paint(`
    <div class="section-head stack tight"><span class="eyebrow">Sua conta</span><h2>Ajustes</h2></div>
    ${LIVE && (!p.nome || !U.normCRP(p.crp)) ? '<div class="banner"><span>Para usar o Sessio, informe seu nome completo e seu CRP.</span></div>' : ''}
    <form class="card stack" id="fa" novalidate>
      <div class="formsec"><h3>Perfil profissional</h3>
        <div class="fields r">
          <label class="f full">Nome completo<input class="input" id="a-nome" value="${esc(p.nome || '')}" required></label>
          <label class="f">CRP<input class="input" id="a-crp" value="${esc(p.crp || '')}" placeholder="Ex.: 20/12345" required></label>
          <label class="f">WhatsApp<input class="input" id="a-wa" value="${esc(U.fFone(p.whatsapp || ''))}" inputmode="tel" placeholder="(92) 99999-9999"></label>
        </div>
        <p class="muted tiny">Seu nome e o CRP aparecem no lembrete e na página de confirmação do paciente. O WhatsApp aparece para o paciente falar com você.</p>
      </div>
      <div class="formsec"><h3>Agenda</h3>
        <div class="fields">
          <label class="f">Duração padrão (min)<input class="input num" type="number" id="a-dur" min="5" max="600" step="5" value="${esc(p.duracao_padrao || 50)}"></label>
          <label class="f">Valor padrão (R$)<input class="input num" id="a-valor" inputmode="decimal" value="${esc(U.valorInput(p.valor_padrao || 0))}"></label>
          <label class="f full">Fuso horário dos lembretes<select class="input" id="a-fuso">${FUSOS.map(([k, v]) => `<option value="${k}" ${(p.fuso || fusoLocal) === k ? 'selected' : ''}>${v}</option>`).join('')}
            ${FUSOS.some(f => f[0] === (p.fuso || fusoLocal)) ? '' : `<option value="${esc(p.fuso || fusoLocal)}" selected>${esc(p.fuso || fusoLocal)}</option>`}</select></label>
        </div>
        ${p.fuso && p.fuso !== fusoLocal ? `<p class="muted tiny">Este aparelho está no fuso ${esc(fusoLocal)}. A agenda mostra os horários no fuso do aparelho.</p>` : ''}
      </div>
      <div class="formsec"><h3>Lembretes por e-mail</h3>
        <label class="check"><input type="checkbox" id="a-auto" ${p.lembrete_auto !== false ? 'checked' : ''}> <span>Enviar automaticamente aos pacientes que têm e-mail e aceitaram receber</span></label>
        <label class="f">Antecedência<select class="input" id="a-horas">${[2, 6, 12, 24, 48, 72].map(h => `<option value="${h}" ${(p.lembrete_horas || 24) === h ? 'selected' : ''}>${h} horas antes</option>`).join('')}</select></label>
        <p class="muted tiny">O e-mail traz a data, o horário e os botões "Confirmar presença" e "Preciso desmarcar". Pelo WhatsApp, o envio é manual, pelo botão da sessão.</p>
      </div>
      <button class="btn primary" type="submit">Salvar ajustes</button>
    </form>
    <div class="card stack"><h3>Aparência</h3>${seg('tema', {auto:'Automático', light:'Claro', dark:'Escuro'}, tema)}</div>
    <div class="card stack"><h3>Assinatura</h3>
      ${!LIVE ? '<p class="muted small">Modo demonstração: sem assinatura.</p>' :
        `<p class="small">${assin ? `<span class="pill ${ativa ? 'ok' : 'bad'}">${esc({ativa:'Ativa', atrasada:'Pagamento atrasado', cancelada:'Cancelada', reembolsada:'Reembolsada'}[assin.status] || assin.status)}</span> ${assin.expira_em ? (ativa ? 'Válida até ' : 'Encerrada em ') + esc(U.fData(assin.expira_em)) : ''}` : '<span class="pill bad">Sem assinatura</span>'}</p>
         <p class="muted small">Conta: ${esc(user && user.email)}</p>
         ${!ativa && CFG.checkoutUrl ? `<a class="btn primary" href="${esc(CFG.checkoutUrl)}" target="_blank" rel="noopener">Assinar o Sessio${CFG.preco ? ' · ' + esc(CFG.preco) : ''}</a><button class="btn ghost" data-act="recarregar">Já assinei, atualizar</button>` : ''}`}
    </div>
    <div class="card stack"><h3>Seus dados</h3>
      <p class="muted small">Você é a controladora dos dados dos seus pacientes. Baixe uma cópia completa quando quiser, mesmo sem assinatura ativa.</p>
      <div class="btn-row"><button class="btn soft" data-act="exportar-json">${ico.download} Cópia completa (JSON)</button>
        <button class="btn ghost" data-act="exportar-csv">${ico.download} Pacientes (planilha)</button></div>
    </div>
    <div class="btn-row">${LIVE ? '<button class="btn ghost" data-act="sair">Sair da conta</button>' : '<button class="btn ghost" data-act="demo-reset">Recomeçar demonstração</button>'}</div>`);
  onSeg = {tema: v => { U.store.set('tema', v); U.aplicarTema(v); }};
  $('#fa').onsubmit = async e => {
    e.preventDefault();
    const nome = $('#a-nome').value.trim().replace(/\s+/g, ' ');
    const crp = U.normCRP($('#a-crp').value);
    if (nome.split(' ').length < 2) return U.toast('Informe seu nome completo.');
    if (!crp) { $('#a-crp').focus(); return U.toast('CRP inválido. Use o formato 20/12345.'); }
    const valor = U.parseValor($('#a-valor').value);
    const dur = Math.round(Number($('#a-dur').value));
    if (!(dur >= 5 && dur <= 600)) return U.toast('Duração entre 5 e 600 minutos.');
    try {
      perfil = await D.salvarPerfil({nome, crp, whatsapp:U.digits($('#a-wa').value) || null, fuso:$('#a-fuso').value,
        valor_padrao:valor || 0, duracao_padrao:dur, lembrete_auto:$('#a-auto').checked, lembrete_horas:Number($('#a-horas').value)});
      U.toast('Ajustes salvos'); render();
    } catch(err){ falha(err); }
  };
};

/* ---------- acesso ---------- */
V.login = async () => {
  const modo = S.modo || 'entrar';
  const titulo = {entrar:'Entrar', criar:'Criar conta', esqueci:'Recuperar senha', nova:'Nova senha'}[modo];
  paint(`
    <section class="access">
      <img class="logo" src="icons/icon.svg" alt="">
      <h1>Sessio</h1>
      <p class="tag">Sua rotina clínica, simplificada.</p>
      <div class="rule"></div>
      <form class="stack" id="fl" style="text-align:left" novalidate>
        <h3 style="text-align:center">${titulo}</h3>
        ${S.msg ? `<div class="banner"><span>${esc(S.msg)}</span></div>` : ''}
        ${modo === 'criar' ? `
          <label class="f">Nome completo<input class="input" id="l-nome" autocomplete="name" required></label>
          <label class="f">CRP<input class="input" id="l-crp" placeholder="Ex.: 20/12345" required></label>` : ''}
        ${modo !== 'nova' ? `<label class="f">E-mail<input class="input" id="l-email" type="email" autocomplete="email" inputmode="email" required></label>` : ''}
        ${modo !== 'esqueci' ? `<label class="f">${modo === 'nova' ? 'Nova senha' : 'Senha'}<input class="input" id="l-senha" type="password" minlength="8" autocomplete="${modo === 'entrar' ? 'current-password' : 'new-password'}" required></label>` : ''}
        ${modo === 'criar' ? `<label class="check"><input type="checkbox" id="l-termos" required> <span class="small">Li e aceito os <a href="termos.html" target="_blank">Termos de Uso</a> e a <a href="privacidade.html" target="_blank">Política de Privacidade</a>, inclusive meu papel de controladora dos dados dos meus pacientes.</span></label>` : ''}
        <button class="btn primary block" type="submit" id="l-ok">${{entrar:'Entrar', criar:'Criar conta', esqueci:'Enviar link por e-mail', nova:'Salvar nova senha'}[modo]}</button>
        <p class="small center muted" style="display:flex;flex-direction:column;gap:6px">
          ${modo === 'entrar' ? `<button type="button" class="linkbtn" data-act="modo" data-v="esqueci">Esqueci minha senha</button>
            <span>Ainda não tem conta? <button type="button" class="linkbtn" data-act="modo" data-v="criar">Criar conta</button></span>` :
            modo !== 'nova' ? `<button type="button" class="linkbtn" data-act="modo" data-v="entrar">Voltar para entrar</button>` : ''}
        </p>
      </form>
    </section>
    ${CFG.checkoutUrl && modo !== 'nova' ? `<p class="center small muted">Para usar, é preciso ter uma assinatura ativa com o mesmo e-mail. <a href="${esc(CFG.checkoutUrl)}" target="_blank" rel="noopener">Conhecer os planos</a></p>` : ''}`, {bare:true});
  $('#fl').onsubmit = async e => {
    e.preventDefault();
    const btn = $('#l-ok'); btn.disabled = true;
    const msg = m => { btn.disabled = false; U.toast(m); };
    try {
      if (modo === 'nova') {
        const senha = $('#l-senha').value; if (senha.length < 8) return msg('A senha precisa ter pelo menos 8 caracteres.');
        const {error} = await sb.auth.updateUser({password:senha}); if (error) throw error;
        U.toast('Senha alterada'); return iniciar();
      }
      const email = $('#l-email').value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return msg('E-mail inválido.');
      if (modo === 'esqueci') {
        const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo:location.href.split('#')[0].split('?')[0]});
        if (error) throw error;
        S.msg = 'Se houver uma conta com esse e-mail, você vai receber um link para criar uma nova senha.'; S.modo = 'entrar'; return render();
      }
      const senha = $('#l-senha').value;
      if (senha.length < 8) return msg('A senha precisa ter pelo menos 8 caracteres.');
      if (modo === 'criar') {
        const nome = $('#l-nome').value.trim().replace(/\s+/g, ' '), crp = U.normCRP($('#l-crp').value);
        if (nome.split(' ').length < 2) return msg('Informe seu nome completo.');
        if (!crp) return msg('CRP inválido. Use o formato região/número, ex.: 20/12345.');
        if (!$('#l-termos').checked) return msg('É preciso aceitar os Termos e a Política de Privacidade.');
        const {data, error} = await sb.auth.signUp({email, password:senha, options:{data:{nome, crp, fuso:U.fusoLocal(), aceite_termos:new Date().toISOString(), versao_termos:CFG.termosVersao || ''}}});
        if (error) throw error;
        if (!data.session) { S.msg = 'Conta criada. Confirme seu e-mail pelo link que enviamos e depois entre.'; S.modo = 'entrar'; return render(); }
      } else {
        const {error} = await sb.auth.signInWithPassword({email, password:senha});
        if (error) throw error;
      }
      marcarUso(); await iniciar();
    } catch(err){ btn.disabled = false; U.toast(traduzErro(err)); }
  };
};

V.bloqueado = async () => {
  paint(`<section class="access"><img class="logo" src="icons/icon.svg" alt=""><h1>Sessio</h1><div class="rule"></div>
    <div class="stack"><h3>Cadastro em análise</h3><p class="muted">Não conseguimos confirmar seu cadastro profissional. Fale com o suporte para regularizar o acesso.</p>
    ${CFG.contato ? `<a class="btn soft" href="mailto:${esc(CFG.contato)}">${ico.mail} ${esc(CFG.contato)}</a>` : ''}
    <button class="btn ghost" data-act="sair">Sair</button></div></section>`, {bare:true});
};

/* =================================================================
   AÇÕES (delegação de cliques)
   ================================================================= */
const A = {
  nav: el => go(el.dataset.v, {dia:S.dia, mes:S.mes}),
  voltar: () => voltar(),
  dia: el => { S.dia = el.dataset.v; history.replaceState(S, ''); render(); },
  semana: el => { S.dia = U.ymd(U.addDays(U.fromYmd(S.dia), 7 * Number(el.dataset.v))); history.replaceState(S, ''); render(); },
  mes: el => { const n = Number(el.dataset.v); S.mes = U.ymd(n ? U.addMonths(U.fromYmd(S.mes || U.ymd(U.startOfMonth(new Date()))), n) : U.startOfMonth(new Date())); history.replaceState(S, ''); render(); },
  seg: el => {
    const box = el.closest('[data-seg]'), name = box.dataset.seg;
    $$('button', box).forEach(b => b.setAttribute('aria-pressed', String(b === el)));
    $('#' + name).value = el.dataset.v;
    if (onSeg[name]) onSeg[name](el.dataset.v);
  },
  modo: el => { S.modo = el.dataset.v; S.msg = ''; render(); },
  sessao: el => go('sessao', {id:el.dataset.id, dia:S.dia}),
  'sessao-nova': el => go('sessao', {dia:S.dia, diaNovo:S.view === 'agenda' ? S.dia : null, paciente_id:el.dataset.pac || null}),
  'bloqueio-novo': () => go('bloqueio', {dia:S.dia}),
  'bloqueio-abrir': async el => {
    if (!confirm('Remover este bloqueio de horário?')) return;
    try { await D.excluirBloqueio(el.dataset.id); U.toast('Bloqueio removido'); render(); } catch(e){ falha(e); }
  },
  'paciente': el => go('paciente', {id:el.dataset.id}),
  'paciente-novo': () => go('pacienteForm', {}),
  'paciente-editar': el => go('pacienteForm', {id:el.dataset.id}),
  'paciente-arquivar': async el => {
    const p = pmap[el.dataset.id]; if (!p) return;
    try { await D.salvarPaciente({...p, ativo:!p.ativo}); U.toast(p.ativo ? 'Paciente arquivado' : 'Paciente reativado'); render(); } catch(e){ falha(e); }
  },
  'paciente-excluir': async el => {
    const p = pmap[el.dataset.id]; if (!p) return;
    if (!confirm(`Excluir ${p.nome} e TODAS as sessões e registros de pagamento dessa pessoa?\n\nIsso não pode ser desfeito. Se quiser só tirar da lista, use "Arquivar".`)) return;
    if (prompt('Para confirmar, digite EXCLUIR') !== 'EXCLUIR') return U.toast('Exclusão cancelada');
    try { await D.excluirPaciente(p.id); U.toast('Paciente excluído'); go('pacientes', {}, {replace:true}); } catch(e){ falha(e); }
  },
  'pagar': async el => {
    try { await D.atualizarSessoes([el.dataset.id], {pagamento:'pago', pago_em:U.ymd(new Date())}); U.toast('Pagamento registrado'); render(); } catch(e){ falha(e); }
  },
  'pagar-todas': async el => {
    try {
      const pend = (await D.pendencias()).filter(s => s.paciente_id === el.dataset.id);
      if (!pend.length || !confirm(`Marcar ${pend.length} ${pend.length === 1 ? 'sessão' : 'sessões'} como pagas (${U.brl(pend.reduce((a, s) => a + Number(s.valor), 0))})?`)) return;
      await D.atualizarSessoes(pend.map(s => s.id), {pagamento:'pago', pago_em:U.ymd(new Date())}); U.toast('Pagamentos registrados'); render();
    } catch(e){ falha(e); }
  },
  'rapido': async el => {
    const v = el.dataset.v;
    const patch = v === 'pago' ? {pagamento:'pago', pago_em:U.ymd(new Date())} : {status:v};
    try { await D.atualizarSessoes([S.id], patch); U.toast(v === 'pago' ? 'Pagamento registrado' : 'Sessão marcada como ' + STATUS[v].toLowerCase()); render(); } catch(e){ falha(e); }
  },
  'sessao-excluir': async el => {
    try {
      const s = await D.sessao(S.id); if (!s) return;
      if (el.dataset.v === 'proximas') {
        const prox = (await D.sessoes({serie_id:s.serie_id, de:s.inicio})).filter(x => x.status === 'agendada' || x.id === s.id);
        if (!confirm(`Excluir esta sessão e as próximas ${prox.length - 1} agendadas desta série?\n\nSessões já realizadas continuam no histórico.`)) return;
        await D.excluirSessoes(prox.map(x => x.id)); U.toast(`${prox.length} sessões excluídas`);
      } else {
        if (!confirm('Excluir esta sessão? Se o paciente apenas desmarcou, prefira mudar a situação para "Desmarcada" e manter o registro.')) return;
        await D.excluirSessoes([s.id]); U.toast('Sessão excluída');
      }
      voltar();
    } catch(e){ falha(e); }
  },
  'lembrete-email': async el => {
    el.disabled = true;
    try { const r = await D.enviarLembrete(el.dataset.id); U.toast(r && r.demo ? 'Demonstração: no app real o e-mail seria enviado agora' : 'Lembrete enviado por e-mail'); render(); }
    catch(e){ el.disabled = false; U.toast('Não foi possível enviar: ' + traduzErro(e)); }
  },
  'copiar-link': async el => { const s = await D.sessao(el.dataset.id); if (s) U.copiar(linkConfirmacao(s)); },
  'csv-mes': () => {
    const ss = V.financeiro._ss || [];
    const linhas = [['Data','Horário','Paciente','Situação','Valor','Pagamento','Forma','Pago em']].concat(ss.map(s => [U.fData(s.inicio), U.fHora(s.inicio), nomeP(s.paciente_id), STATUS[s.status],
      String(Number(s.valor).toFixed(2)).replace('.', ','), PAG[s.pagamento], s.forma_pagamento ? FORMAS[s.forma_pagamento] : '', s.pago_em ? U.fData(U.fromYmd(s.pago_em)) : '']));
    U.baixar(`sessio-financeiro-${(S.mes || U.ymd(U.startOfMonth(new Date()))).slice(0, 7)}.csv`, U.csv(linhas), 'text/csv;charset=utf-8');
  },
  'exportar-json': async () => { try { const d = await D.exportar(); U.baixar(`sessio-copia-${U.ymd(new Date())}.json`, JSON.stringify(d, null, 2), 'application/json'); } catch(e){ falha(e); } },
  'exportar-csv': async () => {
    try { await carregarPacientes();
      U.baixar(`sessio-pacientes-${U.ymd(new Date())}.csv`, U.csv([['Nome','Telefone','E-mail','Valor por sessão','Recebe lembretes','Ativo','Observação']].concat(
        pacientes.map(p => [p.nome, U.fFone(p.telefone), p.email || '', p.valor_sessao != null ? String(Number(p.valor_sessao).toFixed(2)).replace('.', ',') : '', p.lembretes ? 'Sim' : 'Não', p.ativo ? 'Sim' : 'Não', p.observacao || '']))), 'text/csv;charset=utf-8');
    } catch(e){ falha(e); }
  },
  'demo-reset': () => { if (confirm('Apagar os dados da demonstração e começar de novo?')) { D.resetDemo(); go('agenda', {dia:U.ymd(new Date())}); } },
  'recarregar': () => iniciar(),
  'sair': async () => { if (sb) await sb.auth.signOut(); user = null; perfil = null; go('login', {}, {replace:true}); },
};
app.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || !app.contains(el) || el.disabled) return;
  const fn = A[el.dataset.act]; if (!fn) return;
  e.preventDefault(); fn(el);
});
app.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-act]')) { e.preventDefault(); e.target.click(); } });

/* =================================================================
   RENDER, LOGIN E INATIVIDADE
   ================================================================= */
async function render(){
  const t = ++seq; onSeg = {};
  const fn = V[S.view] || V.agenda;
  try { await fn(t); }
  catch(e){ if (t === seq) { console.error(e); paint(`<div class="card stack center"><h3>Não foi possível carregar</h3><p class="muted small">${esc(traduzErro(e))}</p><button class="btn soft" data-act="recarregar">Tentar de novo</button></div>`); } }
}

function marcarUso(){ U.store.set('uso', Date.now()); }
['click','keydown','touchstart'].forEach(ev => document.addEventListener(ev, () => { if (user) marcarUso(); }, {passive:true}));
setInterval(async () => {
  if (!LIVE || !user) return;
  if (Date.now() - U.store.get('uso', Date.now()) > IDLE_MS) {
    await sb.auth.signOut(); user = null; go('login', {msg:'Sua sessão foi encerrada após 30 minutos sem uso. Entre de novo.'}, {replace:true});
  }
}, 60 * 1000);

async function iniciar(){
  if (!LIVE) {
    await D.inicio(); perfil = await D.perfil(); ativa = true;
    return go(S.view && !['login','bloqueado'].includes(S.view) ? S.view : 'agenda', S, {replace:true});
  }
  const {data} = await sb.auth.getSession();
  user = data.session ? data.session.user : null;
  if (!user) return go('login', {msg:S.msg}, {replace:true});
  D.userId = user.id;
  carregando();
  try {
    perfil = await D.perfil();
    if (!perfil) {
      const m = user.user_metadata || {};
      perfil = await D.salvarPerfil({nome:m.nome || '', crp:m.crp || '', fuso:m.fuso || U.fusoLocal()});
    }
    if (perfil.bloqueado) return go('bloqueado', {}, {replace:true});
    assin = await D.assinatura(user.email);
    ativa = !!(assin && ['ativa','atrasada'].includes(assin.status) && (!assin.expira_em || new Date(assin.expira_em) > new Date()));
  } catch(e){ falha(e); }
  if (!perfil || !perfil.nome || !U.normCRP(perfil.crp)) return go('ajustes', {}, {replace:true});
  const v = S.view && !['login','bloqueado'].includes(S.view) ? S.view : 'agenda';
  go(v, {...S, view:v, msg:''}, {replace:true});
}

(async function boot(){
  if (LIVE) {
    const ultimo = U.store.get('uso', 0);
    const {data} = await sb.auth.getSession();
    const recuperando = /type=recovery/.test(location.hash);
    if (data.session && !recuperando && ultimo && Date.now() - ultimo > IDLE_MS) { await sb.auth.signOut(); S = {view:'login', msg:'Sua sessão foi encerrada após 30 minutos sem uso. Entre de novo.'}; }
    sb.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY') { marcarUso(); go('login', {modo:'nova'}, {replace:true}); } });
    if (recuperando) return;
  }
  history.replaceState(S, '');
  iniciar();
})();
})();
