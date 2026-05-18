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

  // Lista de alunos confirmados em uma aula específica (para o professor)
  async getConfirmacoesAula(aulaId, data) {
    const { data: rows, error } = await sb
      .from('confirmacoes')
      .select('aluno_id, profiles(nome, faixa)')
      .eq('aula_id', aulaId)
      .eq('data', data)
    if (error) throw error
    return rows || []
  },

  // Lista de alunos que confirmaram em alguma aula de uma data (pra destacar na lista de presenças)
  async getAlunosConfirmadosNoDia(data) {
    const { data: rows, error } = await sb
      .from('confirmacoes')
      .select('aluno_id, aula_id')
      .eq('data', data)
    if (error) throw error
    return rows || []
  }
}
