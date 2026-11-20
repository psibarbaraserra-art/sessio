# Passagem para o Sessio · Psique Ferramentas

Leia este documento no início da nova conversa. O **Sessio é um produto independente**, com código, banco de dados, login, venda e regras próprios. Do Psique Rastreios ele herda **apenas a identidade visual** da marca Psique Ferramentas. A seção 3 descreve a infraestrutura do Rastreios só como referência de como as coisas foram montadas.

---

## 1. A marca

- **Marca-mãe:** Psique Ferramentas, ferramentas digitais para psicólogas(os).
- **Produtos:**
  - **Psique Rastreios:** biblioteca de 74 instrumentos de rastreio. Já está no ar e à venda.
  - **Sessio** (novo): agenda clínica com agendamento, financeiro, envio de atividades e rastreios e confirmação de sessão pelo paciente.
- **Assinatura visual sugerida:** "Sessio · by Psique Ferramentas", com o símbolo Ψ.
- **Responsável técnica:** Ana Bárbara Serra Oliveira · CRP 20/13.134 · Manaus/AM.
- **Contato do produto:** psiqueferramentas@gmail.com · WhatsApp +55 (92) 98115-5631.
- **Instagram:** Psique Ferramentas (comercial, para todos os produtos).

**Antes de lançar:** verificar no INPI (busca.inpi.gov.br) e nas lojas de apps se o nome "Sessio" já está em uso na área de software e saúde. É um nome comum e pode haver conflito.

---

## 2. Identidade visual

### Estilo
Suave e minimalista, com fundo creme, verde-oliva como cor principal e dourado nos detalhes. A tipografia é elegante e serifada nos títulos e limpa no texto. Os cartões têm cantos arredondados e bordas finas, e há muito espaço em branco. Nada de gradientes fortes nem de cores vibrantes.

### Cores (tema claro)
| Nome | Hex | Uso |
|---|---|---|
| bg (creme) | `#F6F2E9` | Fundo das páginas |
| surface | `#FFFDF8` | Cartões |
| line | `#E4DCCB` | Bordas e divisórias |
| ink | `#2F3326` | Texto principal |
| muted | `#73766A` | Texto secundário |
| olive | `#6B7A4B` | Cor principal, botões |
| olive-deep | `#4F5B36` | Títulos e botão ao passar o mouse |
| olive-soft | `#E7EADB` | Fundos de ícones, selos e itens selecionados |
| gold | `#B08D4F` | Detalhes, rótulos e o símbolo Ψ |
| gold-soft | `#F1E6CF` | Avisos suaves e selos dourados |

### Cores de estado (faixas de resultado)
| Tom | Hex | Significado |
|---|---|---|
| t0 | `#7F9461` | Bom, mínimo |
| t1 | `#C3A257` | Atenção leve |
| t2 | `#C2875A` | Moderado |
| t3 | `#A85E57` | Alto, risco e alertas |

### Tema escuro
| Nome | Hex |
|---|---|
| bg | `#1B1D16` |
| surface | `#24271E` |
| line | `#363A2C` |
| ink | `#ECE7D8` |
| muted | `#A6A797` |
| olive | `#A4B27C` |
| olive-deep | `#C3CF9C` |
| olive-soft | `#2F3427` |
| gold | `#D3B57A` |
| gold-soft | `#3A3324` |

### Tipografia (Google Fonts)
- **Títulos:** Cormorant Garamond, peso 600. O itálico em dourado é usado para destacar palavras.
- **Texto e botões:** Manrope, pesos 400 a 800.
- **Rótulos pequenos ("eyebrow"):** Manrope 700, em maiúsculas, com espaçamento entre letras de 0,14 a 0,22em, na cor dourada.

### Símbolo Ψ (SVG)
```html
<svg width="38" height="38" viewBox="0 0 48 48" fill="none">
  <circle cx="24" cy="24" r="22.5" stroke="#6B7A4B" stroke-opacity=".35"/>
  <g stroke="#B08D4F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M24 11v26"/>
    <path d="M14.5 15.5v4.5a9.5 9.5 0 0 0 19 0v-4.5"/>
    <path d="M19 37h10"/>
  </g>
</svg>
```

### Componentes
- **Botão principal:** fundo olive, texto creme, cantos de 14px, peso 600.
- **Botão suave:** fundo olive-soft, texto olive-deep.
- **Cartão:** fundo surface, borda de 1px na cor line, cantos de 18 a 24px, sombra muito leve.
- **Selos ("pill"):** cantos totalmente redondos, texto em maiúsculas pequenas, fundo olive-soft ou gold-soft.
- **Ícones:** traço fino (1.6), cantos arredondados, dentro de um quadrado olive-soft com cantos de 16px. No Rastreios, cada instrumento usa um emoji próprio.
- **Layout:** uma coluna central (máximo de 680px no app e 1040px nas páginas de vendas), pensada primeiro para o celular.

### Arquivos de referência no repositório do Psique Rastreios
- `index.html`: todos os estilos (variáveis de cor em `:root`).
- `vendas.html`: modelo de página de vendas.
- `termos.html`, `privacidade.html` e `legal.css`: modelo dos documentos legais.
- `marketing/`: capas, kit de Instagram e fotos de perfil.
- `marketing/instagram/fonte/`: modelos em HTML do Reels e do carrossel, reaproveitáveis.

---

## 3. Infraestrutura: independente, usando o Rastreios como referência

O Sessio deve ter a **sua própria infraestrutura**, sem mexer na do Psique Rastreios:

| Peça | No Sessio |
|---|---|
| **Repositório (código)** | Novo, por exemplo `sessio` |
| **Banco de dados e login** | **Novo projeto no Supabase**, separado do projeto do Rastreios |
| **Vendas** | Novo produto na Kiwify, com o próprio checkout e o próprio aviso automático (webhook) |
| **E-mails** | Pode usar a mesma conta do Brevo, com um remetente "Sessio" |
| **Hospedagem** | Própria (GitHub Pages, ou outra mais adequada para um app com dados de pacientes) |

**Referência de como o Rastreios foi montado** (para reaproveitar a solução, não as contas):
- Supabase com login por e-mail e senha, nome completo e CRP obrigatórios, bloqueio de cadastros e saída automática após 30 minutos sem uso.
- Tabela de assinaturas alimentada por uma função que recebe os avisos da Kiwify e guarda só os dados mínimos (LGPD).
- Recuperação de senha por e-mail via Brevo (SMTP configurado no Supabase).
- Os arquivos estão no repositório `psibarbaraserra-art/Ferramenta-psico-educacao`, nas pastas `supabase/` e `js/`.

**Integração com o Rastreios: opcional e para o futuro.** Se um dia fizer sentido, o Sessio pode ter um botão que abre o Psique Rastreios para quem assina os dois. Isso não é necessário para lançar o Sessio e não deve ser feito sem decisão explícita.

**Nunca** colocar no código ou no chat a senha do banco, as chaves secretas do Supabase, a chave SMTP ou a chave do webhook.

---

## 4. Cuidados específicos do Sessio

- **Dados de pacientes ficam no servidor** (nomes, telefones, sessões, pagamentos). Isso exige segurança no banco por profissional (RLS), cópias de segurança, uma política de privacidade própria, o Sessio atuando como operador e o profissional como controlador, além de sigilo conforme o Código de Ética.
- **Anotações clínicas e prontuário,** se forem incluídos, seguem a Resolução CFP nº 01/2009 sobre registro documental. Avaliar com cuidado.
- **Lembretes:** e-mail via Brevo, sem custo. O WhatsApp automático exige a API oficial do WhatsApp Business, que é paga. Começar com e-mail e um botão de WhatsApp manual.
- **Plano do Supabase:** com dados de pacientes guardados, considerar o plano pago (backups diários, sem pausa).
- **Ética na divulgação:** nome e CRP da responsável técnica, sem promessas de resultado e sem depoimentos de pacientes.

---

## 5. Funções desejadas (ponto de partida para o escopo)
- Agendamento flexível (recorrências, encaixes, bloqueios de horário)
- Financeiro (valores por sessão, pagamentos, pendências, relatórios)
- Envio de atividades ao paciente
- Envio de rastreios ou questionários ao paciente (próprio do Sessio; integração com o Psique Rastreios é opcional)
- Lembrete ao paciente com confirmação de presença

Definir na nova conversa o que entra na primeira versão (o mínimo para vender) e o que fica para depois.
