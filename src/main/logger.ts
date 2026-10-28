import { join } from 'node:path'
import { app } from 'electron'
import log from 'electron-log/main'

// Regra: senhas, argumentos extras e saída do imapsync nunca vão para este log, em nível
// nenhum. Só ids, contagens, tempos e códigos de saída. O log de cada migração é o do próprio
// imapsync (--logdir), separado deste.
// Sem log.initialize(): ele injeta um preload próprio nas sessões, e aqui só o main loga.
log.transports.file.resolvePathFn = () => join(app.getPath('userData'), 'app.log')
log.transports.file.maxSize = 5 * 1024 * 1024
log.transports.file.level = app.isPackaged ? 'info' : 'debug'
log.transports.console.level = app.isPackaged ? false : 'debug'

export const logger = log
