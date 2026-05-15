# Art of BJJ — App de Gestão para Academia de Jiu-Jitsu

PWA (Progressive Web App) que funciona como app instalável no celular.
Stack: HTML/CSS/JS puro + Supabase (banco/auth) + Vercel (hospedagem).

## Estrutura

```
bjj-app/
├── index.html              # Tela de login
├── app.html                # App principal
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
├── vercel.json             # Config do Vercel
├── supabase_schema.sql     # Script SQL (rodar UMA vez no Supabase)
├── css/
│   └── app.css
├── js/
│   ├── config.js           # Credenciais do Supabase
│   ├── auth.js             # Login/logout/sessão
│   ├── db.js               # Queries no Supabase
│   └── app.js              # Lógica da UI
└── icons/
    ├── icon-192.png
    ├── icon-512.png
    └── icon-512-maskable.png
```

## Como subir no Vercel

1. Crie um repositório novo no GitHub (privado de preferência)
2. Faça upload de todos esses arquivos para o repositório
3. No Vercel: New Project → conecte o repositório
4. Não precisa configurar nada extra — o Vercel detecta como estático automaticamente
5. Deploy! O app vai estar em `https://seu-projeto.vercel.app`

## Como instalar no celular

**Android (Chrome):**
1. Abra o link no Chrome
2. Toque no menu (3 pontinhos) → "Adicionar à tela inicial"
3. O app aparece como ícone normal

**iOS (Safari):**
1. Abra o link no Safari
2. Toque no ícone de compartilhar (quadrado com seta para cima)
3. Role e toque em "Adicionar à Tela de Início"

## Como convidar alunos

Por enquanto, manualmente:
1. Vá no painel do Supabase → Authentication → Users → "Add user"
2. Crie a conta do aluno (Auto Confirm User: ✓)
3. O aluno entra no app com e-mail e a senha que você definiu

## Conta de teste para validar

Para testar como aluno:
1. Crie um segundo usuário no Supabase (Authentication → Users)
2. Não promova ele a professor — ele permanece como aluno
3. Faça login com a conta dele para ver a interface simplificada
