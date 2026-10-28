// Prints do README: abre o app compilado (out/) com uma pasta de dados própria, roda
// migrações de verdade contra as contas públicas de teste do imapsync (test1 → test2) e
// salva PNGs em docs/img/. Leva uns 5 minutos (cada execução do imapsync demora ~30 s para
// começar). Cada rodada copia para subpastas novas no test2 (gui_readme_<hora>_*).
// Uso: npm run screenshots
const { app, BrowserWindow } = require('electron')
const { appendFileSync, mkdirSync, rmSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')

const root = resolve(__dirname, '..')
const userData = join(root, '.demo')
rmSync(userData, { recursive: true, force: true })
mkdirSync(userData, { recursive: true })
const out = join(root, 'docs', 'img')
mkdirSync(out, { recursive: true })
app.setPath('userData', userData)
// rodando como `electron scripts/screenshots.cjs`, o Electron acharia que o app é a pasta
// scripts/ (sem vendor/ e sem o package.json): aponta para a raiz do projeto
const pkg = require('../package.json')
app.getAppPath = () => root
app.getVersion = () => pkg.version
app.getName = () => pkg.productName
require('../out/main/index.js')

const stamp = new Date().toISOString().slice(5, 16).replace(/\D/g, '')
// pastas pequenas da conta test1, para cada migração terminar em ~1 min
const FOLDERS = '--folder INBOX.Urlaub --folder Borrador'
const csv = join(userData, 'contas.csv')
writeFileSync(
  csv,
  [
    'host1,user1,password1,host2,user2,password2,extra',
    ...['comercial', 'financeiro', 'diretoria', 'suporte'].map(
      (name) =>
        `test1.lamiral.info,test1,secret1,test2.lamiral.info,test2,secret2,--subfolder2 gui_readme_${stamp}_${name} ${FOLDERS}`,
    ),
  ].join('\r\n'),
)

// o stdout do Electron não chega ao terminal no Windows: o andamento vai para .demo/screenshots.log
const log = (msg) =>
  appendFileSync(
    join(userData, 'screenshots.log'),
    `${new Date().toISOString()} ${msg}
`,
  )

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  let win
  while (!(win = BrowserWindow.getAllWindows()[0])) await wait(100)
  win.setSize(1360, 900)
  await new Promise((r) => win.webContents.once('did-finish-load', r))
  await wait(1500)
  const js = (code) => win.webContents.executeJavaScript(code, true)

  /** Clica no último botão visível cujo texto começa com `label` (o do diálogo vem por último). */
  const click = async (label, scope = 'button') => {
    const ok = await js(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(scope)})]
        .filter((b) => b.textContent.trim().startsWith(${JSON.stringify(label)}) && !b.disabled)
      const el = els[els.length - 1]
      if (!el) return false
      el.click()
      return true
    })()`)
    if (!ok) log(`não achei "${label}"`)
    await wait(600)
  }
  /** Preenche o campo (input/select/textarea) do <label> que começa com `label`, na seção `section`. */
  const fill = (section, label, value) =>
    js(`(() => {
      const sec = [...document.querySelectorAll('section')]
        .find((s) => s.querySelector('h2')?.textContent.trim() === ${JSON.stringify(section)})
      const lab = [...(sec ?? document).querySelectorAll('label')]
        .find((l) => l.textContent.trim().startsWith(${JSON.stringify(label)}))
      const el = lab?.querySelector('input, select, textarea')
      if (!el) return false
      const proto = Object.getPrototypeOf(el)
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
      return true
    })()`).then((ok) => ok || log(`não achei o campo "${label}" em ${section}`))
  /** Espera até `predicate` (código JS) ser verdadeiro na página. */
  const until = async (predicate, timeoutMs = 240_000) => {
    const end = Date.now() + timeoutMs
    while (Date.now() < end) {
      if (await js(`Boolean(${predicate})`)) return
      await wait(1000)
    }
    log(`tempo esgotado esperando: ${predicate}`)
  }
  const pageHas = (text) => `document.body.innerText.includes(${JSON.stringify(text)})`
  const scrollTo = (selector) =>
    js(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: 'start' })`)
  const shot = async (name) => {
    await wait(900)
    const image = await win.webContents.capturePage()
    writeFileSync(join(out, `${name}.png`), image.toPNG())
    log(`docs/img/${name}.png (${await js('document.querySelector("h1")?.textContent')})`)
  }

  // perfis usados nos prints (o destino de teste entrega o certificado do test1)
  await js(`window.migramail.invoke('profiles:save', {
    name: 'Servidor antigo', host: 'test1.lamiral.info', port: 993, security: 'ssl',
    preset: 'none', allowInvalidCert: false, extraArgs: '' })`)
  await js(`window.migramail.invoke('profiles:save', {
    name: 'Servidor novo', host: 'test2.lamiral.info', port: 993, security: 'ssl',
    preset: 'none', allowInvalidCert: true, extraArgs: '' })`)
  win.webContents.reload()
  await new Promise((r) => win.webContents.once('did-finish-load', r))
  await wait(1500)

  // ---- Uma conta ----
  await click('Uma conta')
  await fill('Origem', 'Perfil', (await profileId(js, 'Servidor antigo')) ?? '')
  await fill('Origem', 'Usuário', 'test1')
  await fill('Origem', 'Senha', 'secret1')
  await fill('Destino', 'Perfil', (await profileId(js, 'Servidor novo')) ?? '')
  await fill('Destino', 'Usuário', 'test2')
  await fill('Destino', 'Senha', 'secret2')
  await fill('Opções', 'Copiar tudo para dentro da pasta', `gui_readme_${stamp}_uma`)
  await fill('Opções', 'Só estas pastas', 'INBOX.Urlaub\nBorrador')
  await wait(500)
  await js('document.querySelector("main").scrollTo(0, 0)')
  await shot('uma-conta')

  await click('Medir tamanho')
  await until(pageHas('Medição concluída'))
  await click('Pastas', '[role=tab]')
  await scrollTo('main section[aria-label]')
  await shot('medir-tamanho')

  await click('Migrar')
  await click('Migrar', '[role=dialog] button')
  await until(pageHas('Copiando pasta'))
  await wait(4000)
  await scrollTo('main section[aria-label]')
  await shot('migrando')
  await until(
    `!${pageHas('Copiando pasta')} && !${pageHas('Concluindo')} && !${pageHas('Medição final')}`,
  )
  await wait(2500)
  await scrollTo('main section[aria-label]')
  await shot('migracao-concluida')

  // ---- Várias contas ----
  await click('Várias contas')
  const dbg = win.webContents.debugger
  dbg.attach('1.3')
  const { root: doc } = await dbg.sendCommand('DOM.getDocument')
  const { nodeId } = await dbg.sendCommand('DOM.querySelector', {
    nodeId: doc.nodeId,
    selector: 'input[type=file]',
  })
  await dbg.sendCommand('DOM.setFileInputFiles', { nodeId, files: [csv] })
  dbg.detach()
  await wait(1500)
  await fill(null, 'Modo', 'migrate')
  await fill(null, 'Em paralelo', '2')
  // rótulos das linhas (o CSV do imapsync não tem coluna de rótulo)
  await js(`(() => {
    const names = ['Comercial', 'Financeiro', 'Diretoria', 'Suporte']
    document.querySelectorAll('input[aria-label="Rótulo"]').forEach((el, i) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, names[i] ?? '')
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
  })()`)
  await wait(800)
  await shot('varias-contas')

  await click('Iniciar todas')
  log(`diálogo: ${await js('document.querySelector("[role=dialog]")?.innerText')}`)
  await click('Iniciar', '[role=dialog] button')
  log(`depois de iniciar: ${await js('document.querySelector("h1")?.textContent')}`)
  await until(pageHas('Copiando pasta'))
  await wait(5000)
  await shot('lote-rodando')
  await until(`document.body.innerText.split('Concluído').length > 4`, 400_000)
  await wait(2500)
  await shot('lote-concluido')

  // ---- Perfis e Sobre ----
  await click('Perfis')
  await click('Servidor novo')
  await shot('perfis')
  await click('Sobre')
  await until(pageHas('imapsync 2.'))
  await shot('sobre')

  app.quit()
}

/** id do perfil pelo nome (o <select> do perfil usa o id como valor). */
async function profileId(js, name) {
  return js(`window.migramail.invoke('profiles:list').then((r) =>
    r.ok ? (r.data.find((p) => p.name === ${JSON.stringify(name)})?.id ?? null) : null)`)
}

app.whenReady().then(() =>
  main().catch((err) => {
    log(err.stack)
    app.exit(1)
  }),
)
