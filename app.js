// ════════════════════════════════════════════════════════════════════════
// APP PRINCIPAL — Lógica do app conectada ao Supabase
// ════════════════════════════════════════════════════════════════════════

// ─── CONSTANTES ─────────────────────────────────────────────────────────
const DAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const DAYS_FULL = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']
const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const BELT_PT = {white:'Branca',blue:'Azul',purple:'Roxa',brown:'Marrom',black:'Preta'}
const CAT_LABELS = {guard:'Guarda',pass:'Passagem',sub:'Finalização',sweep:'Raspagem',position:'Posição'}
const TYPE_PT = {gi:'Gi · Kimono',nogi:'No-Gi',kids:'Kids'}
const PATS = ['◈ ◈ ◈','▲  ▲','◉ ◈ ◉','▲ ◈ ▲','◈ ◉ ◈','◉ ◉ ◉']

// ─── ESTADO ─────────────────────────────────────────────────────────────
const state = {
  alunos: [],
  videos: [],
  schedule: {},
  config: { nome_academia: 'Art of BJJ', tema: 'dark' },
  presencas: {},        // {alunoId: true}
  totaisPresenca: {},   // {alunoId: count}
  minhasConfirmacoes: {}, // {'aulaId_data': true} para o aluno logado
  confirmadosNoDia: {}, // {alunoId: true} - quem confirmou em alguma aula no dia atual (pro professor)
  curDate: new Date(),
  filters: { presBelt:'all', stuBelt:'all', vid:'all', search:'' },
  editMode: false,
  editingStuId: null,
  editingVidId: null,
  vidSrcTab: 'youtube',
  pendingFile: null,
}

// ─── UTILS ──────────────────────────────────────────────────────────────
function dateKey(d){ return d.toISOString().slice(0,10) }
function $(id){ return document.getElementById(id) }
function toast(msg, err=false){
  const t = $('toast')
  t.textContent = msg
  t.className = 'toast show' + (err?' err':'')
  setTimeout(()=>t.className='toast', 2400)
}
function ytEmbedUrl(raw){
  if(!raw) return null
  let id = null
  try {
    const u = new URL(raw)
    if(u.hostname.includes('youtu.be')) id = u.pathname.slice(1)
    else if(u.searchParams.get('v')) id = u.searchParams.get('v')
    else if(u.pathname.includes('/embed/')) id = u.pathname.split('/embed/')[1].split('?')[0]
  } catch {
    const m = raw.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/)
    if(m) id = m[1]
  }
  return id ? `https://www.youtube.com/embed/${id}` : null
}

// ─── BOOT ───────────────────────────────────────────────────────────────
async function boot(){
  try {
    // 1. Verifica sessão
    const profile = await Auth.init()
    if(!profile){
      window.location.href = '/index.html'
      return
    }

    // 2. Aplica role no body (CSS esconde .prof-only se for aluno)
    document.body.classList.add('role-' + profile.role)

    // 3. Mostra info do usuário
    $('user-name').textContent = profile.nome
    $('user-role').textContent = profile.role === 'professor' ? 'Professor' : 'Aluno'
    $('account-info').textContent = `${profile.nome} · ${profile.email}`

    // 4. Carrega dados em paralelo
    const [alunos, videos, schedule, config, totais] = await Promise.all([
      DB.getAlunos(),
      DB.getVideos(),
      DB.getSchedule(),
      DB.getConfig(),
      DB.getTotaisPresenca()
    ])
    state.alunos = alunos
    state.videos = videos
    state.schedule = schedule
    state.config = config
    state.totaisPresenca = totais

    // 5. Carrega presenças de hoje
    await loadPresences(state.curDate)

    // 5.1. Carrega confirmações relevantes
    await loadConfirmacoes()

    // 6. Monta nav
    setupNav()

    // 7. Aplica config
    applyTheme(state.config.tema)
    applyName()
    applyLogo()

    // 8. Renderiza tudo
    renderAll()

    // 9. Setup event listeners
    setupListeners()

    // 10. Esconde loader, mostra app
    $('boot-loader').style.display = 'none'
    $('APP').style.display = 'flex'
  } catch (err) {
    console.error('Erro no boot:', err)
    $('boot-loader').innerHTML = `
      <div style="color:#e05050;font-size:13px;text-align:center;padding:20px">
        Erro ao carregar.<br><br>
        <span style="font-size:11px;color:#888">${err.message}</span><br><br>
        <button onclick="Auth.logout()" style="background:none;border:0.5px solid #444;color:#aaa;padding:8px 14px;border-radius:2px;cursor:pointer;font-size:11px;letter-spacing:2px;text-transform:uppercase">Sair</button>
      </div>`
  }
}

// ─── NAV ────────────────────────────────────────────────────────────────
function setupNav(){
  const isProf = Auth.isProfessor()
  const items = [
    { id:'schedule', label:'Aulas' },
    { id:'presences', label:'Presenças' },
    { id:'comunicacao', label:'Comunicação' },
    { id:'videos', label:'Vídeos' },
  ]
  if(isProf) items.push({ id:'students', label:'Alunos' })
  if(!isProf) items.push({ id:'perfil', label:'Perfil' })
  items.push({ id:'settings', label:'⚙️', isIcon:true })

  $('nav-bar').innerHTML = items.map((it, i) => `
    <button class="nb ${i===0?'active':''}" data-page="${it.id}">
      ${it.isIcon ? '<i class="ti ti-settings" aria-hidden="true"></i>' : it.label}
    </button>
  `).join('')

  $('nav-bar').querySelectorAll('.nb').forEach(btn => {
    btn.addEventListener('click', () => {
      $('nav-bar').querySelectorAll('.nb').forEach(b => b.classList.remove('active'))
      document.querySelectorAll('.page').forEach(p => p.classList.remove('on'))
      btn.classList.add('active')
      $('page-' + btn.dataset.page).classList.add('on')
      // Carrega conteúdo da página
      if(btn.dataset.page === 'comunicacao') renderComunicacao()
      if(btn.dataset.page === 'perfil') openPerfilSelf()
    })
  })
}

// ─── LISTENERS ──────────────────────────────────────────────────────────
function setupListeners(){
  $('logout-btn').addEventListener('click', () => Auth.logout())

  // Filtros de presença
  document.querySelectorAll('#page-presences .fbtn[data-belt]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#page-presences .fbtn[data-belt]').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      state.filters.presBelt = btn.dataset.belt
      renderPresContent()
    })
  })
  $('pres-search')?.addEventListener('input', e => {
    state.filters.search = e.target.value.toLowerCase()
    renderPresContent()
  })

  // Date nav
  $('prev-day').addEventListener('click', async () => {
    state.curDate.setDate(state.curDate.getDate() - 1)
    await loadPresences(state.curDate)
    await loadConfirmacoes()
    updateDateLabel(); renderPresContent()
  })
  $('next-day').addEventListener('click', async () => {
    state.curDate.setDate(state.curDate.getDate() + 1)
    await loadPresences(state.curDate)
    await loadConfirmacoes()
    updateDateLabel(); renderPresContent()
  })

  // Filtros de vídeo
  document.querySelectorAll('#vid-filters .fbtn[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#vid-filters .fbtn[data-cat]').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      state.filters.vid = btn.dataset.cat
      renderVideos()
    })
  })

  // Filtros de alunos
  document.querySelectorAll('#page-students .fbtn[data-belt]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#page-students .fbtn[data-belt]').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      state.filters.stuBelt = btn.dataset.belt
      renderStudents()
    })
  })
  $('stu-search')?.addEventListener('input', () => renderStudents())

  // Config
  $('cfg-name').value = state.config.nome_academia

  // Modal: fechar ao clicar fora
  document.querySelectorAll('.mlay').forEach(m => {
    m.addEventListener('click', e => { if(e.target === m){ m.style.display = 'none'; state.pendingFile = null } })
  })
}

// ─── LOAD DATA ──────────────────────────────────────────────────────────
async function loadPresences(date){
  const key = dateKey(date)
  const rows = await DB.getPresencas(key)
  state.presencas = {}
  rows.forEach(r => { if(r.presente) state.presencas[r.aluno_id] = true })
}

async function loadConfirmacoes(){
  try {
    if(Auth.isAluno()){
      // Aluno: carrega as próprias confirmações dos próximos 14 dias
      const myId = Auth.currentProfile.id
      const hoje = new Date()
      const fim = new Date(); fim.setDate(fim.getDate() + 14)
      const rows = await DB.getMinhasConfirmacoes(myId, dateKey(hoje), dateKey(fim))
      state.minhasConfirmacoes = {}
      rows.forEach(r => { state.minhasConfirmacoes[r.aula_id + '_' + r.data] = true })
    } else if(Auth.isProfessor()){
      // Professor: carrega confirmações do dia selecionado
      const rows = await DB.getAlunosConfirmadosNoDia(dateKey(state.curDate))
      state.confirmadosNoDia = {}
      rows.forEach(r => { state.confirmadosNoDia[r.aluno_id] = true })
    }
  } catch(err){
    console.error('[confirmacoes]', err)
    state.minhasConfirmacoes = {}
    state.confirmadosNoDia = {}
  }
}

function renderAll(){
  renderSchedule()
  renderGradeEditor()
  renderPresContent()
  renderVideos()
  if(Auth.isProfessor()) renderStudents()
  updateDateLabel()
}

// ─── THEME ──────────────────────────────────────────────────────────────
function applyTheme(t){
  state.config.tema = t
  document.body.classList.toggle('light', t === 'light')
  $('opt-dark').classList.toggle('active', t === 'dark')
  $('opt-light').classList.toggle('active', t === 'light')
}
async function setTheme(t){
  applyTheme(t)
  if(Auth.isProfessor()){
    try { await DB.saveConfig({ tema: t }) } catch(e){}
  }
  toast(t === 'light' ? 'Tema claro ativado!' : 'Tema escuro ativado!')
}

function applyName(){
  const n = state.config.nome_academia || 'Art of BJJ'
  const parts = n.split(' ')
  const last = parts.pop()
  $('logo-text').innerHTML = parts.join(' ') + ' <em>' + last + '</em>'
  $('sch-title').textContent = 'Grade — ' + n
}

async function saveName(){
  const v = $('cfg-name').value.trim()
  if(!v){ toast('Nome não pode ser vazio.', true); return }
  try {
    await DB.saveConfig({ nome_academia: v })
    state.config.nome_academia = v
    applyName()
    toast('Nome salvo!')
  } catch(err) {
    toast('Erro: ' + err.message, true)
  }
}

// ─── LOGO ───────────────────────────────────────────────────────────────

function applyLogo(){
  const url = state.config.logo_url
  const imgEl = $('logo-img')
  const previewEl = $('logo-preview')
  const removeBtn = $('logo-remove-btn')

  if(url){
    // Topbar
    if(imgEl){
      imgEl.src = url
      imgEl.style.display = 'block'
    }
    // Preview na config
    if(previewEl){
      previewEl.innerHTML = `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:contain">`
    }
    // Botão remover
    if(removeBtn) removeBtn.style.display = 'inline-flex'
  } else {
    if(imgEl){
      imgEl.style.display = 'none'
      imgEl.src = ''
    }
    if(previewEl){
      previewEl.innerHTML = '<i class="ti ti-photo" style="font-size:24px;color:var(--txt3)" aria-hidden="true"></i>'
    }
    if(removeBtn) removeBtn.style.display = 'none'
  }
}

// Comprime a imagem antes de fazer upload (max 512px, ~80KB)
async function compressImage(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        const MAX = 512
        let w = img.width, h = img.height
        if(w > MAX || h > MAX){
          if(w > h){ h = h * MAX / w; w = MAX }
          else { w = w * MAX / h; h = MAX }
        }
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        canvas.toBlob(
          blob => {
            if(!blob) return reject(new Error('Erro ao processar imagem'))
            // Cria um File do blob (preserva nome)
            const compressed = new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), { type: 'image/jpeg' })
            resolve(compressed)
          },
          'image/jpeg',
          0.85
        )
      }
      img.onerror = () => reject(new Error('Arquivo inválido'))
      img.src = e.target.result
    }
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'))
    reader.readAsDataURL(file)
  })
}

async function onLogoFileSelected(event){
  const file = event.target.files[0]
  if(!file) return

  // Validações
  if(!file.type.startsWith('image/')){
    toast('Selecione um arquivo de imagem.', true)
    return
  }
  if(file.size > 5 * 1024 * 1024){
    toast('Arquivo muito grande (máximo 5 MB).', true)
    return
  }

  toast('Processando imagem...')

  try {
    // Comprimir
    const compressed = await compressImage(file)

    // Se já existe logo, deletar a antiga primeiro
    if(state.config.logo_url){
      try { await DB.removeLogoFile(state.config.logo_url) } catch(e){ /* ignora */ }
    }

    // Upload da nova
    const url = await DB.uploadLogo(compressed)

    // Salvar no config
    await DB.saveConfig({ logo_url: url })
    state.config.logo_url = url

    applyLogo()
    toast('Logo atualizada!')
  } catch(err){
    console.error('[logo upload]', err)
    toast('Erro: ' + (err.message || 'falha no upload'), true)
  } finally {
    // Limpa o input pra permitir re-upload do mesmo arquivo
    event.target.value = ''
  }
}

async function removeLogo(){
  if(!confirm('Remover a logo da academia?')) return
  try {
    if(state.config.logo_url){
      try { await DB.removeLogoFile(state.config.logo_url) } catch(e){ /* ignora se falhar */ }
    }
    await DB.saveConfig({ logo_url: null })
    state.config.logo_url = null
    applyLogo()
    toast('Logo removida.')
  } catch(err){
    toast('Erro: ' + err.message, true)
  }
}

// ─── SCHEDULE (visualização) ────────────────────────────────────────────
function renderSchedule(){
  const today = new Date()
  const dow = today.getDay()
  let h = ''
  for(let i = 0; i < 7; i++){
    const d = new Date(today); d.setDate(today.getDate() - dow + i)
    const dn = d.getDay()
    const cls = state.schedule[dn] || []
    const isT = dn === dow
    const dateStr = dateKey(d)
    h += `<div class="dcol">
      <div class="dhead">
        <div class="dname">${DAYS[i]}</div>
        <div class="dnum ${isT ? 'td' : ''}">${d.getDate()}</div>
      </div>
      ${cls.map(c => {
        const confirmed = Auth.isAluno() && state.minhasConfirmacoes[c.id + '_' + dateStr]
        return `<div class="cpill ${c.tipo}${confirmed ? ' confirmed' : ''}" onclick="openAulaDetail('${c.id}','${dateStr}')" style="cursor:pointer">
          <span class="ctime">${c.horario.slice(0,5)}${confirmed ? ' <i class="ti ti-check" style="color:#7ac890" aria-hidden="true"></i>' : ''}</span>
          <span class="cname">${c.nome}</span>
        </div>`
      }).join('') || '<div style="padding:8px 5px;font-size:9px;color:var(--border2);text-align:center">—</div>'}
    </div>`
  }
  $('wgrid').innerHTML = h

  const tc = state.schedule[dow] || []
  const todayStr = dateKey(today)
  $('today-classes').innerHTML = tc.length
    ? tc.map(c => {
        const confirmed = Auth.isAluno() && state.minhasConfirmacoes[c.id + '_' + todayStr]
        return `<div onclick="openAulaDetail('${c.id}','${todayStr}')" style="background:var(--surf);border:0.5px solid var(--border);border-radius:2px;padding:10px 12px;display:flex;align-items:center;gap:10px;cursor:pointer;${confirmed ? 'border-left:3px solid #7ac890' : ''}">
          <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:var(--txt);line-height:1">${c.horario.slice(0,5)}</div>
          <div style="flex:1">
            <div style="font-size:12px;font-weight:500;color:var(--txt)">${c.nome}</div>
            <div style="font-size:9px;color:var(--txt3);letter-spacing:1.5px;text-transform:uppercase">${TYPE_PT[c.tipo] || c.tipo}</div>
          </div>
          ${confirmed ? '<i class="ti ti-circle-check-filled" style="color:#7ac890;font-size:18px"></i>' : '<i class="ti ti-chevron-right" style="color:var(--txt3)"></i>'}
        </div>`
      }).join('')
    : '<div style="color:var(--txt3);font-size:12px">Sem aulas hoje.</div>'
}

// ─── DETALHE DE AULA + CONFIRMAÇÃO ──────────────────────────────────────

async function openAulaDetail(aulaId, dateStr){
  // Acha a aula no schedule
  let aula = null
  for(const dn in state.schedule){
    const found = state.schedule[dn].find(a => a.id === aulaId)
    if(found){ aula = found; break }
  }
  if(!aula){ toast('Aula não encontrada.', true); return }

  const d = new Date(dateStr + 'T00:00:00')
  const dateDisplay = `${DAYS_FULL[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`

  // Verifica se a aula já passou
  const now = new Date()
  const aulaStart = new Date(dateStr + 'T' + aula.horario)
  const yaEmpezou = aulaStart < now

  $('aula-detail-title').textContent = aula.nome
  const body = $('aula-detail-body')
  const foot = $('aula-detail-foot')

  // ──────── ALUNO ────────
  if(Auth.isAluno()){
    const myId = Auth.currentProfile.id
    const isConfirmed = !!state.minhasConfirmacoes[aulaId + '_' + dateStr]

    // Carrega quantos confirmaram (público pro aluno também — info motivacional)
    let totalConfirmados = 0
    try {
      const conf = await DB.getConfirmacoesAula(aulaId, dateStr)
      totalConfirmados = conf.length
    } catch(e){ /* ignora */ }

    body.innerHTML = `
      <div class="aula-info-grid">
        <div class="aula-info-cell">
          <div class="aula-info-lbl">Dia</div>
          <div class="aula-info-val" style="font-size:14px;letter-spacing:1px">${DAYS_FULL[d.getDay()].slice(0,3).toUpperCase()}</div>
        </div>
        <div class="aula-info-cell">
          <div class="aula-info-lbl">Horário</div>
          <div class="aula-info-val">${aula.horario.slice(0,5)}</div>
        </div>
        <div class="aula-info-cell">
          <div class="aula-info-lbl">Tipo</div>
          <div class="aula-info-val" style="font-size:13px;letter-spacing:1px">${(TYPE_PT[aula.tipo] || aula.tipo).split(' ')[0].toUpperCase()}</div>
        </div>
      </div>
      <div style="font-size:11px;color:var(--txt3);text-align:center;margin-bottom:12px">${dateDisplay}</div>
      <div class="aula-confirm-info">
        <div class="aula-confirm-num">${totalConfirmados}</div>
        <div class="aula-confirm-txt">${totalConfirmados === 1 ? 'aluno confirmou presença' : 'alunos confirmaram presença'} nessa aula</div>
      </div>
    `

    if(yaEmpezou){
      foot.innerHTML = `
        <div style="flex:1;font-size:11px;color:var(--txt3);text-align:center;padding:8px">Esta aula já começou ou terminou.</div>
        <button class="fbtn" onclick="closeModal('modal-aula-detail')">Fechar</button>
      `
    } else if(isConfirmed){
      foot.innerHTML = `
        <button class="fbtn" onclick="closeModal('modal-aula-detail')">Fechar</button>
        <button class="btn-confirm-big confirmed" onclick="cancelarConfirmacao('${aulaId}','${dateStr}')" style="flex:1;margin-left:8px"><i class="ti ti-x"></i> Cancelar confirmação</button>
      `
    } else {
      foot.innerHTML = `
        <button class="fbtn" onclick="closeModal('modal-aula-detail')">Fechar</button>
        <button class="btn-confirm-big" onclick="confirmarPresenca('${aulaId}','${dateStr}')" style="flex:1;margin-left:8px"><i class="ti ti-check"></i> Confirmar presença</button>
      `
    }
  }

  // ──────── PROFESSOR ────────
  else if(Auth.isProfessor()){
    body.innerHTML = `
      <div class="aula-info-grid">
        <div class="aula-info-cell">
          <div class="aula-info-lbl">Dia</div>
          <div class="aula-info-val" style="font-size:14px;letter-spacing:1px">${DAYS_FULL[d.getDay()].slice(0,3).toUpperCase()}</div>
        </div>
        <div class="aula-info-cell">
          <div class="aula-info-lbl">Horário</div>
          <div class="aula-info-val">${aula.horario.slice(0,5)}</div>
        </div>
        <div class="aula-info-cell">
          <div class="aula-info-lbl">Tipo</div>
          <div class="aula-info-val" style="font-size:13px;letter-spacing:1px">${(TYPE_PT[aula.tipo] || aula.tipo).split(' ')[0].toUpperCase()}</div>
        </div>
      </div>
      <div style="font-size:11px;color:var(--txt3);text-align:center;margin-bottom:12px">${dateDisplay}</div>
      <div class="slabel" style="margin-bottom:6px">Alunos confirmados</div>
      <div id="confirm-list-area">
        <div style="padding:14px;text-align:center;color:var(--txt3);font-size:11px">Carregando...</div>
      </div>
    `

    foot.innerHTML = `<button class="fbtn" onclick="closeModal('modal-aula-detail')">Fechar</button>`

    // Carrega lista assíncrona
    try {
      const rows = await DB.getConfirmacoesAula(aulaId, dateStr)
      const area = $('confirm-list-area')
      if(rows.length === 0){
        area.innerHTML = '<div style="padding:14px;text-align:center;color:var(--txt3);font-size:11px">Nenhum aluno confirmou ainda.</div>'
      } else {
        area.innerHTML = '<div class="aula-confirm-list">' + rows.map(r => `
          <div class="aula-confirm-item">
            <span class="belt ${r.profiles?.faixa || 'white'}"></span>
            <span class="aula-confirm-name">${r.profiles?.nome || '?'}</span>
            <span style="font-size:10px;color:var(--txt3)">${BELT_PT[r.profiles?.faixa] || ''}</span>
          </div>`).join('') + '</div>' + 
          `<div style="font-size:10px;color:var(--txt3);text-align:center;margin-top:8px">Total: ${rows.length} ${rows.length === 1 ? 'aluno' : 'alunos'}</div>`
      }
    } catch(err){
      $('confirm-list-area').innerHTML = `<div style="padding:14px;color:#e05050;font-size:11px">Erro ao carregar: ${err.message}</div>`
    }
  }

  $('modal-aula-detail').style.display = 'flex'
}

async function confirmarPresenca(aulaId, dateStr){
  const myId = Auth.currentProfile.id
  try {
    await DB.confirmarAula(myId, aulaId, dateStr)
    state.minhasConfirmacoes[aulaId + '_' + dateStr] = true
    toast('Presença confirmada!')
    closeModal('modal-aula-detail')
    renderSchedule()
  } catch(err){
    toast('Erro: ' + err.message, true)
  }
}

async function cancelarConfirmacao(aulaId, dateStr){
  const myId = Auth.currentProfile.id
  try {
    await DB.cancelarConfirmacao(myId, aulaId, dateStr)
    delete state.minhasConfirmacoes[aulaId + '_' + dateStr]
    toast('Confirmação cancelada.')
    closeModal('modal-aula-detail')
    renderSchedule()
  } catch(err){
    toast('Erro: ' + err.message, true)
  }
}

// ─── GRADE EDITOR (professor) ───────────────────────────────────────────
function renderGradeEditor(){
  if(!Auth.isProfessor()) return
  const ORDER = [1,2,3,4,5,6,0]
  $('grade-editor').innerHTML = ORDER.map(dn => {
    const aulas = state.schedule[dn] || []
    return `<div class="grade-day-block">
      <div class="grade-day-header">
        <span class="grade-day-name">${DAYS_FULL[dn]}</span>
        <button class="grade-add-btn" onclick="openAulaModal(${dn})">
          <i class="ti ti-plus" aria-hidden="true"></i> Adicionar aula
        </button>
      </div>
      <div class="grade-aulas">
        ${aulas.length ? aulas.map(a => `
          <div class="grade-aula-row ${a.tipo}">
            <div class="grade-aula-time">${a.horario.slice(0,5)}</div>
            <div class="grade-aula-info">
              <div class="grade-aula-name">${a.nome}</div>
              <div class="grade-aula-type">${TYPE_PT[a.tipo] || a.tipo}</div>
            </div>
            <button class="grade-aula-del" onclick="deleteAula('${a.id}')">
              <i class="ti ti-trash" aria-hidden="true"></i> Remover
            </button>
          </div>`).join('')
        : `<div class="grade-empty">Nenhuma aula cadastrada</div>`}
      </div>
    </div>`
  }).join('')
}

function toggleScheduleEdit(){
  state.editMode = !state.editMode
  $('view-mode').style.display = state.editMode ? 'none' : 'block'
  $('edit-mode').style.display = state.editMode ? 'block' : 'none'
  const btn = $('toggle-edit-btn')
  btn.innerHTML = state.editMode
    ? '<i class="ti ti-eye" aria-hidden="true"></i> Ver grade'
    : '<i class="ti ti-edit" aria-hidden="true"></i> Editar grade'
  btn.classList.toggle('active', state.editMode)
  if(!state.editMode) renderSchedule()
}

function openAulaModal(day){
  $('aula-day').value = String(day)
  $('aula-time').value = '06:00'
  $('aula-name').value = ''
  $('aula-type').value = 'gi'
  $('modal-aula').style.display = 'flex'
}

async function saveAula(){
  const day = parseInt($('aula-day').value)
  const horario = $('aula-time').value
  const nome = $('aula-name').value.trim()
  const tipo = $('aula-type').value
  if(!nome){ toast('Nome da aula obrigatório.', true); return }
  if(!horario){ toast('Horário obrigatório.', true); return }
  try {
    const nova = await DB.addAula({ dia_semana: day, horario, nome, tipo })
    if(!state.schedule[day]) state.schedule[day] = []
    state.schedule[day].push(nova)
    state.schedule[day].sort((a,b) => a.horario.localeCompare(b.horario))
    closeModal('modal-aula')
    renderGradeEditor()
    toast('Aula adicionada!')
  } catch(err) {
    toast('Erro: ' + err.message, true)
  }
}

async function deleteAula(id){
  try {
    await DB.deleteAula(id)
    for(const day in state.schedule){
      state.schedule[day] = state.schedule[day].filter(a => a.id !== id)
    }
    renderGradeEditor()
    toast('Aula removida.')
  } catch(err) {
    toast('Erro: ' + err.message, true)
  }
}

// ─── PRESENÇAS ──────────────────────────────────────────────────────────
function updateDateLabel(){
  const d = state.curDate
  const isT = dateKey(d) === dateKey(new Date())
  $('cur-date-label').textContent = `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`
  $('pres-date-label').textContent = isT ? 'Hoje' : 'Data selecionada'
}

function renderPresContent(){
  if(Auth.isProfessor()){
    renderPresContentProfessor()
  } else {
    renderPresContentAluno()
  }
}

// Professor vê tabela com checkboxes para todos
function renderPresContentProfessor(){
  const total = state.alunos.length
  const present = Object.values(state.presencas).filter(Boolean).length
  const pct = total ? Math.round(present/total*100) : 0
  const bc = {}
  state.alunos.filter(s => state.presencas[s.id]).forEach(s => bc[s.faixa] = (bc[s.faixa] || 0) + 1)
  const top = Object.entries(bc).sort((a,b) => b[1]-a[1])[0]

  $('pres-stats').innerHTML = `
    <div class="sc"><div class="scv">${total}</div><div class="scl">Alunos</div></div>
    <div class="sc"><div class="scv">${present}</div><div class="scl">Presentes</div></div>
    <div class="sc"><div class="scv">${pct}%</div><div class="scl">Taxa</div></div>
    <div class="sc"><div class="scv">${top ? BELT_PT[top[0]] : '—'}</div><div class="scl">Faixa líder</div></div>
  `

  const q = state.filters.search
  const bf = state.filters.presBelt
  const filtered = state.alunos.filter(s => {
    if(bf !== 'all' && s.faixa !== bf) return false
    if(q && !s.nome.toLowerCase().includes(q)) return false
    return true
  })

  $('pres-content').innerHTML = filtered.length ? `
    <table class="tbl">
      <thead><tr><th>Aluno</th><th>Faixa</th><th>Presenças</th><th>Hoje</th></tr></thead>
      <tbody>
        ${filtered.map(s => {
          const confirmou = state.confirmadosNoDia[s.id]
          return `<tr>
            <td style="font-weight:500;color:var(--txt)">
              ${s.nome}
              ${confirmou ? '<span class="pres-confirmed-badge"><i class="ti ti-circle-check-filled"></i> confirmou</span>' : ''}
            </td>
            <td><span class="belt ${s.faixa}"></span><span style="font-size:10px;color:var(--txt3)">${BELT_PT[s.faixa] || s.faixa}</span></td>
            <td><span style="font-family:'Bebas Neue',sans-serif;font-size:18px;color:var(--txt)">${state.totaisPresenca[s.id] || 0}</span></td>
            <td><button class="ck ${state.presencas[s.id] ? 'on' : ''}" onclick="togglePres('${s.id}')">${state.presencas[s.id] ? '<i class="ti ti-check"></i>' : '<i class="ti ti-plus" style="color:var(--txt3)"></i>'}</button></td>
          </tr>`
        }).join('')}
      </tbody>
    </table>
  ` : '<div style="text-align:center;padding:30px;color:var(--txt3);font-size:13px">Nenhum aluno encontrado.</div>'
}

// Aluno vê apenas o próprio histórico
async function renderPresContentAluno(){
  const myId = Auth.currentProfile.id
  const total = state.totaisPresenca[myId] || 0
  const presenteHoje = state.presencas[myId] ? 'Sim' : 'Não'

  $('pres-stats').innerHTML = `
    <div class="sc"><div class="scv">${total}</div><div class="scl">Total presenças</div></div>
    <div class="sc"><div class="scv">${presenteHoje}</div><div class="scl">Presente hoje?</div></div>
  `

  try {
    const historico = await DB.getHistoricoAluno(myId)
    $('pres-content').innerHTML = historico.length ? `
      <div class="slabel" style="margin-bottom:10px">Histórico</div>
      <table class="tbl">
        <thead><tr><th>Data</th></tr></thead>
        <tbody>
          ${historico.map(h => {
            const d = new Date(h.data + 'T00:00:00')
            return `<tr><td>${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}</td></tr>`
          }).join('')}
        </tbody>
      </table>
    ` : '<div style="text-align:center;padding:30px;color:var(--txt3);font-size:13px">Nenhuma presença registrada ainda.</div>'
  } catch(err){
    $('pres-content').innerHTML = `<div style="color:#e05050;padding:20px;font-size:12px">Erro ao carregar histórico.</div>`
  }
}

async function togglePres(alunoId){
  const presente = !state.presencas[alunoId]
  try {
    await DB.togglePresenca(alunoId, dateKey(state.curDate), presente)
    if(presente){
      state.presencas[alunoId] = true
      state.totaisPresenca[alunoId] = (state.totaisPresenca[alunoId] || 0) + 1
    } else {
      delete state.presencas[alunoId]
      state.totaisPresenca[alunoId] = Math.max(0, (state.totaisPresenca[alunoId] || 0) - 1)
    }
    renderPresContent()
  } catch(err){
    toast('Erro: ' + err.message, true)
  }
}

// ─── VÍDEOS ─────────────────────────────────────────────────────────────
function renderVideos(){
  const f = state.videos.filter(v => state.filters.vid === 'all' || v.categoria === state.filters.vid)
  const grid = $('vgrid')
  if(!f.length){
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--txt3)">Nenhum vídeo nesta categoria.</div>'
    return
  }
  grid.innerHTML = f.map((v, i) => {
    const ytId = v.src_type === 'youtube' && v.src_url
      ? (v.src_url.includes('/embed/') ? v.src_url.split('/embed/')[1].split('?')[0] : null) : null
    const thumb = ytId
      ? `<img class="yt-thumb" src="https://img.youtube.com/vi/${ytId}/mqdefault.jpg" alt="" onerror="this.style.display='none'">`
      : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:7px;color:var(--surf2)">${PATS[i%PATS.length]}</div>`
    return `<div class="vc" onclick="openVidDetail('${v.id}')">
      <div class="vthumb">${thumb}
        <span class="vbadge">${CAT_LABELS[v.categoria] || v.categoria}</span>
        <div class="vplay"><i class="ti ti-player-play" style="color:var(--txt2);margin-left:2px" aria-hidden="true"></i></div>
      </div>
      <div class="vinfo"><div class="vtitle">${v.titulo}</div><div class="vmeta"><i class="ti ti-clock" style="font-size:10px;vertical-align:-1px;margin-right:3px" aria-hidden="true"></i>${v.duracao || '00:00'}</div></div>
    </div>`
  }).join('')
}

function openVidDetail(id){
  const v = state.videos.find(x => x.id === id)
  if(!v) return
  $('vid-modal-title').textContent = v.titulo

  let preHtml = ''
  if(v.src_type === 'youtube' && v.src_url){
    preHtml = `<iframe src="${v.src_url}?rel=0" allowfullscreen></iframe>`
  } else if(v.src_type === 'file' && v.src_url){
    preHtml = `<video controls style="width:100%;height:100%;object-fit:contain;background:#000"><source src="${v.src_url}"></video>`
  } else {
    preHtml = `<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column">
      <div style="font-size:9px;letter-spacing:3px;text-transform:uppercase;color:var(--txt3);margin-bottom:10px">Sem mídia</div>
      <div style="width:44px;height:44px;border:0.5px solid var(--border2);border-radius:50%;display:flex;align-items:center;justify-content:center"><i class="ti ti-player-play" style="font-size:16px;color:var(--txt2);margin-left:2px" aria-hidden="true"></i></div>
    </div>`
  }

  const profButtons = Auth.isProfessor() ? `
    <button class="ibtn" onclick="openVidModal('${v.id}')"><i class="ti ti-edit" aria-hidden="true"></i> Editar</button>
    <button class="dbtn" onclick="deleteVideo('${v.id}')"><i class="ti ti-trash" aria-hidden="true"></i> Excluir</button>
  ` : ''

  $('vid-modal-content').innerHTML = `
    <div class="vpre">${preHtml}</div>
    <div class="mbody">
      <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--txt3);margin-bottom:6px">${CAT_LABELS[v.categoria] || v.categoria} · ${v.duracao || ''}</div>
      <p style="color:var(--txt2);font-size:12px;line-height:1.7;margin-bottom:10px">${v.descricao || ''}</p>
      <div class="tags">${(v.tags || []).map(t => `<span class="tag">${t}</span>`).join('')}</div>
    </div>
    <div class="mfoot">
      ${profButtons}
      <button class="fbtn" onclick="closeModal('modal-vid')">Fechar</button>
    </div>`
  $('modal-vid').style.display = 'flex'
}

function openVidModal(id){
  state.editingVidId = id
  const v = id ? state.videos.find(x => x.id === id) : null
  state.vidSrcTab = v?.src_type === 'file' ? 'file' : 'youtube'
  $('vid-modal-title').textContent = v ? 'Editar Vídeo' : 'Novo Vídeo'
  renderVidForm(v)
  $('modal-vid').style.display = 'flex'
}

function renderVidForm(v){
  $('vid-modal-content').innerHTML = `
    <div class="mbody">
      <div class="mrow"><label class="mlabel">Título</label><input class="sinput" id="vid-title" value="${v?v.titulo:''}" placeholder="Ex: Armlock da guarda" style="width:100%"></div>
      <div class="mrow"><label class="mlabel">Categoria</label>
        <select class="mselect" id="vid-cat">${Object.entries(CAT_LABELS).map(([k,l])=>`<option value="${k}"${v&&v.categoria===k?' selected':''}>${l}</option>`).join('')}</select>
      </div>
      <div class="mrow"><label class="mlabel">Duração</label><input class="sinput" id="vid-dur" value="${v?v.duracao||'':''}" placeholder="08:30" style="width:100%"></div>
      <div class="mrow"><label class="mlabel">Descrição</label><textarea class="sinput" id="vid-desc" rows="2" style="width:100%;resize:vertical">${v?v.descricao||'':''}</textarea></div>
      <div class="mrow"><label class="mlabel">Tags (separadas por vírgula)</label><input class="sinput" id="vid-tags" value="${v?(v.tags||[]).join(', '):''}" placeholder="Ex: Berimbolo, De La Riva" style="width:100%"></div>
      <div class="mrow"><label class="mlabel">Mídia</label>
        <div class="vid-src-tabs">
          <button class="vs-tab ${state.vidSrcTab==='youtube'?'active':''}" onclick="switchVidTab('youtube')"><i class="ti ti-brand-youtube" aria-hidden="true"></i> YouTube</button>
          <button class="vs-tab ${state.vidSrcTab==='file'?'active':''}" onclick="switchVidTab('file')"><i class="ti ti-link" aria-hidden="true"></i> URL direta</button>
        </div>
        <div id="vid-src-area"></div>
      </div>
    </div>
    <div class="mfoot">
      <button class="fbtn" onclick="closeModal('modal-vid')">Cancelar</button>
      <button class="pbtn" onclick="saveVideo()">Salvar</button>
    </div>`
  renderVidSrcArea(v)
}

function switchVidTab(tab){
  state.vidSrcTab = tab
  document.querySelectorAll('.vs-tab').forEach((t,i) => {
    t.classList.toggle('active', (tab==='youtube'&&i===0) || (tab==='file'&&i===1))
  })
  renderVidSrcArea(state.editingVidId ? state.videos.find(x => x.id === state.editingVidId) : null)
}

function renderVidSrcArea(v){
  const area = $('vid-src-area')
  if(!area) return
  if(state.vidSrcTab === 'youtube'){
    const val = v && v.src_type === 'youtube' ? v.src_url : ''
    area.innerHTML = `<input class="sinput" id="vid-yt-url" value="${val}" placeholder="https://youtube.com/watch?v=..." style="width:100%;margin-top:7px">
      <div style="font-size:10px;color:var(--txt3);margin-top:5px">Cole a URL do YouTube — o player é incorporado automaticamente.</div>`
  } else {
    const val = v && v.src_type === 'file' ? v.src_url : ''
    area.innerHTML = `<input class="sinput" id="vid-file-url" value="${val}" placeholder="https://exemplo.com/video.mp4" style="width:100%;margin-top:7px">
      <div style="font-size:10px;color:var(--txt3);margin-top:5px">Cole a URL direta de um arquivo MP4/WebM.</div>`
  }
}

async function saveVideo(){
  const titulo = $('vid-title').value.trim()
  const categoria = $('vid-cat').value
  const duracao = $('vid-dur').value.trim() || '00:00'
  const descricao = $('vid-desc').value.trim()
  const tags = $('vid-tags').value.split(',').map(t => t.trim()).filter(Boolean)
  if(!titulo){ toast('Título obrigatório.', true); return }

  let src_type = 'none', src_url = ''
  if(state.vidSrcTab === 'youtube'){
    const raw = $('vid-yt-url')?.value.trim() || ''
    if(raw){
      const em = ytEmbedUrl(raw)
      if(!em){ toast('URL do YouTube inválida.', true); return }
      src_type = 'youtube'; src_url = em
    }
  } else {
    const raw = $('vid-file-url')?.value.trim() || ''
    if(raw){ src_type = 'file'; src_url = raw }
  }

  const fields = { titulo, categoria, descricao, duracao, src_type, src_url, tags }
  try {
    if(state.editingVidId){
      await DB.updateVideo(state.editingVidId, fields)
      const i = state.videos.findIndex(v => v.id === state.editingVidId)
      if(i > -1) state.videos[i] = { ...state.videos[i], ...fields }
      toast('Vídeo atualizado!')
    } else {
      const novo = await DB.addVideo(fields)
      state.videos.unshift(novo)
      toast('Vídeo adicionado!')
    }
    closeModal('modal-vid')
    renderVideos()
    state.editingVidId = null
  } catch(err){
    toast('Erro: ' + err.message, true)
  }
}

async function deleteVideo(id){
  if(!confirm('Remover este vídeo?')) return
  try {
    await DB.deleteVideo(id)
    state.videos = state.videos.filter(v => v.id !== id)
    closeModal('modal-vid')
    renderVideos()
    toast('Vídeo removido.')
  } catch(err){
    toast('Erro: ' + err.message, true)
  }
}

// ─── ALUNOS ─────────────────────────────────────────────────────────────
function renderStudents(){
  if(!Auth.isProfessor()) return
  const q = ($('stu-search')?.value || '').toLowerCase()
  const bf = state.filters.stuBelt
  const filtered = state.alunos.filter(s => {
    if(bf !== 'all' && s.faixa !== bf) return false
    if(q && !s.nome.toLowerCase().includes(q)) return false
    return true
  })
  $('stu-body').innerHTML = filtered.length ? filtered.map(s => `<tr class="stu-row-clickable">
    <td style="font-weight:500;color:var(--txt)" onclick="openPerfilAluno('${s.id}', true)"><i class="ti ti-user" style="color:var(--txt3);margin-right:6px"></i>${s.nome}</td>
    <td style="font-size:11px;color:var(--txt3)">${s.email || '—'}</td>
    <td><span class="belt ${s.faixa}"></span><span style="font-size:10px;color:var(--txt3)">${BELT_PT[s.faixa] || s.faixa}${s.grau > 0 ? ' ' + s.grau + 'º' : ''}</span></td>
    <td><span style="font-family:'Bebas Neue',sans-serif;font-size:18px;color:var(--txt)">${state.totaisPresenca[s.id] || 0}</span></td>
    <td style="display:flex;gap:6px">
      <button class="ibtn" onclick="event.stopPropagation();openStuModal('${s.id}')"><i class="ti ti-edit" aria-hidden="true"></i></button>
      <button class="dbtn" onclick="event.stopPropagation();deleteStudent('${s.id}')"><i class="ti ti-trash" aria-hidden="true"></i></button>
    </td>
  </tr>`).join('') : `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--txt3)">Nenhum aluno encontrado.</td></tr>`
}

function openInviteModal(){
  const link = window.location.origin + '/cadastro.html'
  $('invite-link').value = link
  $('modal-invite').style.display = 'flex'
}

async function copyInviteLink(){
  const link = $('invite-link').value
  try {
    await navigator.clipboard.writeText(link)
    const btn = $('copy-btn')
    const orig = btn.innerHTML
    btn.innerHTML = '<i class="ti ti-check" aria-hidden="true"></i> Copiado!'
    setTimeout(() => { btn.innerHTML = orig }, 2000)
    toast('Link copiado!')
  } catch(err){
    // Fallback: seleciona o texto
    $('invite-link').select()
    document.execCommand('copy')
    toast('Link copiado!')
  }
}

function shareWhatsApp(){
  const link = $('invite-link').value
  const msg = `🥋 *Art of BJJ* — cadastre-se no app da academia:\n\n${link}`
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
}

async function shareNative(){
  const link = $('invite-link').value
  if(navigator.share){
    try {
      await navigator.share({
        title: 'Art of BJJ',
        text: 'Cadastre-se no app da academia:',
        url: link
      })
    } catch(err){
      // Usuário cancelou — tudo bem
    }
  } else {
    // Sem API de compartilhamento (desktop) → copia
    copyInviteLink()
  }
}

function openStuModal(id){
  state.editingStuId = id
  const s = state.alunos.find(x => x.id === id)
  if(!s) return
  $('stu-name').value = s.nome
  $('stu-belt').value = s.faixa
  $('modal-stu').style.display = 'flex'
}

async function saveStudent(){
  const nome = $('stu-name').value.trim()
  const faixa = $('stu-belt').value
  if(!nome){ toast('Nome obrigatório.', true); return }
  try {
    await DB.updateAluno(state.editingStuId, { nome, faixa })
    const s = state.alunos.find(x => x.id === state.editingStuId)
    if(s){ s.nome = nome; s.faixa = faixa }
    closeModal('modal-stu')
    renderStudents()
    renderPresContent()
    toast('Aluno atualizado!')
  } catch(err){
    toast('Erro: ' + err.message, true)
  }
}

async function deleteStudent(id){
  if(!confirm('Remover este aluno? Esta ação não pode ser desfeita.')) return
  try {
    await DB.deleteAluno(id)
    state.alunos = state.alunos.filter(s => s.id !== id)
    renderStudents()
    renderPresContent()
    toast('Aluno removido.')
  } catch(err){
    toast('Erro: ' + err.message, true)
  }
}

// ─── MODAL ──────────────────────────────────────────────────────────────
function closeModal(id){
  $(id).style.display = 'none'
  state.pendingFile = null
}

// ════════════════════════════════════════════════════════════════════════
// FASE 3: COMUNICAÇÃO (Mural + Eventos) + GRADUAÇÃO + NOTIFICAÇÕES
// ════════════════════════════════════════════════════════════════════════

let comTab = 'mural'
let perfilAlunoId = null

async function renderComunicacao(){
  const isProf = Auth.isProfessor()
  $('page-comunicacao').innerHTML = `
    <div class="slabel">Avisos da academia</div>
    <div class="stitle">Comunicação</div>
    <div class="com-tabs">
      <button class="com-tab ${comTab==='mural'?'active':''}" onclick="switchComTab('mural')"><i class="ti ti-pin"></i> Mural</button>
      <button class="com-tab ${comTab==='eventos'?'active':''}" onclick="switchComTab('eventos')"><i class="ti ti-calendar-event"></i> Eventos</button>
      <button class="com-tab ${comTab==='notif'?'active':''}" onclick="switchComTab('notif')"><i class="ti ti-bell"></i> Notificações</button>
    </div>
    <div id="com-content"></div>
  `
  if(comTab === 'mural') await renderMural()
  else if(comTab === 'eventos') await renderEventos()
  else if(comTab === 'notif') await renderNotificacoes()
}

function switchComTab(tab){
  comTab = tab
  renderComunicacao()
}

async function renderMural(){
  const isProf = Auth.isProfessor()
  try {
    const recados = await DB.getRecados()
    const c = $('com-content')
    c.innerHTML = `
      <div class="mural-header">
        <div class="mural-count">${recados.length} ${recados.length===1?'recado':'recados'}</div>
        ${isProf ? '<button class="pbtn" onclick="openRecadoModal()"><i class="ti ti-plus"></i> Novo recado</button>' : ''}
      </div>
      <div class="recado-list">
        ${recados.length === 0 ? '<div class="empty-state"><div class="empty-icon"><i class="ti ti-pin"></i></div><div class="empty-title">Nenhum recado</div><div class="empty-text">Os recados aparecerão aqui.</div></div>' :
        recados.map(r => `
          <div class="recado ${r.fixado?'fixed':''}">
            <div class="recado-head">
              <div class="recado-title-area">
                <div class="recado-title">${escapeHtml(r.titulo)}</div>
                <div class="recado-meta">
                  ${r.fixado ? '<span class="recado-pin"><i class="ti ti-pin-filled"></i> Fixado</span><span>·</span>' : ''}
                  <span>${formatDate(r.criado_em)}</span>
                </div>
              </div>
              ${isProf ? `<div class="recado-actions">
                <button class="ibtn" onclick='openRecadoModal(${JSON.stringify(r).replace(/'/g,"&#39;")})'><i class="ti ti-edit"></i></button>
                <button class="dbtn" onclick="deleteRecado('${r.id}')"><i class="ti ti-trash"></i></button>
              </div>` : ''}
            </div>
            <div class="recado-text">${escapeHtml(r.texto)}</div>
          </div>
        `).join('')}
      </div>
    `
  } catch(err){
    $('com-content').innerHTML = `<div style="padding:20px;color:#e05050">Erro: ${err.message}</div>`
  }
}

function openRecadoModal(recado){
  const isEdit = !!recado
  const html = `
    <div class="mlay" id="modal-recado" style="display:flex">
      <div class="mbox">
        <div class="mhead">
          <span class="mtitle">${isEdit?'Editar Recado':'Novo Recado'}</span>
          <button class="mclose" onclick="closeModal('modal-recado')">✕</button>
        </div>
        <div class="mbody">
          <div class="form-row">
            <label class="form-label">Título</label>
            <input class="form-input" id="rec-titulo" value="${isEdit?escapeHtml(recado.titulo):''}">
          </div>
          <div class="form-row">
            <label class="form-label">Mensagem</label>
            <textarea class="form-textarea" id="rec-texto">${isEdit?escapeHtml(recado.texto):''}</textarea>
          </div>
          <div class="toggle-row">
            <div class="toggle-pin">
              <i class="ti ti-pin-filled toggle-pin-icon"></i>
              <div>
                <div class="toggle-pin-title">Fixar no topo</div>
                <div class="toggle-pin-desc">Recado aparece destacado</div>
              </div>
            </div>
            <div class="switch ${isEdit&&recado.fixado?'on':''}" id="rec-fixado" onclick="this.classList.toggle('on')"></div>
          </div>
        </div>
        <div class="mfoot">
          <button class="fbtn" onclick="closeModal('modal-recado')">Cancelar</button>
          <button class="pbtn" onclick="saveRecado('${isEdit?recado.id:''}')"><i class="ti ti-check"></i> Salvar</button>
        </div>
      </div>
    </div>
  `
  // remove modal antigo se existir
  const old = $('modal-recado'); if(old) old.remove()
  document.body.insertAdjacentHTML('beforeend', html)
}

async function saveRecado(id){
  const titulo = $('rec-titulo').value.trim()
  const texto = $('rec-texto').value.trim()
  const fixado = $('rec-fixado').classList.contains('on')
  if(!titulo || !texto){ toast('Preencha título e mensagem.', true); return }
  try {
    if(id) await DB.updateRecado(id, titulo, texto, fixado)
    else await DB.createRecado(titulo, texto, fixado)
    closeModal('modal-recado'); $('modal-recado').remove()
    toast(id?'Recado atualizado.':'Recado criado.')
    renderMural()
  } catch(err){ toast('Erro: '+err.message, true) }
}

async function deleteRecado(id){
  if(!confirm('Excluir este recado?')) return
  try { await DB.deleteRecado(id); toast('Recado excluído.'); renderMural() }
  catch(err){ toast('Erro: '+err.message, true) }
}

// ─── EVENTOS ────────────────────────────────────────────────────────────

async function renderEventos(){
  const isProf = Auth.isProfessor()
  try {
    const eventos = await DB.getEventos()
    $('com-content').innerHTML = `
      <div class="mural-header">
        <div class="mural-count">${eventos.length} ${eventos.length===1?'evento':'eventos'}</div>
        ${isProf ? '<button class="pbtn" onclick="openEventoModal()"><i class="ti ti-plus"></i> Novo evento</button>' : ''}
      </div>
      <div class="recado-list">
        ${eventos.length === 0 ? '<div class="empty-state"><div class="empty-icon"><i class="ti ti-calendar-event"></i></div><div class="empty-title">Nenhum evento</div><div class="empty-text">Seminários e campeonatos aparecerão aqui.</div></div>' :
        eventos.map(e => `
          <div class="recado">
            <div class="recado-head">
              <div class="recado-title-area">
                <div class="recado-title">${escapeHtml(e.titulo)}</div>
                <div class="recado-meta">
                  <span style="text-transform:uppercase;letter-spacing:1px;color:var(--gold,#c8b89a)">${formatDate(e.data_evento)}</span>
                  ${e.horario ? '<span>·</span><span>'+e.horario.slice(0,5)+'</span>' : ''}
                  ${e.local ? '<span>·</span><span>'+escapeHtml(e.local)+'</span>' : ''}
                </div>
              </div>
              ${isProf ? `<div class="recado-actions">
                <button class="ibtn" onclick='openEventoModal(${JSON.stringify(e).replace(/'/g,"&#39;")})'><i class="ti ti-edit"></i></button>
                <button class="dbtn" onclick="deleteEvento('${e.id}')"><i class="ti ti-trash"></i></button>
              </div>` : ''}
            </div>
            ${e.descricao ? '<div class="recado-text">'+escapeHtml(e.descricao)+'</div>' : ''}
          </div>
        `).join('')}
      </div>
    `
  } catch(err){
    $('com-content').innerHTML = `<div style="padding:20px;color:#e05050">Erro: ${err.message}</div>`
  }
}

function openEventoModal(ev){
  const isEdit = !!ev
  const html = `
    <div class="mlay" id="modal-evento" style="display:flex">
      <div class="mbox">
        <div class="mhead">
          <span class="mtitle">${isEdit?'Editar Evento':'Novo Evento'}</span>
          <button class="mclose" onclick="closeModal('modal-evento')">✕</button>
        </div>
        <div class="mbody">
          <div class="form-row">
            <label class="form-label">Título</label>
            <input class="form-input" id="ev-titulo" value="${isEdit?escapeHtml(ev.titulo):''}" placeholder="Ex: Seminário com Alexandre Vieira">
          </div>
          <div class="form-row">
            <label class="form-label">Data</label>
            <input class="form-input" type="date" id="ev-data" value="${isEdit?ev.data_evento:''}">
          </div>
          <div class="form-row">
            <label class="form-label">Horário (opcional)</label>
            <input class="form-input" type="time" id="ev-hora" value="${isEdit&&ev.horario?ev.horario.slice(0,5):''}">
          </div>
          <div class="form-row">
            <label class="form-label">Local (opcional)</label>
            <input class="form-input" id="ev-local" value="${isEdit&&ev.local?escapeHtml(ev.local):''}" placeholder="Ex: Academia ou Ginásio Municipal">
          </div>
          <div class="form-row">
            <label class="form-label">Descrição</label>
            <textarea class="form-textarea" id="ev-desc">${isEdit&&ev.descricao?escapeHtml(ev.descricao):''}</textarea>
          </div>
        </div>
        <div class="mfoot">
          <button class="fbtn" onclick="closeModal('modal-evento')">Cancelar</button>
          <button class="pbtn" onclick="saveEvento('${isEdit?ev.id:''}')"><i class="ti ti-check"></i> Salvar</button>
        </div>
      </div>
    </div>
  `
  const old = $('modal-evento'); if(old) old.remove()
  document.body.insertAdjacentHTML('beforeend', html)
}

async function saveEvento(id){
  const data = {
    titulo: $('ev-titulo').value.trim(),
    data_evento: $('ev-data').value,
    horario: $('ev-hora').value || null,
    local: $('ev-local').value.trim() || null,
    descricao: $('ev-desc').value.trim() || null
  }
  if(!data.titulo || !data.data_evento){ toast('Título e data obrigatórios.', true); return }
  try {
    if(id) await DB.updateEvento(id, data)
    else await DB.createEvento(data)
    closeModal('modal-evento'); $('modal-evento').remove()
    toast(id?'Evento atualizado.':'Evento criado.')
    renderEventos()
  } catch(err){ toast('Erro: '+err.message, true) }
}

async function deleteEvento(id){
  if(!confirm('Excluir este evento?')) return
  try { await DB.deleteEvento(id); toast('Evento excluído.'); renderEventos() }
  catch(err){ toast('Erro: '+err.message, true) }
}

// ─── NOTIFICAÇÕES ────────────────────────────────────────────────────────

async function renderNotificacoes(){
  if(!Auth.currentProfile){ return }
  try {
    const notifs = await DB.getMinhasNotificacoes(Auth.currentProfile.id)
    const naoLidas = notifs.filter(n => !n.lida).length
    $('com-content').innerHTML = `
      <div class="mural-header">
        <div class="mural-count">${notifs.length} ${notifs.length===1?'notificação':'notificações'}${naoLidas?' · <strong style="color:var(--accent)">'+naoLidas+' não lida(s)</strong>':''}</div>
        ${naoLidas ? '<button class="fbtn" onclick="marcarTodasLidas()"><i class="ti ti-check"></i> Marcar todas como lidas</button>' : ''}
      </div>
      <div class="recado-list">
        ${notifs.length === 0 ? '<div class="empty-state"><div class="empty-icon"><i class="ti ti-bell"></i></div><div class="empty-title">Sem notificações</div><div class="empty-text">Você será notificado sobre promoções e novidades.</div></div>' :
        notifs.map(n => `
          <div class="recado ${!n.lida?'fixed':''}" onclick="marcarLida('${n.id}')" style="cursor:pointer">
            <div class="recado-head">
              <div class="recado-title-area">
                <div class="recado-title">${escapeHtml(n.titulo)}</div>
                <div class="recado-meta">
                  ${!n.lida ? '<span class="recado-pin"><i class="ti ti-circle-filled" style="font-size:8px"></i> Nova</span><span>·</span>' : ''}
                  <span>${formatDate(n.criado_em)}</span>
                </div>
              </div>
            </div>
            ${n.texto ? '<div class="recado-text">'+escapeHtml(n.texto)+'</div>' : ''}
          </div>
        `).join('')}
      </div>
    `
  } catch(err){
    $('com-content').innerHTML = `<div style="padding:20px;color:#e05050">Erro: ${err.message}</div>`
  }
}

async function marcarLida(id){
  try { await DB.marcarNotifLida(id); renderNotificacoes() } catch(e){}
}
async function marcarTodasLidas(){
  try { await DB.marcarTodasLidas(Auth.currentProfile.id); toast('Marcadas como lidas.'); renderNotificacoes() } catch(e){}
}

// ═════════════════════════════════════════════════════════════════════════
// PERFIL DO ALUNO + GRADUAÇÃO
// ═════════════════════════════════════════════════════════════════════════

const FAIXAS = [
  { id:'white', nome:'Branca' },
  { id:'blue', nome:'Azul' },
  { id:'purple', nome:'Roxa' },
  { id:'brown', nome:'Marrom' },
  { id:'black', nome:'Preta' }
]

async function openPerfilAluno(alunoId){
  perfilAlunoId = alunoId
  // Esconde todas as páginas e mostra a do perfil
  document.querySelectorAll('.page').forEach(p => p.classList.remove('on'))
  let pageEl = $('page-perfil')
  if(!pageEl){
    document.querySelector('.app').insertAdjacentHTML('beforeend', '<div class="page" id="page-perfil"></div>')
    pageEl = $('page-perfil')
  }
  pageEl.classList.add('on')
  pageEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--txt3)">Carregando...</div>'

  try {
    const aluno = state.alunos.find(a => a.id === alunoId) || Auth.currentProfile
    const [historico, totalAulas] = await Promise.all([
      DB.getHistoricoAluno(alunoId),
      DB.getTotalAulasAluno(alunoId)
    ])

    const isProf = Auth.isProfessor()
    const isSelf = Auth.currentProfile && Auth.currentProfile.id === alunoId
    const ultimaPromocao = historico[0]
    const aulasDesdeUltimaPromocao = ultimaPromocao ? totalAulas - (ultimaPromocao.aulas_acumuladas || 0) : totalAulas
    const initials = (aluno.nome || '?').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()
    const faixaAtual = aluno.faixa || 'white'
    const grauAtual = aluno.grau || 0
    const faixaNome = FAIXAS.find(f=>f.id===faixaAtual)?.nome || 'Branca'

    pageEl.innerHTML = `
      ${isProf ? '<button class="back-btn" onclick="voltarParaAlunos()"><i class="ti ti-arrow-left"></i> Voltar</button>' : ''}
      <div class="slabel">${isSelf?'Meu Perfil':'Perfil do Aluno'}</div>

      <div class="perfil-header">
        <div class="perfil-avatar">${initials}</div>
        <div class="perfil-info">
          <div class="perfil-nome">${escapeHtml(aluno.nome || '?')}</div>
          <div class="perfil-email">${escapeHtml(aluno.email || '')}</div>
          <div class="perfil-faixa-atual">
            <div class="perfil-faixa-display">
              <div class="belt ${faixaAtual}">${grauAtual>0?'<div class="belt-graus">'+'<span></span>'.repeat(grauAtual)+'</div>':''}</div>
              <div>
                <div class="perfil-faixa-nome">FAIXA ${faixaNome.toUpperCase()}</div>
                <div class="perfil-faixa-grau">${grauAtual>0?grauAtual+'º grau · ':''}${ultimaPromocao?'desde '+formatDate(ultimaPromocao.data):''}</div>
              </div>
            </div>
          </div>
          ${isProf && !isSelf ? `<div class="perfil-actions"><button class="pbtn" onclick="openPromoverModal()"><i class="ti ti-arrow-up"></i> Promover</button></div>` : ''}
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-cell">
          <div class="stat-num">${totalAulas}</div>
          <div class="stat-label">Total de aulas</div>
        </div>
        <div class="stat-cell">
          <div class="stat-num">${aulasDesdeUltimaPromocao}</div>
          <div class="stat-label">Desde última promoção</div>
        </div>
        <div class="stat-cell">
          <div class="stat-num">${historico.length}</div>
          <div class="stat-label">Promoções</div>
        </div>
      </div>

      <div class="timeline-header">
        <div class="timeline-title">Histórico de Graduação</div>
      </div>
      <div class="timeline">
        ${historico.length === 0 ? '<div style="padding:20px;text-align:center;color:var(--txt3);font-size:12px">Nenhuma promoção registrada ainda.</div>' :
        `<div class="timeline-list">
          ${historico.map((h, i) => {
            const fnome = FAIXAS.find(f=>f.id===h.faixa)?.nome || h.faixa
            return `<div class="tl-item">
              <div class="tl-marker ${i===0?'current':''}"><i class="ti ti-${i===0?'circle-check-filled':'arrow-up'}"></i></div>
              <div class="tl-content">
                <div class="tl-faixa">
                  <div class="belt ${h.faixa}"></div>
                  <span class="tl-faixa-name">FAIXA ${fnome.toUpperCase()}</span>
                  ${h.grau>0?'<span class="tl-faixa-grau">· '+h.grau+'º grau</span>':''}
                  ${i===0?'<span class="tl-faixa-grau">(atual)</span>':''}
                </div>
                <div class="tl-date">${formatDate(h.data)}</div>
                ${h.nota?'<div class="tl-note">"'+escapeHtml(h.nota)+'"</div>':''}
                <div class="tl-aulas">${h.aulas_acumuladas||0} aulas acumuladas</div>
              </div>
            </div>`
          }).join('')}
        </div>`}
      </div>
    `
  } catch(err){
    pageEl.innerHTML = `<div style="padding:20px;color:#e05050">Erro: ${err.message}</div>`
  }
}

function voltarParaAlunos(){
  document.querySelectorAll('.page').forEach(p => p.classList.remove('on'))
  $('page-students').classList.add('on')
  $('nav-bar').querySelectorAll('.nb').forEach(b => {
    b.classList.toggle('active', b.dataset.page === 'students')
  })
}

function openPerfilSelf(){
  if(Auth.currentProfile) openPerfilAluno(Auth.currentProfile.id)
}

// Modal de promoção
let promoSel = { faixa:'white', grau:0 }

function openPromoverModal(){
  const aluno = state.alunos.find(a => a.id === perfilAlunoId)
  if(!aluno) return
  promoSel = { faixa: aluno.faixa || 'white', grau: aluno.grau || 0 }
  const today = new Date().toISOString().slice(0,10)
  const html = `
    <div class="mlay" id="modal-promover" style="display:flex">
      <div class="mbox">
        <div class="mhead">
          <span class="mtitle">Promover ${escapeHtml(aluno.nome)}</span>
          <button class="mclose" onclick="closeModal('modal-promover')">✕</button>
        </div>
        <div class="mbody">
          <div class="form-row">
            <label class="form-label">Nova faixa</label>
            <div class="promo-faixas" id="promo-faixas">
              ${FAIXAS.map(f => `
                <div class="promo-faixa-opt ${f.id===promoSel.faixa?'active':''}" data-faixa="${f.id}" onclick="selectPromoFaixa('${f.id}')">
                  <div class="belt ${f.id}"></div>
                  <div class="promo-faixa-opt-name">${f.nome}</div>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="form-row">
            <label class="form-label">Novo grau</label>
            <div class="promo-grau-row" id="promo-graus">
              ${[0,1,2,3,4].map(g => `
                <button class="promo-grau-btn ${g===promoSel.grau?'active':''}" data-grau="${g}" onclick="selectPromoGrau(${g})">${g}</button>
              `).join('')}
            </div>
          </div>
          <div class="form-row">
            <label class="form-label">Nota (opcional)</label>
            <textarea class="form-textarea" id="promo-nota" style="min-height:70px" placeholder="Ex: Evolução técnica notável..."></textarea>
          </div>
          <div class="form-row">
            <label class="form-label">Data da promoção</label>
            <input class="form-input" type="date" id="promo-data" value="${today}">
          </div>
        </div>
        <div class="mfoot">
          <button class="fbtn" onclick="closeModal('modal-promover')">Cancelar</button>
          <button class="pbtn" onclick="confirmarPromover()"><i class="ti ti-check"></i> Confirmar</button>
        </div>
      </div>
    </div>
  `
  const old = $('modal-promover'); if(old) old.remove()
  document.body.insertAdjacentHTML('beforeend', html)
}

function selectPromoFaixa(f){
  promoSel.faixa = f
  document.querySelectorAll('#promo-faixas .promo-faixa-opt').forEach(el => {
    el.classList.toggle('active', el.dataset.faixa === f)
  })
}
function selectPromoGrau(g){
  promoSel.grau = g
  document.querySelectorAll('#promo-graus .promo-grau-btn').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.grau) === g)
  })
}

async function confirmarPromover(){
  const nota = $('promo-nota').value.trim()
  const data = $('promo-data').value
  if(!data){ toast('Selecione a data.', true); return }
  try {
    const totalAulas = await DB.getTotalAulasAluno(perfilAlunoId)
    await DB.promoverAluno(perfilAlunoId, promoSel.faixa, promoSel.grau, nota || null, data, totalAulas)
    // Atualiza no state
    const aluno = state.alunos.find(a => a.id === perfilAlunoId)
    if(aluno){ aluno.faixa = promoSel.faixa; aluno.grau = promoSel.grau }
    closeModal('modal-promover'); $('modal-promover').remove()
    toast('Aluno promovido!')
    openPerfilAluno(perfilAlunoId)
  } catch(err){ toast('Erro: '+err.message, true) }
}

// ─── UTILS ──────────────────────────────────────────────────────────────

function escapeHtml(s){
  if(s == null) return ''
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))
}
function formatDate(d){
  if(!d) return ''
  const dt = new Date(d)
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${dt.getDate()} ${meses[dt.getMonth()]} ${dt.getFullYear()}`
}

// ════════════════════════════════════════════════════════════════════════
// FASE 3: MURAL DE RECADOS
// ════════════════════════════════════════════════════════════════════════

const state_mural = { recados: [], editing: null }

async function renderComunicacao(){
  try {
    state_mural.recados = await DB.getRecados()
    renderMural()
  } catch(err){
    console.error('[mural]', err)
    $('mural-list').innerHTML = `<div class="empty-state"><div class="empty-text" style="color:#e05050">Erro ao carregar: ${err.message}</div></div>`
  }
}

function renderMural(){
  const recs = state_mural.recados
  $('mural-count').textContent = recs.length === 1 ? '1 recado' : recs.length + ' recados'
  const isProf = Auth.isProfessor()

  if(recs.length === 0){
    $('mural-list').innerHTML = `<div class="empty-state" style="text-align:center;padding:60px 20px;background:var(--surf);border:0.5px dashed var(--border);border-radius:2px">
      <i class="ti ti-pin" style="font-size:36px;color:var(--txt3);margin-bottom:12px;display:block"></i>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:2px;color:var(--txt2);margin-bottom:6px">Nenhum recado ainda</div>
      <div style="font-size:12px;color:var(--txt3)">${isProf ? 'Clique em "Novo recado" para começar.' : 'Aguarde avisos do professor.'}</div>
    </div>`
    return
  }

  $('mural-list').innerHTML = recs.map(r => {
    const d = new Date(r.criado_em)
    const dataStr = `${d.getDate()} ${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][d.getMonth()]} ${d.getFullYear()}`
    return `<div class="recado ${r.fixado ? 'fixed' : ''}">
      <div class="recado-head">
        <div class="recado-title-area">
          <div class="recado-title">${escapeHtml(r.titulo)}</div>
          <div class="recado-meta">
            ${r.fixado ? '<span class="recado-pin"><i class="ti ti-pin-filled"></i> Fixado</span><span>·</span>' : ''}
            <span>${dataStr}</span>
          </div>
        </div>
        ${isProf ? `<div class="recado-actions">
          <button class="ibtn" onclick="openRecadoModal('${r.id}')"><i class="ti ti-edit"></i></button>
          <button class="dbtn" onclick="deleteRecado('${r.id}')"><i class="ti ti-trash"></i></button>
        </div>` : ''}
      </div>
      <div class="recado-text">${escapeHtml(r.texto)}</div>
    </div>`
  }).join('')
}

function escapeHtml(s){ return (s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])) }

function openRecadoModal(id){
  state_mural.editing = id
  if(id){
    const r = state_mural.recados.find(x => x.id === id)
    if(!r) return
    $('rec-title').textContent = 'Editar Recado'
    $('rec-titulo').value = r.titulo
    $('rec-texto').value = r.texto
    $('rec-switch').classList.toggle('on', !!r.fixado)
  } else {
    $('rec-title').textContent = 'Novo Recado'
    $('rec-titulo').value = ''
    $('rec-texto').value = ''
    $('rec-switch').classList.remove('on')
  }
  $('modal-recado').style.display = 'flex'
}

async function saveRecado(){
  const titulo = $('rec-titulo').value.trim()
  const texto = $('rec-texto').value.trim()
  const fixado = $('rec-switch').classList.contains('on')
  if(!titulo || !texto){ toast('Preencha título e mensagem.', true); return }
  try {
    if(state_mural.editing){
      await DB.updateRecado(state_mural.editing, { titulo, texto, fixado })
      toast('Recado atualizado!')
    } else {
      await DB.createRecado(titulo, texto, fixado)
      toast('Recado publicado!')
    }
    closeModal('modal-recado')
    await renderComunicacao()
  } catch(err){
    toast('Erro: ' + err.message, true)
  }
}

async function deleteRecado(id){
  if(!confirm('Excluir este recado?')) return
  try {
    await DB.deleteRecado(id)
    toast('Recado excluído.')
    await renderComunicacao()
  } catch(err){
    toast('Erro: ' + err.message, true)
  }
}

// ════════════════════════════════════════════════════════════════════════
// FASE 3: PERFIL DO ALUNO + GRADUAÇÃO
// ════════════════════════════════════════════════════════════════════════

const state_perfil = { aluno: null, historico: [], totalAulas: 0, promo: { faixa:null, grau:0 } }

const FAIXA_PT = { white:'BRANCA', blue:'AZUL', purple:'ROXA', brown:'MARROM', black:'PRETA' }
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function iniciais(nome){
  return (nome||'?').split(' ').filter(Boolean).slice(0,2).map(p => p[0]).join('').toUpperCase()
}

function mesesEntre(dataIso){
  const d = new Date(dataIso)
  const now = new Date()
  let m = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
  return Math.max(0, m)
}

function formatTempoNoGrau(meses){
  if(meses < 1) return '<1m'
  if(meses < 12) return meses + 'm'
  const anos = Math.floor(meses / 12)
  const m = meses % 12
  return anos + 'a' + (m > 0 ? ' ' + m + 'm' : '')
}

async function openPerfilAluno(alunoId, fromList){
  try {
    const aluno = state.alunos.find(a => a.id === alunoId) || { id: alunoId }
    if(!aluno.nome && !Auth.isProfessor()){
      // Aluno vendo o próprio perfil - busca via auth
      aluno.nome = Auth.currentProfile?.nome
      aluno.email = Auth.currentProfile?.email
      aluno.faixa = Auth.currentProfile?.faixa
      aluno.grau = Auth.currentProfile?.grau
    }
    state_perfil.aluno = aluno
    state_perfil.historico = await DB.getHistoricoGraduacao(alunoId)
    state_perfil.totalAulas = await DB.getTotalAulasAluno(alunoId)

    $('perfil-back').style.display = fromList ? 'inline-flex' : 'none'
    $('perfil-label').textContent = fromList ? 'Perfil do Aluno' : 'Meu Perfil'
    renderPerfil()

    // Ativa a aba perfil se não estiver
    document.querySelectorAll('.page').forEach(p => p.classList.remove('on'))
    $('page-perfil').classList.add('on')
  } catch(err){
    toast('Erro: ' + err.message, true)
  }
}

function openPerfilSelf(){
  if(Auth.currentProfile) openPerfilAluno(Auth.currentProfile.id, false)
}

function closeFinalPerfil(){
  // Volta pra lista de alunos
  document.querySelectorAll('.page').forEach(p => p.classList.remove('on'))
  document.querySelectorAll('.nb').forEach(b => b.classList.remove('active'))
  const navStu = document.querySelector('.nb[data-page="students"]')
  if(navStu){
    navStu.classList.add('active')
    $('page-students').classList.add('on')
  }
}

function renderBeltGraus(grau){
  const g = Math.min(4, Math.max(0, grau || 0))
  if(g === 0) return ''
  return `<div class="belt-graus">${'<span></span>'.repeat(g)}</div>`
}

function renderPerfil(){
  const a = state_perfil.aluno
  const hist = state_perfil.historico
  const isProf = Auth.isProfessor()
  const faixaAtual = a.faixa || 'white'
  const grauAtual = a.grau || 0
  const ultimaPromo = hist[0]
  const aulasDesde = ultimaPromo ? state_perfil.totalAulas - (ultimaPromo.aulas_acumuladas || 0) : state_perfil.totalAulas
  const tempoMeses = ultimaPromo ? mesesEntre(ultimaPromo.data) : 0
  const dataDesde = ultimaPromo ? new Date(ultimaPromo.data) : null
  const dataDesdeStr = dataDesde ? `${MESES[dataDesde.getMonth()]}/${String(dataDesde.getFullYear()).slice(2)}` : '—'

  $('perfil-content').innerHTML = `
    <div class="perfil-header">
      <div class="perfil-avatar">${iniciais(a.nome)}</div>
      <div class="perfil-info">
        <div class="perfil-nome">${escapeHtml(a.nome || '—')}</div>
        <div class="perfil-email">${escapeHtml(a.email || '')}</div>
        <div class="perfil-faixa-atual">
          <div class="perfil-faixa-display">
            <div class="belt ${faixaAtual}">${renderBeltGraus(grauAtual)}</div>
            <div>
              <div class="perfil-faixa-nome">FAIXA ${FAIXA_PT[faixaAtual] || '—'}</div>
              <div class="perfil-faixa-grau">${grauAtual > 0 ? grauAtual + 'º grau · ' : ''}desde ${dataDesdeStr}</div>
            </div>
          </div>
        </div>
        ${isProf ? `<div class="perfil-actions">
          <button class="pbtn" onclick="openPromoverModal()"><i class="ti ti-arrow-up"></i> Promover</button>
        </div>` : ''}
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-cell">
        <div class="stat-num">${state_perfil.totalAulas}</div>
        <div class="stat-label">Total de aulas</div>
        <div class="stat-sub">Desde o cadastro</div>
      </div>
      <div class="stat-cell">
        <div class="stat-num">${aulasDesde}</div>
        <div class="stat-label">Desde a promoção</div>
        <div class="stat-sub">${ultimaPromo ? FAIXA_PT[ultimaPromo.faixa] + (ultimaPromo.grau ? ' ' + ultimaPromo.grau + 'º' : '') : '—'}</div>
      </div>
      <div class="stat-cell">
        <div class="stat-num">${formatTempoNoGrau(tempoMeses)}</div>
        <div class="stat-label">No grau atual</div>
        <div class="stat-sub">${tempoMeses} ${tempoMeses === 1 ? 'mês' : 'meses'}</div>
      </div>
    </div>

    <div class="timeline-header">
      <div class="timeline-title">Histórico de Graduação</div>
    </div>
    <div class="timeline">
      ${hist.length === 0 ? `<div style="text-align:center;padding:20px;color:var(--txt3);font-size:12px">Nenhuma promoção registrada ainda.</div>` : `
      <div class="timeline-list">
        ${hist.map((h, i) => {
          const d = new Date(h.data)
          const dataStr = `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`
          return `<div class="tl-item">
            <div class="tl-marker ${i === 0 ? 'current' : ''}">
              <i class="ti ${i === 0 ? 'ti-circle-check-filled' : 'ti-arrow-up'}"></i>
            </div>
            <div class="tl-content">
              <div class="tl-faixa">
                <div class="belt ${h.faixa}"></div>
                <span class="tl-faixa-name">FAIXA ${FAIXA_PT[h.faixa] || h.faixa}</span>
                ${h.grau > 0 ? `<span class="tl-faixa-grau">· ${h.grau}º grau</span>` : ''}
                ${i === 0 ? '<span class="tl-faixa-grau">· atual</span>' : ''}
                ${isProf ? `<button class="dbtn" style="margin-left:auto;padding:3px 6px;font-size:10px" onclick="deleteGraduacao('${h.id}')"><i class="ti ti-trash"></i></button>` : ''}
              </div>
              <div class="tl-date">${dataStr}</div>
              ${h.nota ? `<div class="tl-note">"${escapeHtml(h.nota)}"</div>` : ''}
              ${h.aulas_acumuladas ? `<div class="tl-aulas">${h.aulas_acumuladas} aulas acumuladas</div>` : ''}
            </div>
          </div>`
        }).join('')}
      </div>`}
    </div>
  `
}

function openPromoverModal(){
  const a = state_perfil.aluno
  state_perfil.promo = { faixa: a.faixa || 'white', grau: a.grau || 0 }

  $('pro-title').textContent = 'Promover ' + (a.nome || 'Aluno')
  $('pro-atual').innerHTML = `
    <div style="background:var(--surf2);border:0.5px solid var(--border);border-radius:2px;padding:12px 14px;margin-bottom:var(--sp-4);display:flex;align-items:center;gap:10px">
      <div class="belt ${a.faixa || 'white'}">${renderBeltGraus(a.grau)}</div>
      <div>
        <div style="font-size:11px;color:var(--txt2)">Atual: <strong style="color:var(--txt)">${FAIXA_PT[a.faixa||'white']} ${a.grau > 0 ? a.grau + 'º grau' : ''}</strong></div>
        <div style="font-size:10px;color:var(--txt3);margin-top:2px">${state_perfil.totalAulas} aulas acumuladas</div>
      </div>
    </div>
  `

  // Marcar atual
  document.querySelectorAll('#pro-faixas .promo-faixa-opt').forEach(el => {
    el.classList.toggle('active', el.dataset.faixa === state_perfil.promo.faixa)
    el.onclick = () => {
      document.querySelectorAll('#pro-faixas .promo-faixa-opt').forEach(x => x.classList.remove('active'))
      el.classList.add('active')
      state_perfil.promo.faixa = el.dataset.faixa
    }
  })
  document.querySelectorAll('#pro-graus .promo-grau-btn').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.grau) === state_perfil.promo.grau)
    el.onclick = () => {
      document.querySelectorAll('#pro-graus .promo-grau-btn').forEach(x => x.classList.remove('active'))
      el.classList.add('active')
      state_perfil.promo.grau = parseInt(el.dataset.grau)
    }
  })

  $('pro-nota').value = ''
  $('pro-data').value = new Date().toISOString().slice(0, 10)
  $('modal-promover').style.display = 'flex'
}

async function confirmarPromocao(){
  const { faixa, grau } = state_perfil.promo
  const data = $('pro-data').value
  const nota = $('pro-nota').value.trim() || null
  const a = state_perfil.aluno
  if(!faixa || !data){ toast('Faixa e data são obrigatórias.', true); return }
  try {
    await DB.promoverAluno(a.id, faixa, grau, data, nota, state_perfil.totalAulas)
    // Atualizar local
    a.faixa = faixa
    a.grau = grau
    // Atualizar lista de alunos
    const idx = state.alunos.findIndex(x => x.id === a.id)
    if(idx >= 0){ state.alunos[idx].faixa = faixa; state.alunos[idx].grau = grau }
    toast('Aluno promovido!')
    closeModal('modal-promover')
    // Recarregar perfil
    await openPerfilAluno(a.id, $('perfil-back').style.display !== 'none')
  } catch(err){
    toast('Erro: ' + err.message, true)
  }
}

async function deleteGraduacao(id){
  if(!confirm('Excluir esta promoção do histórico?')) return
  try {
    await DB.deleteGraduacao(id)
    toast('Promoção removida.')
    await openPerfilAluno(state_perfil.aluno.id, $('perfil-back').style.display !== 'none')
  } catch(err){
    toast('Erro: ' + err.message, true)
  }
}

// ─── BOOT ───────────────────────────────────────────────────────────────
boot()
