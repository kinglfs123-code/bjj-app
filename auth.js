// ─── AUTH ─────────────────────────────────────────────────────────────────
// Gerencia login, logout e sessão do usuário

const Auth = {
  // Usuário atual em memória
  currentUser: null,
  currentProfile: null,

  // Login com e-mail e senha
  async login(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  },

  // Logout
  async logout() {
    const { error } = await sb.auth.signOut()
    if (error) throw error
    window.location.reload()
  },

  // Busca perfil completo do usuário logado (role, faixa, nome)
  async getProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (error) throw error
    return data
  },

  // Verifica sessão ativa ao carregar o app
  async init() {
    const { data: { session } } = await sb.auth.getSession()
    if (!session) return null

    const profile = await this.getProfile(session.user.id)
    this.currentUser = session.user
    this.currentProfile = profile
    return profile
  },

  // Professor cria conta de aluno (sem expor senha — Supabase envia e-mail)
  async inviteStudent(email, nome, faixa) {
    // Cria usuário via admin API — o aluno recebe e-mail para definir senha
    const { data, error } = await sb.auth.admin.inviteUserByEmail(email, {
      data: { nome, faixa, role: 'aluno' }
    })
    if (error) throw error
    return data
  },

  isProfessor() {
    return this.currentProfile?.role === 'professor'
  },

  isAluno() {
    return this.currentProfile?.role === 'aluno'
  }
}
