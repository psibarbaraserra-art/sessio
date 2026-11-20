// Sessio · recebe os avisos da Kiwify e libera ou bloqueia o acesso.
// Endereço a cadastrar na Kiwify:
//   https://<projeto>.supabase.co/functions/v1/kiwify-webhook?chave=<KIWIFY_CHAVE>
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const DIA = 86_400_000;
const emDias = (base: number, dias: number) => new Date(base + dias * DIA).toISOString();

Deno.serve(async (req) => {
  const chave = Deno.env.get("KIWIFY_CHAVE");
  const url = new URL(req.url);
  if (!chave || url.searchParams.get("chave") !== chave) return new Response("acesso negado", { status: 401 });
  if (req.method !== "POST") return new Response("ok");

  const body = await req.json().catch(() => null);
  if (!body) return new Response("corpo inválido", { status: 400 });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const tipo = String(body.webhook_event_type || body.order_status || "").toLowerCase();
  const cliente = body.Customer || body.customer || {};
  const email = String(cliente.email || "").trim().toLowerCase();
  const assinatura = body.Subscription || body.subscription || {};
  const proximo = assinatura.next_payment ? Date.parse(assinatura.next_payment) : NaN;
  const agora = Date.now();

  // LGPD: guarda só o necessário para conferir a assinatura (sem nome, CPF, telefone, IP ou endereço)
  const minimo = {
    webhook_event_type: tipo, order_id: body.order_id ?? null, order_status: body.order_status ?? null,
    product_id: body.Product?.product_id ?? null, subscription_status: assinatura.status ?? null,
    next_payment: assinatura.next_payment ?? null, approved_date: body.approved_date ?? null,
  };
  await sb.from("eventos_kiwify").insert({ tipo, email, payload: minimo });
  if (!email) return new Response("sem e-mail", { status: 200 });

  let status: string | null = null;
  let expira_em: string | null = null;
  if (["order_approved", "paid", "approved", "subscription_renewed"].includes(tipo)) {
    status = "ativa";
    expira_em = Number.isFinite(proximo) ? emDias(proximo, 3) : emDias(agora, 33); // 3 dias de tolerância
  } else if (tipo === "subscription_late") {
    status = "atrasada";
    expira_em = emDias(agora, 3);
  } else if (tipo === "subscription_canceled") {
    status = "cancelada";
    expira_em = Number.isFinite(proximo) && proximo > agora ? new Date(proximo).toISOString() : new Date(agora).toISOString();
  } else if (["order_refunded", "refunded", "chargeback", "chargedback"].includes(tipo)) {
    status = "reembolsada";
    expira_em = new Date(agora).toISOString();
  }
  if (!status) return new Response("evento ignorado", { status: 200 });

  const { error } = await sb.from("assinaturas").upsert({
    email, status, expira_em, origem: "kiwify",
    pedido: body.order_id ? String(body.order_id) : null,
    atualizado_em: new Date().toISOString(),
  });
  if (error) return new Response("erro ao salvar: " + error.message, { status: 500 });
  return new Response("ok");
});
