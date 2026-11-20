/* Configuração pública do Sessio.
   Enquanto supabaseUrl e supabaseKey estiverem vazios, o app roda em MODO DEMONSTRAÇÃO
   (dados fictícios, guardados só no aparelho).
   A chave "publishable" do Supabase foi feita para ficar no navegador: a proteção dos dados
   é feita pelas regras de segurança (RLS) do banco. Nunca coloque aqui a chave secreta (service_role). */
window.SESSIO_CONFIG = {
  supabaseUrl: 'https://odfgxrlbdgrfdihmurkp.supabase.co',   // projeto Sessio (separado do Rastreios)
  supabaseKey: 'sb_publishable_nwa38BJI2XcovEG6KNwtxA_F14Ez-9g',   // chave pública (publishable)
  appUrl: '',                 // endereço público do app (opcional); usado no link de confirmação
  checkoutUrl: '',            // link do checkout da Kiwify
  preco: '',                  // ex.: 'R$ 49,90 por mês'
  responsavel: 'Ana Bárbara Serra Oliveira',
  crp: 'CRP 20/13.134',
  contato: 'psiqueferramentas@gmail.com',
  telefone: '+55 (92) 98115-5631',
  foro: 'Manaus/AM',
  termosVersao: '2026-11-20',
  versao: '2026.11.20-3'      // ao publicar mudanças, atualize aqui e nos ?v= dos arquivos .html
};
