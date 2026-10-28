import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { BrowserWindow, app, shell, type Session } from 'electron'

const devServerUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL']
const rendererDir = join(__dirname, '../renderer')
const preload = join(__dirname, '../preload/index.js')

// Mesmas cores de src/renderer/styles/tokens.css (--bg-elevated e --text-2).
export const THEME = { background: '#0b0e14', titleBar: '#0b0e14', symbol: '#c4cbd6' } as const
const TITLE_BAR_HEIGHT = 36

/** Mesma política do <meta> do index.html; em produção vai também no cabeçalho. */
export const CSP =
  "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
  "script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'"

let main: BrowserWindow | undefined

/** URL pertence ao app: dev server do electron-vite (só em dev) ou arquivos do renderer empacotado. */
export function isAppUrl(url: string): boolean {
  if (devServerUrl) return url.startsWith(devServerUrl.replace(/\/?$/, '/'))
  return url.startsWith(pathToFileURL(rendererDir).href + '/')
}

/** CSP por cabeçalho em produção (em dev o Vite precisa de inline e WebSocket). */
export function installCsp(session: Session): void {
  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CSP] },
    })
  })
}

export function createMainWindow(): BrowserWindow {
  if (main && !main.isDestroyed()) {
    focusMainWindow()
    return main
  }
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'MigraMail',
    backgroundColor: THEME.background,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: THEME.titleBar, symbolColor: THEME.symbol, height: TITLE_BAR_HEIGHT },
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload,
    },
  })
  const contents = win.webContents
  // nada navega para fora do app; links https abrem no navegador
  contents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault()
  })
  contents.on('will-redirect', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault()
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    main = undefined
  })
  if (devServerUrl) void win.loadURL(`${devServerUrl.replace(/\/$/, '')}/index.html`)
  else void win.loadFile(join(rendererDir, 'index.html'))
  main = win
  return win
}

export function focusMainWindow(): void {
  if (!main || main.isDestroyed()) {
    createMainWindow()
    return
  }
  if (main.isMinimized()) main.restore()
  main.show()
  main.focus()
}

export function getMainWindow(): BrowserWindow | undefined {
  return main && !main.isDestroyed() ? main : undefined
}
