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
    const { data, error } = await sb
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

  // Professor convida aluno via Edge Function (servidor seguro)
  async inviteStudent(email, nome, faixa) {
    const { data, error } = await sb.functions.invoke('invite-aluno', {
      body: { email, nome, faixa: faixa || 'white' }
    })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    return data
  },

  isProfessor() {
    return this.currentProfile?.role === 'professor'
  },

  isAluno() {
    return this.currentProfile?.role === 'aluno'
  }
}
