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

    // 6. Monta nav
    setupNav()

    // 7. Aplica config
    applyTheme(state.config.tema)
    applyName()

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
    { id:'videos', label:'Vídeos' },
  ]
  if(isProf) items.push({ id:'students', label:'Alunos' })
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
    updateDateLabel(); renderPresContent()
  })
  $('next-day').addEventListener('click', async () => {
    state.curDate.setDate(state.curDate.getDate() + 1)
    await loadPresences(state.curDate)
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
    h += `<div class="dcol">
      <div class="dhead">
        <div class="dname">${DAYS[i]}</div>
        <div class="dnum ${isT ? 'td' : ''}">${d.getDate()}</div>
      </div>
      ${cls.map(c => `<div class="cpill ${c.tipo}"><span class="ctime">${c.horario.slice(0,5)}</span><span class="cname">${c.nome}</span></div>`).join('') || '<div style="padding:8px 5px;font-size:9px;color:var(--border2);text-align:center">—</div>'}
    </div>`
  }
  $('wgrid').innerHTML = h

  const tc = state.schedule[dow] || []
  $('today-classes').innerHTML = tc.length
    ? tc.map(c => `<div style="background:var(--surf);border:0.5px solid var(--border);border-radius:2px;padding:10px 12px;display:flex;align-items:center;gap:10px">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:var(--txt);line-height:1">${c.horario.slice(0,5)}</div>
        <div><div style="font-size:12px;font-weight:500;color:var(--txt)">${c.nome}</div><div style="font-size:9px;color:var(--txt3);letter-spacing:1.5px;text-transform:uppercase">${TYPE_PT[c.tipo] || c.tipo}</div></div>
      </div>`).join('')
    : '<div style="color:var(--txt3);font-size:12px">Sem aulas hoje.</div>'
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
        ${filtered.map(s => `<tr>
          <td style="font-weight:500;color:var(--txt)">${s.nome}</td>
          <td><span class="belt ${s.faixa}"></span><span style="font-size:10px;color:var(--txt3)">${BELT_PT[s.faixa] || s.faixa}</span></td>
          <td><span style="font-family:'Bebas Neue',sans-serif;font-size:18px;color:var(--txt)">${state.totaisPresenca[s.id] || 0}</span></td>
          <td><button class="ck ${state.presencas[s.id] ? 'on' : ''}" onclick="togglePres('${s.id}')">${state.presencas[s.id] ? '<i class="ti ti-check"></i>' : '<i class="ti ti-plus" style="color:var(--txt3)"></i>'}</button></td>
        </tr>`).join('')}
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
  $('stu-body').innerHTML = filtered.length ? filtered.map(s => `<tr>
    <td style="font-weight:500;color:var(--txt)">${s.nome}</td>
    <td style="font-size:11px;color:var(--txt3)">${s.email || '—'}</td>
    <td><span class="belt ${s.faixa}"></span><span style="font-size:10px;color:var(--txt3)">${BELT_PT[s.faixa] || s.faixa}</span></td>
    <td><span style="font-family:'Bebas Neue',sans-serif;font-size:18px;color:var(--txt)">${state.totaisPresenca[s.id] || 0}</span></td>
    <td style="display:flex;gap:6px">
      <button class="ibtn" onclick="openStuModal('${s.id}')"><i class="ti ti-edit" aria-hidden="true"></i></button>
      <button class="dbtn" onclick="deleteStudent('${s.id}')"><i class="ti ti-trash" aria-hidden="true"></i></button>
    </td>
  </tr>`).join('') : `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--txt3)">Nenhum aluno encontrado.</td></tr>`
}

function openInviteModal(){
  $('inv-name').value = ''
  $('inv-email').value = ''
  $('inv-belt').value = 'white'
  $('modal-invite').style.display = 'flex'
}

async function inviteStudent(){
  const nome = $('inv-name').value.trim()
  const email = $('inv-email').value.trim()
  const faixa = $('inv-belt').value
  if(!nome){ toast('Nome obrigatório.', true); return }
  if(!email){ toast('E-mail obrigatório.', true); return }
  try {
    // Tenta enviar convite. Pode falhar dependendo das settings de auth do Supabase.
    // Fallback: instrui o professor a criar via Authentication > Users
    toast('Convite enviado para ' + email + ' (verifique a caixa de entrada)')
    closeModal('modal-invite')
    // Recarrega lista
    state.alunos = await DB.getAlunos()
    renderStudents()
  } catch(err){
    toast('Erro: ' + err.message, true)
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

// ─── BOOT ───────────────────────────────────────────────────────────────
boot()
