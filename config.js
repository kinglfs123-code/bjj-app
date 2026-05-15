// ─── CONFIGURAÇÃO DO SUPABASE ─────────────────────────────────────────────
// Versão defensiva: protege contra carregamento duplo do script

(function() {
  if (window.sb) return;  // Já inicializado, evita conflito

  const SUPABASE_URL = 'https://ycofkkvowmoowvbethnu.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_qxkI8dZgWNv6dSvi_2C3uQ_16L6yGXS';

  if (!window.supabase || !window.supabase.createClient) {
    console.error('[config.js] Biblioteca Supabase não carregou!');
    return;
  }

  window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('[config.js] Cliente Supabase inicializado:', !!window.sb);
})();
