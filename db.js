// ─── DB ───────────────────────────────────────────────────────────────────
// Camada de acesso ao banco. Todas as queries ficam aqui —
// o resto do app nunca chama o supabase diretamente.

const DB = {

  // ── ALUNOS ──────────────────────────────────────────────────────────────

  async getAlunos() {
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .eq('role', 'aluno')
      .order('nome')
    if (error) throw error
    return data
  },

  async updateAluno(id, { nome, faixa }) {
    const { error } = await sb
      .from('profiles')
      .update({ nome, faixa })
      .eq('id', id)
    if (error) throw error
  },

  async deleteAluno(id) {
    // Remove perfil (o usuário auth é removido via trigger no Supabase)
    const { error } = await sb
      .from('profiles')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  // ── GRADE DE AULAS ───────────────────────────────────────────────────────

  async getSchedule() {
    const { data, error } = await sb
      .from('schedule')
      .select('*')
      .order('dia_semana')
      .order('horario')
    if (error) throw error
    // Agrupa por dia_semana para manter compatibilidade com o código atual
    const grouped = {}
    for (let i = 0; i <= 6; i++) grouped[i] = []
    data.forEach(row => grouped[row.dia_semana].push(row))
    return grouped
  },

  async addAula({ dia_semana, horario, nome, tipo }) {
    const { data, error } = await sb
      .from('schedule')
      .insert({ dia_semana, horario, nome, tipo })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteAula(id) {
    const { error } = await sb
      .from('schedule')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  // ── PRESENÇAS ────────────────────────────────────────────────────────────

  // Busca presenças de um dia específico (professor vê todos, aluno vê só o seu)
  async getPresencas(data, alunoId = null) {
    let query = sb
      .from('presences')
      .select('*, profiles(nome, faixa)')
      .eq('data', data)

    if (alunoId) query = query.eq('aluno_id', alunoId)

    const { data: rows, error } = await query
    if (error) throw error
    return rows
  },

  // Marca ou desmarca presença
  async togglePresenca(alunoId, data, presente) {
    const { error } = await sb
      .from('presences')
      .upsert(
        { aluno_id: alunoId, data, presente },
        { onConflict: 'aluno_id,data' }  // evita duplicata
      )
    if (error) throw error
  },

  // Histórico de presenças do aluno (para a tela "Minhas presenças")
  async getHistoricoAluno(alunoId) {
    const { data, error } = await sb
      .from('presences')
      .select('data, presente')
      .eq('aluno_id', alunoId)
      .eq('presente', true)
      .order('data', { ascending: false })
    if (error) throw error
    return data
  },

  // Total de presenças de cada aluno (para o card de estatística)
  async getTotaisPresenca() {
    const { data, error } = await sb
      .from('presences')
      .select('aluno_id')
      .eq('presente', true)
    if (error) throw error

    const totais = {}
    data.forEach(r => {
      totais[r.aluno_id] = (totais[r.aluno_id] || 0) + 1
    })
    return totais
  },

  // ── VÍDEOS ───────────────────────────────────────────────────────────────

  async getVideos(categoria = null) {
    let query = sb
      .from('videos')
      .select('*')
      .order('created_at', { ascending: false })

    if (categoria) query = query.eq('categoria', categoria)

    const { data, error } = await query
    if (error) throw error
    return data
  },

  async addVideo({ titulo, categoria, descricao, duracao, src_type, src_url, tags }) {
    const { data, error } = await sb
      .from('videos')
      .insert({ titulo, categoria, descricao, duracao, src_type, src_url, tags })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateVideo(id, fields) {
    const { error } = await sb
      .from('videos')
      .update(fields)
      .eq('id', id)
    if (error) throw error
  },

  async deleteVideo(id) {
    const { error } = await sb
      .from('videos')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  // ── CONFIGURAÇÕES DA ACADEMIA ─────────────────────────────────────────────

  async getConfig() {
    const { data, error } = await sb
      .from('config')
      .select('*')
      .single()
    if (error && error.code !== 'PGRST116') throw error  // ignora "no rows" na primeira vez
    return data || { nome_academia: 'Art of BJJ', tema: 'dark' }
  },

  async saveConfig(fields) {
    const { error } = await sb
      .from('config')
      .upsert({ id: 1, ...fields })
    if (error) throw error
  },

  // ── LOGO DA ACADEMIA ──────────────────────────────────────────────────────

  async uploadLogo(file) {
    // Nome único pra evitar cache: logo-{timestamp}.{ext}
    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const filename = `logo-${Date.now()}.${ext}`

    const { error: upErr } = await sb.storage
      .from('academia-assets')
      .upload(filename, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type
      })
    if (upErr) throw upErr

    // Pegar URL pública
    const { data } = sb.storage
      .from('academia-assets')
      .getPublicUrl(filename)

    return data.publicUrl
  },

  async removeLogoFile(url) {
    // Extrai o nome do arquivo da URL pública
    const filename = url.split('/').pop()
    if (!filename) return
    await sb.storage.from('academia-assets').remove([filename])
  },

  // ── CONFIRMAÇÕES DE PRESENÇA ──────────────────────────────────────────────

  // Confirmar/cancelar — usa upsert + delete
  async confirmarAula(alunoId, aulaId, data) {
    const { error } = await sb
      .from('confirmacoes')
      .upsert({ aluno_id: alunoId, aula_id: aulaId, data })
    if (error) throw error
  },

  async cancelarConfirmacao(alunoId, aulaId, data) {
    const { error } = await sb
      .from('confirmacoes')
      .delete()
      .eq('aluno_id', alunoId)
      .eq('aula_id', aulaId)
      .eq('data', data)
    if (error) throw error
  },

  // Buscar confirmações do aluno logado (pra exibir status na grade)
  async getMinhasConfirmacoes(alunoId, dataInicio, dataFim) {
    const { data, error } = await sb
      .from('confirmacoes')
      .select('aula_id, data')
      .eq('aluno_id', alunoId)
      .gte('data', dataInicio)
      .lte('data', dataFim)
    if (error) throw error
    return data || []
  },

  // Lista de alunos confirmados em uma aula específica
  async getConfirmacoesAula(aulaId, data) {
    const { data: rows, error } = await sb
      .from('confirmacoes')
      .select('aluno_id, profiles_publicos(nome, faixa)')
      .eq('aula_id', aulaId)
      .eq('data', data)
    if (error) throw error
    // Normaliza para manter compatibilidade
    return (rows || []).map(r => ({
      aluno_id: r.aluno_id,
      profiles: r.profiles_publicos
    }))
  },

  // Lista de alunos que confirmaram em alguma aula de uma data (pra destacar na lista de presenças)
  async getAlunosConfirmadosNoDia(data) {
    const { data: rows, error } = await sb
      .from('confirmacoes')
      .select('aluno_id, aula_id')
      .eq('data', data)
    if (error) throw error
    return rows || []
  },

  // ── MURAL DE RECADOS ──────────────────────────────────────────────────────

  async getRecados() {
    const { data, error } = await sb
      .from('mural_recados')
      .select('*')
      .order('fixado', { ascending: false })
      .order('criado_em', { ascending: false })
    if (error) throw error
    return data || []
  },

  async createRecado(titulo, texto, fixado) {
    const { data, error } = await sb
      .from('mural_recados')
      .insert({ titulo, texto, fixado })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateRecado(id, fields) {
    const { error } = await sb
      .from('mural_recados')
      .update({ ...fields, atualizado_em: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  async deleteRecado(id) {
    const { error } = await sb.from('mural_recados').delete().eq('id', id)
    if (error) throw error
  },

  // ── GRADUAÇÃO ──────────────────────────────────────────────────────────────

  async getHistoricoGraduacao(alunoId) {
    const { data, error } = await sb
      .from('graduacoes_historico')
      .select('*')
      .eq('aluno_id', alunoId)
      .order('data', { ascending: false })
    if (error) throw error
    return data || []
  },

  async promoverAluno(alunoId, faixa, grau, data, nota, aulasAcumuladas) {
    // Insere no histórico
    const { error: errHist } = await sb
      .from('graduacoes_historico')
      .insert({ aluno_id: alunoId, faixa, grau, data, nota, aulas_acumuladas: aulasAcumuladas })
    if (errHist) throw errHist
    // Atualiza profile
    const { error: errProf } = await sb
      .from('profiles')
      .update({ faixa, grau })
      .eq('id', alunoId)
    if (errProf) throw errProf
  },

  async deleteGraduacao(id) {
    const { error } = await sb.from('graduacoes_historico').delete().eq('id', id)
    if (error) throw error
  },

  async getTotalAulasAluno(alunoId) {
    const { count, error } = await sb
      .from('presences')
      .select('*', { count: 'exact', head: true })
      .eq('aluno_id', alunoId)
      .eq('presente', true)
    if (error) throw error
    return count || 0
  },

  // ── TERMO DE ACEITE ───────────────────────────────────────────────────────

  async getTermoConfig() {
    const { data, error } = await sb
      .from('config')
      .select('termo_ativo, termo_texto, termo_pdf_url')
      .eq('id', 1)
      .single()
    if (error && error.code !== 'PGRST116') throw error
    return data || { termo_ativo: false, termo_texto: null, termo_pdf_url: null }
  },

  async saveTermoConfig(fields) {
    const { error } = await sb
      .from('config')
      .upsert({ id: 1, ...fields })
    if (error) throw error
  },

  async uploadTermoPdf(file) {
    const filename = `termo-${Date.now()}.pdf`
    const { error: upErr } = await sb.storage
      .from('termo-pdf')
      .upload(filename, file, { cacheControl: '3600', upsert: false, contentType: 'application/pdf' })
    if (upErr) throw upErr
    const { data } = sb.storage.from('termo-pdf').getPublicUrl(filename)
    return data.publicUrl
  },

  async removeTermoPdf(url) {
    const filename = url.split('/').pop()
    if (!filename) return
    await sb.storage.from('termo-pdf').remove([filename])
  },

  async registrarAceite(alunoId, termoTexto, termoPdfUrl) {
    // Pega IP via API pública (best effort)
    let ip = null
    try {
      const r = await fetch('https://api.ipify.org?format=json')
      const d = await r.json()
      ip = d.ip
    } catch(e) { /* ignora */ }

    const { error } = await sb
      .from('termo_aceites')
      .insert({
        aluno_id: alunoId,
        ip,
        user_agent: navigator.userAgent,
        termo_texto_snapshot: termoTexto,
        termo_pdf_url_snapshot: termoPdfUrl
      })
    if (error) throw error
  },

  async getAceiteAluno(alunoId) {
    const { data, error } = await sb
      .from('termo_aceites')
      .select('*')
      .eq('aluno_id', alunoId)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async getTodosAceites() {
    const { data, error } = await sb
      .from('termo_aceites')
      .select('aluno_id, aceito_em, ip')
    if (error) throw error
    return data || []
  },

  // ── REGRAS DE GRADUAÇÃO ─────────────────────────────────────────────────

  async getRegrasGraduacao() {
    const { data, error } = await sb
      .from('graduacao_regras')
      .select('*')
    if (error) throw error
    return data || []
  },

  async saveRegraGraduacao(faixa, aulas_min, meses_min) {
    const { error } = await sb
      .from('graduacao_regras')
      .upsert({ faixa, aulas_min, meses_min })
    if (error) throw error
  },

  // ── MURAL DE RECADOS ─────────────────────────────────────────────────────
  async getRecados() {
    const { data, error } = await sb.from('mural_recados').select('*').order('fixado', { ascending: false }).order('criado_em', { ascending: false })
    if (error) throw error
    return data || []
  },
  async createRecado(titulo, texto, fixado) {
    const { error } = await sb.from('mural_recados').insert({ titulo, texto, fixado })
    if (error) throw error
  },
  async updateRecado(id, titulo, texto, fixado) {
    const { error } = await sb.from('mural_recados').update({ titulo, texto, fixado, atualizado_em: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  },
  async deleteRecado(id) {
    const { error } = await sb.from('mural_recados').delete().eq('id', id)
    if (error) throw error
  },

  // ── EVENTOS ──────────────────────────────────────────────────────────────
  async getEventos() {
    const { data, error } = await sb.from('eventos').select('*').order('data_evento', { ascending: true })
    if (error) throw error
    return data || []
  },
  async createEvento(ev) {
    const { error } = await sb.from('eventos').insert(ev)
    if (error) throw error
  },
  async updateEvento(id, ev) {
    const { error } = await sb.from('eventos').update(ev).eq('id', id)
    if (error) throw error
  },
  async deleteEvento(id) {
    const { error } = await sb.from('eventos').delete().eq('id', id)
    if (error) throw error
  },

  // ── GRADUAÇÕES ──────────────────────────────────────────────────────────
  async getHistoricoAluno(alunoId) {
    const { data, error } = await sb.from('graduacoes_historico').select('*').eq('aluno_id', alunoId).order('data', { ascending: false })
    if (error) throw error
    return data || []
  },
  async promoverAluno(alunoId, faixa, grau, nota, data, aulasAcumuladas) {
    // 1. Insere no histórico
    const { error: e1 } = await sb.from('graduacoes_historico').insert({
      aluno_id: alunoId, faixa, grau, nota, data, aulas_acumuladas: aulasAcumuladas
    })
    if (e1) throw e1
    // 2. Atualiza profile do aluno
    const { error: e2 } = await sb.from('profiles').update({ faixa, grau }).eq('id', alunoId)
    if (e2) throw e2
    // 3. Cria notificação pro aluno
    await sb.from('notificacoes').insert({
      user_id: alunoId,
      titulo: 'Você foi promovido!',
      texto: `Parabéns! Você agora é ${faixa} ${grau > 0 ? grau + 'º grau' : ''}.`
    })
  },
  async getTotalAulasAluno(alunoId) {
    const { count } = await sb.from('presences').select('*', { count: 'exact', head: true }).eq('aluno_id', alunoId).eq('presente', true)
    return count || 0
  },

  // ── NOTIFICAÇÕES ────────────────────────────────────────────────────────
  async getMinhasNotificacoes(userId) {
    const { data, error } = await sb.from('notificacoes').select('*').eq('user_id', userId).order('criado_em', { ascending: false }).limit(50)
    if (error) throw error
    return data || []
  },
  async marcarNotifLida(id) {
    await sb.from('notificacoes').update({ lida: true }).eq('id', id)
  },
  async marcarTodasLidas(userId) {
    await sb.from('notificacoes').update({ lida: true }).eq('user_id', userId).eq('lida', false)
  }
}
