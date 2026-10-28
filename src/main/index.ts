import { app, dialog, session, type BrowserWindow } from 'electron'
import { getJobManager } from './imapsync/instance'
import { registerIpc } from './ipc/register'
import { logger } from './logger'
import { createMainWindow, focusMainWindow, installCsp } from './windows'

// Proibido neste app: flags que desligam a validação TLS, setCertificateVerifyProc
// permissivo e servidor HTTP local para a UI.

app.enableSandbox()
app.setAppUserModelId('com.migramail.app')

// No app instalado, uma porta de depuração deixaria qualquer programa local ler a sessão e
// mandar comandos pelo IPC. Em dev (electron-vite) ela é liberada.
const DEBUG_SWITCHES = ['remote-debugging-port', 'remote-debugging-pipe', 'inspect', 'inspect-brk']
if (app.isPackaged && DEBUG_SWITCHES.some((s) => app.commandLine.hasSwitch(s))) {
  logger.warn('[app] depuração remota recusada no app instalado')
  app.exit(1)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => focusMainWindow())
  app.on('browser-window-created', (_event, win) => confirmCloseWithJobs(win))

  void app.whenReady().then(() => {
    // nenhuma permissão do navegador (câmera, notificações web, geolocalização…) é usada
    session.defaultSession.setPermissionRequestHandler((_c, _p, callback) => callback(false))
    session.defaultSession.setPermissionCheckHandler(() => false)
    if (app.isPackaged) installCsp(session.defaultSession)
    registerIpc()
    createMainWindow()
    logger.info(`[app] MigraMail ${app.getVersion()} pronto`)
  })

  app.on('window-all-closed', () => app.quit())

  // Sair com job rodando deixaria imapsync.exe órfão: para todos (até 5 s) e só então sai.
  let stopping = false
  app.on('before-quit', (event) => {
    const jobs = getJobManager()
    if (stopping || !jobs.hasRunning()) return
    event.preventDefault()
    stopping = true
    void jobs.stopAll(5000).then((allExited) => {
      if (!allExited) logger.warn('[app] jobs não saíram em 5 s; saindo assim mesmo')
      app.quit()
    })
  })
}

/** RNF5: fechar a janela com migração em andamento pede confirmação. */
function confirmCloseWithJobs(win: BrowserWindow): void {
  win.on('close', (event) => {
    const active = getJobManager().activeCount()
    if (active === 0) return
    const answer = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: 'MigraMail',
      message:
        active === 1
          ? 'Há 1 migração em andamento. Parar e sair?'
          : `Há ${active} migrações em andamento. Parar e sair?`,
      detail: 'Rodar de novo depois continua de onde parou.',
      buttons: ['Parar e sair', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    })
    if (answer !== 0) event.preventDefault()
    // com "Parar e sair" a janela fecha e o before-quit para os jobs antes de o app sair
  })
}
