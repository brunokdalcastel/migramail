// Teste manual do JobManager com o imapsync.exe real (Fase 3), contra as contas públicas de
// teste do imapsync (senhas do FAQ). Uso: npx tsx --tsconfig tsconfig.node.json scripts/try-job.ts
//   1. migrate (copia)            2. migrate de novo (pula tudo)
//   3. login com o certificado do destino validado (test2 entrega o certificado do test1 → 102)
//   4. medir a conta inteira e parar no meio (não pode sobrar imapsync.exe)
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describeExit } from '@shared/exitCodes'
import {
  defaultMigrationOptions,
  type Account,
  type JobMode,
  type JobSnapshot,
} from '@shared/model'
import { JobManager } from '../src/main/imapsync/manager'

const exe = resolve(__dirname, '../vendor/imapsync/imapsync.exe')
if (!existsSync(exe)) throw new Error(`imapsync.exe não encontrado em ${exe}`)
const tmp = mkdtempSync(join(tmpdir(), 'migramail-try-'))
const SECRETS = { password1: 'secret1', password2: 'secret2' }

function account(id: string, folders: string[], destCertCheck: boolean): Account {
  const base = { port: 993, security: 'ssl', preset: 'none', rememberPassword: false } as const
  return {
    id,
    label: `try-${id}`,
    source: {
      ...base,
      profileId: null,
      host: 'test1.lamiral.info',
      user: 'test1',
      allowInvalidCert: false,
    },
    dest: {
      ...base,
      profileId: null,
      host: 'test2.lamiral.info',
      user: 'test2',
      allowInvalidCert: !destCertCheck,
    },
    options: { ...defaultMigrationOptions, folders, subfolder2: 'gui_probe_bruno_f3' },
  }
}

const manager = new JobManager({
  parallelism: 1,
  command: () => ({ file: exe, prefixArgs: [] }),
  jobPaths: (jobId) => ({
    pidfile: join(tmp, 'run', `${jobId}.pid`),
    logdir: join(tmp, 'logs'),
    logfile: `${jobId}.txt`,
  }),
  log: (m) => console.log(`  ${m}`),
})

function imapsyncProcesses(): number {
  const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq imapsync.exe', '/NH'], {
    encoding: 'utf8',
  })
  return out.split('\n').filter((l) => /^imapsync\.exe/i.test(l)).length
}

interface Timing {
  firstLine: number | null
  login1: number | null
  login2: number | null
}

async function run(
  name: string,
  acc: Account,
  mode: JobMode,
  stopAfterLoginMs?: number,
): Promise<{ s: JobSnapshot; t: Timing; liveBatches: number }> {
  console.log(`\n=== ${name}`)
  const t0 = Date.now()
  const t: Timing = { firstLine: null, login1: null, login2: null }
  let liveBatches = 0
  let stopTimer: NodeJS.Timeout | undefined
  const id = manager.enqueue(acc, mode, SECRETS)
  const offLog = manager.onLog((jobId, lines) => {
    if (jobId !== id) return
    liveBatches++
    const sec = ((Date.now() - t0) / 1000).toFixed(1)
    for (const line of lines) {
      t.firstLine ??= Date.now() - t0
      if (/^Host1: success login/.test(line)) t.login1 ??= Date.now() - t0
      if (/^Host2: success login/.test(line)) t.login2 ??= Date.now() - t0
      if (/login|^Folder|^msg |Exiting|ETA|skipped|transferred|error/i.test(line))
        console.log(`  [${sec}s] ${line.slice(0, 150)}`)
    }
    if (stopAfterLoginMs !== undefined && t.login2 !== null && !stopTimer) {
      stopTimer = setTimeout(() => {
        console.log(`  >> parando (${imapsyncProcesses()} imapsync.exe vivos antes)`)
        void manager.stop(id)
      }, stopAfterLoginMs)
    }
  })
  while (manager.list().find((s) => s.id === id)?.state !== 'finished') {
    await new Promise((r) => setTimeout(r, 200))
  }
  offLog()
  const s = manager.list().find((x) => x.id === id)!
  const info = s.exitCode === null ? null : describeExit(s.exitCode, s.progress.summary.exitName)
  console.log(
    `  -> status ${s.status}, código ${s.exitCode} (${info?.title ?? s.error}), ` +
      `copiadas ${s.progress.msgsCopied}, puladas ${s.progress.summary.messagesSkipped}, ` +
      `bytes ${s.progress.bytesSent}, % ${s.percentMessages?.toFixed(0) ?? '-'}, ` +
      `pontos na série ${s.series.length}, lotes de log ${liveBatches}`,
  )
  console.log(
    `  tempos: 1ª linha ${t.firstLine} ms, login origem ${t.login1} ms, login destino ${t.login2} ms, ` +
      `total ${(s.finishedAt ?? 0) - (s.startedAt ?? 0)} ms`,
  )
  return { s, t, liveBatches }
}

async function main(): Promise<void> {
  console.log(`exe: ${exe}\npasta temporária: ${tmp}`)
  const folders = ['INBOX.Urlaub', 'Borrador']
  const r1 = await run('1. migrar', account('a', folders, false), 'migrate')
  const r2 = await run('2. migrar de novo', account('a', folders, false), 'migrate')
  const r3 = await run('3. login com destino validado', account('b', [], true), 'login')
  const r4 = await run('4. medir tudo e parar', account('c', [], false), 'sizes', 1500)
  await new Promise((r) => setTimeout(r, 1000))
  const orphans = imapsyncProcesses()
  const parTemp = readdirSync(tmpdir())
    .filter((d) => d.startsWith('par-'))
    .flatMap((d) => readdirSync(join(tmpdir(), d)))

  console.log('\n=== resumo')
  console.log(`1ª execução: ${r1.s.status}, copiadas ${r1.s.progress.msgsCopied}`)
  console.log(`2ª execução: ${r2.s.status}, puladas ${r2.s.progress.summary.messagesSkipped}`)
  console.log(
    `login com validação no destino: código ${r3.s.exitCode}; origem logou: ${r3.s.progress.loggedIn[1]}`,
  )
  console.log(`parada: ${r4.s.status}; imapsync.exe vivos depois: ${orphans}`)
  console.log(`pastas temp do PAR que sobraram: ${parTemp.join(', ') || 'nenhuma'}`)
  console.log(`tempo até login da origem: 1ª ${r1.t.login1} ms, 2ª ${r2.t.login1} ms`)
}

void main()
