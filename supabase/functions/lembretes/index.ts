// Sessio · envia o lembrete por e-mail (Brevo) com o link para o paciente confirmar ou desmarcar.
//
// Dois jeitos de chamar:
//  1. Automático (pg_cron, a cada 15 min): cabeçalho "x-chave: <LEMBRETE_CHAVE>" → envia todos os pendentes.
//  2. Pelo app: a profissional toca em "Enviar lembrete por e-mail" → { sessao_id } com o login dela.
//
// Segredos da função (Edge Functions → lembretes → Secrets):
//   BREVO_API_KEY     chave da API do Brevo (nunca no código)
//   LEMBRETE_CHAVE    texto aleatório longo, o mesmo guardado no Vault (02-lembretes-automaticos.sql)
//   APP_URL           endereço público do app, ex.: https://sessio.app  (sem barra no final)
//   REMETENTE_EMAIL   remetente validado no Brevo, ex.: lembretes@seudominio.com
//   REMETENTE_NOME    opcional, padrão "Sessio"
// Publique com "Verify JWT" DESLIGADO: a própria função confere a chave ou o login.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Lembrete = {
  sessao_id: string; token: string; inicio: string; duracao_min: number; modalidade: string; link: string | null;
  paciente: string; paciente_email: string; profissional: string; crp: string | null; whatsapp: string | null; fuso: string;
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function quando(iso: string, fuso: string) {
  const d = new Date(iso);
  const tz = fuso || "America/Manaus";
  const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(d);
  const curto = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, weekday: "short", day: "2-digit", month: "2-digit" }).format(d);
  const cidade = tz.split("/").pop()!.replace(/_/g, " ");
  return { dia, hora, curto: curto.replace(".", ""), cidade };
}

function montar(l: Lembrete, appUrl: string) {
  const q = quando(l.inicio, l.fuso);
  const base = `${appUrl}/confirmar.html?t=${l.token}`;
  const quem = l.profissional + (l.crp ? ` (CRP ${l.crp.replace(/^CRP\s*/i, "")})` : "");
  const onde = l.modalidade === "online"
    ? "Atendimento on-line." + (l.link ? ` Link da chamada: ${l.link}` : "")
    : "Atendimento presencial.";
  const assunto = `Lembrete do seu horário · ${q.curto}, ${q.hora}`;
  const texto = [
    `Olá, ${l.paciente}.`,
    ``,
    `Este é um lembrete do seu horário com ${quem}:`,
    `${q.dia}, às ${q.hora} (horário de ${q.cidade}).`,
    onde,
    ``,
    `Confirme sua presença ou avise se precisar desmarcar:`,
    base,
    ``,
    `Mensagem automática enviada pelo Sessio a pedido de ${l.profissional}. Não responda a este e-mail.`,
  ].join("\n");
  const btn = (href: string, rotulo: string, cor: string, fundo: string) =>
    `<a href="${esc(href)}" style="display:inline-block;background:${fundo};color:${cor};text-decoration:none;font-weight:600;padding:12px 20px;border-radius:12px;margin:4px 6px 4px 0">${rotulo}</a>`;
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#F6F2E9;font-family:Manrope,Segoe UI,Arial,sans-serif;color:#2F3326">
<div style="max-width:520px;margin:0 auto;padding:28px 18px">
  <div style="background:#FFFDF8;border:1px solid #E4DCCB;border-radius:20px;padding:26px 22px">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#B08D4F;font-weight:700">Lembrete</p>
    <h1 style="margin:0 0 14px;font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:26px;color:#4F5B36">Olá, ${esc(l.paciente)}.</h1>
    <p style="margin:0 0 10px;line-height:1.55">Este é um lembrete do seu horário com <strong>${esc(quem)}</strong>:</p>
    <p style="margin:0 0 6px;font-size:18px;font-weight:700;color:#4F5B36">${esc(q.dia)}, às ${esc(q.hora)}</p>
    <p style="margin:0 0 18px;font-size:13px;color:#73766A">Horário de ${esc(q.cidade)} · ${esc(onde)}</p>
    <div>${btn(base + "&r=confirmar", "Confirmar presença", "#FFFDF8", "#6B7A4B")}${btn(base + "&r=desmarcar", "Preciso desmarcar", "#4F5B36", "#E7EADB")}</div>
  </div>
  <p style="margin:16px 4px 0;font-size:12px;color:#73766A;line-height:1.5">Mensagem automática enviada pelo Sessio a pedido de ${esc(l.profissional)}. Não responda a este e-mail.</p>
</div></body></html>`;
  return { assunto, texto, html };
}

async function enviar(l: Lembrete) {
  const appUrl = (Deno.env.get("APP_URL") || "").replace(/\/+$/, "");
  const { assunto, texto, html } = montar(l, appUrl);
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": Deno.env.get("BREVO_API_KEY")!, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: Deno.env.get("REMETENTE_EMAIL"), name: Deno.env.get("REMETENTE_NOME") || "Sessio" },
      to: [{ email: l.paciente_email, name: l.paciente }],
      subject: assunto, htmlContent: html, textContent: texto,
      tags: ["sessio-lembrete"],
    }),
  });
  if (!r.ok) throw new Error(`Brevo ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "método não aceito" }, 405);
  for (const k of ["BREVO_API_KEY", "APP_URL", "REMETENTE_EMAIL"]) if (!Deno.env.get(k)) return json({ erro: `segredo ${k} não configurado` }, 500);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const marcar = (id: string) => admin.from("sessoes").update({ lembrete_enviado_em: new Date().toISOString() }).eq("id", id);

  // 1. Automático
  const chave = Deno.env.get("LEMBRETE_CHAVE");
  if (chave && req.headers.get("x-chave") === chave) {
    const { data, error } = await admin.rpc("lembretes_pendentes");
    if (error) return json({ erro: error.message }, 500);
    let enviados = 0; const falhas: string[] = [];
    for (const l of (data || []) as Lembrete[]) {
      try { await enviar(l); await marcar(l.sessao_id); enviados++; }
      catch (e) { falhas.push(`${l.sessao_id}: ${(e as Error).message}`); }
    }
    return json({ enviados, falhas });
  }

  // 2. Pelo app, com o login da profissional
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ erro: "acesso negado" }, 401);
  const { data: u, error: ue } = await admin.auth.getUser(jwt);
  if (ue || !u?.user) return json({ erro: "acesso negado" }, 401);
  const body = await req.json().catch(() => ({}));
  const id = String(body.sessao_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ erro: "sessão inválida" }, 400);

  // a assinatura precisa estar ativa
  const { data: a } = await admin.from("assinaturas").select("status, expira_em").ilike("email", u.user.email || "").maybeSingle();
  const ativa = a && ["ativa", "atrasada"].includes(a.status) && (!a.expira_em || Date.parse(a.expira_em) > Date.now());
  if (!ativa) return json({ erro: "assinatura inativa" }, 403);

  const { data: s } = await admin.from("sessoes")
    .select("id, token, inicio, duracao_min, modalidade, link, status, profissional_id, pacientes(nome, email)")
    .eq("id", id).eq("profissional_id", u.user.id).maybeSingle();
  // deno-lint-ignore no-explicit-any
  const ss = s as any;
  if (!ss) return json({ erro: "sessão não encontrada" }, 404);
  const { data: perfil } = await admin.from("perfis").select("nome, crp, whatsapp, fuso, bloqueado").eq("id", u.user.id).maybeSingle();
  ss.perfis = perfil;
  if (ss.perfis?.bloqueado) return json({ erro: "cadastro bloqueado" }, 403);
  if (ss.status !== "agendada" || Date.parse(ss.inicio) < Date.now()) return json({ erro: "a sessão não está mais agendada" }, 400);
  const email = String(ss.pacientes?.email || "");
  if (!email.includes("@")) return json({ erro: "paciente sem e-mail cadastrado" }, 400);

  try {
    await enviar({
      sessao_id: ss.id, token: ss.token, inicio: ss.inicio, duracao_min: ss.duracao_min, modalidade: ss.modalidade, link: ss.link,
      paciente: String(ss.pacientes.nome).trim().split(/\s+/)[0], paciente_email: email,
      profissional: ss.perfis?.nome || "", crp: ss.perfis?.crp || null, whatsapp: ss.perfis?.whatsapp || null,
      fuso: ss.perfis?.fuso || "America/Manaus",
    });
    await marcar(ss.id);
    return json({ ok: true });
  } catch (e) {
    return json({ erro: (e as Error).message }, 502);
  }
});
