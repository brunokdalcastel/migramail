import { logger } from '../logger'
import { getSettings, onSettingsChanged } from '../settings'
import { JobManager } from './manager'
import { imapsyncExe, jobPaths } from './paths'

// O JobManager do app: imapsync.exe real, caminhos em %APPDATA%\MigraMail e paralelismo das settings.

let manager: JobManager | undefined

export function getJobManager(): JobManager {
  if (!manager) {
    const created = new JobManager({
      parallelism: getSettings().parallelism,
      command: () => ({ file: imapsyncExe(), prefixArgs: [] }),
      jobPaths,
      log: (message) => logger.info(message),
    })
    onSettingsChanged((s) => created.setParallelism(s.parallelism))
    manager = created
  }
  return manager
}
