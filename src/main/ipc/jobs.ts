import { existsSync } from 'node:fs'
import { shell } from 'electron'
import { applyProfile, type JobSnapshot } from '@shared/model'
import { UserError } from '../errors'
import { checkExtraArgs, splitArgs } from '../imapsync/args'
import { getJobManager } from '../imapsync/instance'
import { rememberPasswords, resolvePasswords } from '../store/passwords'
import { listProfiles } from '../store/profiles'
import { broadcast, handle } from './register'

// Canais dos jobs. As senhas entram só no jobs:start e ficam na memória do JobManager; nada
// que sai daqui para o renderer (snapshots, log, avisos) leva senha.

/** Janela para juntar as mudanças de vários jobs num só jobs:changed. */
const CHANGE_FLUSH_MS = 100
/** O painel do lote leva a série inteira: no máximo uma vez por segundo. */
const BATCH_FLUSH_MS = 1000

let offJobs: (() => void) | undefined

function subscribeJobEvents(): () => void {
  const jobs = getJobManager()
  const pending = new Map<string, JobSnapshot>()
  let timer: NodeJS.Timeout | null = null
  let batchTimer: NodeJS.Timeout | null = null
  const flush = (): void => {
    timer = null
    const snapshots = [...pending.values()]
    pending.clear()
    if (snapshots.length > 0) broadcast('jobs:changed', snapshots)
  }
  const batchChanged = (): void => {
    batchTimer ??= setTimeout(() => {
      batchTimer = null
      broadcast('jobs:batch', jobs.batchSummary())
    }, BATCH_FLUSH_MS)
  }
  const offs = [
    jobs.onChange((snapshot) => {
      pending.set(snapshot.id, snapshot)
      timer ??= setTimeout(flush, CHANGE_FLUSH_MS)
      if (snapshot.scope === 'batch') batchChanged()
    }),
    jobs.onLog((jobId, lines) => broadcast('jobs:log', { jobId, lines })),
    jobs.onRemove((jobId) => {
      pending.delete(jobId)
      broadcast('jobs:removed', { jobId })
      batchChanged()
    }),
  ]
  return () => {
    for (const off of offs) off()
    if (timer) clearTimeout(timer)
    if (batchTimer) clearTimeout(batchTimer)
  }
}

function snapshotOf(jobId: string): JobSnapshot {
  const snapshot = getJobManager()
    .list()
    .find((s) => s.id === jobId)
  if (!snapshot) throw new UserError('Migração não encontrada.')
  return snapshot
}

export function registerJobsHandlers(): void {
  offJobs?.()
  offJobs = subscribeJobEvents()

  handle('jobs:start', ({ account: raw, mode, password1, password2, scope = 'single' }) => {
    const profiles = listProfiles()
    const account = {
      ...raw,
      source: applyProfile(raw.source, profiles),
      dest: applyProfile(raw.dest, profiles),
    }
    const typed = { password1, password2 }
    const secrets = resolvePasswords(account, typed)

    const warnings: string[] = []
    try {
      rememberPasswords(account, typed)
    } catch (err) {
      // não lembrar a senha não impede a migração
      if (err instanceof UserError) warnings.push(err.message)
      else throw err
    }

    // mesmo perfil nos dois lados entra uma vez só
    const profileIds = new Set([account.source.profileId, account.dest.profileId])
    const profileExtraArgs = profiles
      .filter((p) => profileIds.has(p.id) && p.extraArgs.trim())
      .map((p) => p.extraArgs)
    const tokens = [...profileExtraArgs, account.options.extraArgs].flatMap(splitArgs)
    warnings.push(...checkExtraArgs(tokens).warnings)

    const jobs = getJobManager()
    const jobId = jobs.enqueue(account, mode, secrets, profileExtraArgs, scope)
    for (const { host, count } of jobs.concurrencyWarnings()) {
      warnings.push(
        `${count} migrações ao mesmo tempo em ${host}: o servidor pode limitar ou bloquear.`,
      )
    }
    return { jobId, warnings }
  })

  handle('jobs:stop', async ({ jobId }) => {
    await getJobManager().stop(jobId)
    return null
  })
  handle('jobs:stopAll', async () => {
    await getJobManager().stopAll()
    return null
  })
  handle('jobs:retry', ({ jobId }) => ({ jobId: getJobManager().retry(jobId) }))
  handle('jobs:remove', ({ jobId }) => {
    getJobManager().remove(jobId)
    return null
  })
  handle('jobs:batchSummary', () => getJobManager().batchSummary())
  handle('jobs:list', () => getJobManager().list())
  handle('jobs:log', ({ jobId }) => ({ lines: getJobManager().logTail(jobId) }))
  handle('jobs:openLog', ({ jobId }) => {
    const { logPath } = snapshotOf(jobId)
    if (!logPath || !existsSync(logPath)) {
      throw new UserError('O log desta migração ainda não foi criado.')
    }
    shell.showItemInFolder(logPath)
    return null
  })
}
