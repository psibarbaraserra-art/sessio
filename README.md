# Sessio · by Psique Ferramentas

**Sua rotina clínica, simplificada.** Agenda clínica para psicólogas e psicólogos, com agendamento, financeiro e confirmação de sessão pelo paciente.

Produto independente da marca Psique Ferramentas. Do Psique Rastreios, herda só a identidade visual. Código, banco de dados, login e venda são próprios.

Responsável técnica: Ana Bárbara Serra Oliveira · CRP 20/13.134 · Manaus/AM

---

## O que tem na versão 1

| Área | Funções |
|---|---|
| **Agenda** | Semana com indicadores por dia; sessões avulsas ou recorrentes (semanal, quinzenal, a cada 4 semanas); encaixes com aviso de conflito; bloqueios de horário (algumas horas ou dias inteiros, como férias); remarcar uma sessão ou toda a série |
| **Pacientes** | Ficha com contato, valor por sessão e consentimento para lembretes; busca; arquivar ou excluir; histórico, próximas sessões e pendências |
| **Financeiro** | Previsto, recebido, a receber e por vir no mês; pendências de todos os meses por paciente; marcar como pago (forma e data); isenção; planilha do mês (CSV) |
| **Lembretes** | E-mail automático (Brevo) X horas antes, com o link de confirmação; botão de WhatsApp com a mensagem pronta; copiar link |
| **Paciente** | Página `confirmar.html` sem login: confirma presença ou pede para desmarcar. A profissional vê o aviso na agenda |
| **Conta** | Login com nome e CRP obrigatórios; bloqueio de cadastros; saída após 30 minutos sem uso; exportação completa (JSON e CSV) |

**Ficou para depois:** envio de atividades e questionários ao paciente, uma pequena biblioteca própria de instrumentos, relatórios financeiros anuais, recibos e prontuário (que exige atenção à Resolução CFP nº 01/2009). Não há integração com o Psique Rastreios.

### Modo demonstração
Com `supabaseUrl` vazio em `js/config.js`, o app abre com dados fictícios guardados só no navegador. Serve para conhecer o app, gravar vídeos e tirar prints de divulgação.

---

## Colocar no ar

### 1. Supabase (projeto NOVO, separado do Rastreios)
1. Crie o projeto em supabase.com, de preferência na região São Paulo (`sa-east-1`). Com dados de pacientes, use o plano pago (backups diários e sem pausa por inatividade).
2. Em **SQL Editor**, cole e rode `supabase/01-estrutura.sql`.
3. Em **Authentication → Sign In / Providers → Email**, deixe "Confirm email" ligado depois de configurar o SMTP (passo 3).
4. Em **Authentication → URL Configuration**, coloque o endereço do app em *Site URL* e em *Redirect URLs*.
5. Em `js/config.js`, preencha `supabaseUrl` e `supabaseKey` (a chave **publishable**, nunca a secreta).

### 2. Kiwify (assinatura)
1. Crie o produto "Sessio" com assinatura mensal.
2. Publique a função `supabase/functions/kiwify-webhook` (Edge Functions, com **Verify JWT desligado**) e crie o segredo `KIWIFY_CHAVE` com um texto aleatório longo.
3. Na Kiwify, cadastre o webhook `https://<projeto>.supabase.co/functions/v1/kiwify-webhook?chave=<KIWIFY_CHAVE>`.
4. Coloque o link do checkout em `checkoutUrl` e o preço em `preco`, em `js/config.js`.
5. Acesso cortesia: veja `supabase/03-administracao.sql`.

### 3. E-mails (Brevo)
1. No Brevo, valide o domínio ou o remetente (ex.: `lembretes@...`).
2. **Senha e confirmação de conta:** em Supabase → Authentication → SMTP Settings, use o SMTP do Brevo, com o remetente "Sessio".
3. **Lembretes:** publique `supabase/functions/lembretes` (**Verify JWT desligado**) com os segredos `BREVO_API_KEY`, `LEMBRETE_CHAVE`, `APP_URL` e `REMETENTE_EMAIL`.
4. Ative `pg_cron` e `pg_net` em Database → Extensions e rode `supabase/02-lembretes-automaticos.sql`, seguindo as instruções no arquivo.

> Nunca coloque no código, no chat ou em commits a senha do banco, a chave secreta (service_role), a chave do Brevo ou as chaves dos webhooks. Elas ficam só nos *Secrets* do Supabase e no Vault.

### 4. Hospedagem
O app é estático (HTML, CSS e JS). Pode ficar no GitHub Pages, Netlify ou Cloudflare Pages. Os dados ficam no Supabase, protegidos por RLS, e não na hospedagem. Prefira um domínio próprio (ex.: `sessio.app.br`), porque o link de confirmação vai para os pacientes.

### 5. Antes de vender
- [ ] Busca no INPI (busca.inpi.gov.br, classes 9 e 42) e nas lojas de apps pelo nome "Sessio".
- [ ] Revisão jurídica de `termos.html` e `privacidade.html` (o Sessio atua como operador de dados sensíveis).
- [ ] Teste de ponta a ponta: cadastro → compra na Kiwify → agenda → lembrete → confirmação do paciente.
- [ ] Divulgação ética: nome e CRP da responsável técnica, sem promessas de resultado e sem depoimentos de pacientes.

---

## Estrutura
```
index.html              app (uma página só)
confirmar.html          página do paciente (confirmar ou desmarcar)
css/sessio.css          identidade visual (creme, oliva, dourado; claro e escuro)
js/config.js            configuração pública
js/util.js              datas, dinheiro, telefone, ícones
js/dados.js             acesso ao banco (Supabase) ou modo demonstração
js/app.js               telas e ações
js/vendor/              supabase-js 2.45.4 (MIT)
termos.html, privacidade.html, legal.css, legal.js
icons/                  ícone "S" em oliva e dourado (SVG e PNG)
supabase/01-estrutura.sql            tabelas, RLS, funções do paciente e dos lembretes
supabase/02-lembretes-automaticos.sql agendamento a cada 15 min (pg_cron)
supabase/03-administracao.sql        consultas para a administração
supabase/functions/kiwify-webhook    assinatura
supabase/functions/lembretes         envio dos e-mails
docs/PASSAGEM.md        documento de passagem (marca e decisões)
```

## Segurança, em resumo
- RLS em todas as tabelas: cada profissional lê só o que é seu; para gravar, precisa também de assinatura em dia e de cadastro não bloqueado.
- A sessão só pode apontar para um paciente da mesma profissional.
- O token do link do paciente é aleatório e não pode ser alterado pelo app. A página do paciente mostra só o primeiro nome e os dados do horário.
- Sem assinatura, a profissional ainda consulta e exporta seus dados (LGPD).
- Sem campo para conteúdo clínico.

## Publicar uma atualização
Ao mudar arquivos de `js/` ou `css/`, atualize `versao` em `js/config.js` e os `?v=` em `index.html`, `confirmar.html`, `termos.html` e `privacidade.html`.
