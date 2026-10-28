# Spec: MigraMail — interface gráfica para o imapsync

> Baseada em `docs/PRD.md` (2026-10-26) · Data: 2026-10-26

## Overview
App Electron + React + TypeScript para Windows que monta a chamada do `imapsync.exe` 2.314 (embutido), roda um processo por conta (1–5 em paralelo), interpreta a saída ao vivo e mostra fase, %, bytes, velocidade, ETA e gráficos por conta e por lote. Perfis de servidor e contas ficam em JSON no `%APPDATA%\MigraMail`; senhas só via `safeStorage`.

### Decisões que valem para todas as fases
- **Motor**: `imapsync.exe` em `resources/imapsync/` (empacotado) ou `vendor/imapsync/` (dev). O caminho é resolvido em um só lugar (`src/main/imapsync/paths.ts`).
- **TLS**: o imapsync por padrão **não valida certificado** (`Host1: SSL default mode is like --sslargs1 "SSL_verify_mode=0"`, visto em `test/fixtures/imapsync/run_*.txt`). O app sempre passa `--sslargs1 SSL_verify_mode=1 --sslargs2 SSL_verify_mode=1` quando a segurança for SSL ou STARTTLS. Desligar só por perfil, com o checkbox "Aceitar certificado inválido (inseguro)" e aviso vermelho.
- **Sempre na linha de comando** de todo job: `--no-modulesversion`, `--pidfile <único>`, `--logdir <pasta do app>`, `--logfile <jobId>.txt`. Nunca `--password1/2`.
- **Persistência**: arquivos JSON com `writeFileAtomic` (padrão do Memora), sem banco. Sem better-sqlite3.
- **Unidade do progresso**: a % principal é por mensagens; a % por bytes aparece com o rótulo "estimado".

## Dependências (todas já fixadas e testadas no `~/memora/package.json`)
| Pacote | Versão | Uso |
|---|---|---|
| electron | 44.5.1 | runtime |
| electron-vite | 5.0.0 | build |
| vite | 7.3.6 | build |
| @vitejs/plugin-react | 5.2.0 | build |
| typescript | 6.0.3 | tipos |
| react / react-dom | 19.3.0 | UI |
| @types/react / @types/react-dom | 19.3.0 | tipos |
| @types/node | 24.19.1 | tipos |
| zod | 4.6.5 | contratos IPC e validação de arquivos |
| zustand | 5.0.15 | estado do renderer |
| echarts | 6.1.0 | gráficos |
| tailwindcss / @tailwindcss/vite | 4.3.3 | estilo |
| @fontsource-variable/geist, geist-mono | 5.3.0 | fontes (iguais ao Memora) |
| electron-log | 5.4.4 | log do app (não do imapsync) |
| electron-builder | 26.17.0 | instalador NSIS |
| vitest | 5.0.3 | testes |
| eslint 10.12.0, @eslint/js 10.0.1, typescript-eslint 8.71.0, eslint-plugin-react-hooks 7.1.1, globals 17.13.0, prettier 3.9.9, tsx 4.23.15 | — | qualidade e scripts |

Nenhuma outra lib. CSV é parser próprio (copiar a ideia de `~/memora/src/shared/csv.ts`).

---

## Fase 1: Esqueleto do projeto

### `package.json` (CRIAR)
- `name: migramail`, `productName: MigraMail`, `version: 0.1.0`, `main: out/main/index.js`, `private: true`.
- Scripts copiados do Memora: `dev`, `build`, `typecheck`, `lint`, `format`, `test`, `dist`, `licenses`, `release`. Sem `bench`, `demo`, `screenshots`, `icon` (ícone fica estático em `build/icon.ico`).
- `dependencies`: `electron-log`, `zod`. O resto em `devDependencies` (o renderer é empacotado pelo Vite).

### `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`, `vitest.config.ts`, `eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `.gitattributes` (CRIAR)
- Copiar do Memora e ajustar nomes. Manter o alias `@shared` → `src/shared`.
- `vitest.config.ts`: incluir `src/**/*.test.ts(x)`; ambiente `node` por padrão.

### `.gitignore` (MODIFICAR)
- Acrescentar `node_modules/`, `out/`, `dist/`, `vendor/imapsync/*.exe` (o exe não vai pro git; o script da Fase 7 baixa e confere o hash).

### `src/main/index.ts` (CRIAR)
- `app.requestSingleInstanceLock()`; cria a janela; registra os IPC (`registerIpc()`); em `before-quit` chama `jobManager.stopAll()` (Fase 3).
### `src/main/windows.ts` (CRIAR)
- Copiar de `~/memora/src/main/windows.ts`: `createMainWindow()`, `getMainWindow()`, `isAppUrl(url)`. `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, bloquear `will-navigate` e `setWindowOpenHandler` → `deny`.
### `src/main/logger.ts`, `src/main/errors.ts`, `src/main/settings.ts` (CRIAR)
- Copiar do Memora. `settings.ts` mantém `writeFileAtomic` e `readJsonFile`; settings do app: `{ parallelism: 2, lastMode: 'single' | 'batch', showBytesPercent: true }`.
### `src/shared/ipc.ts` (CRIAR)
- Mesmo formato do Memora: `ipc` (req/res zod), `ipcEvents`, `IpcResult`, `isChannel`, `isEventName`, `MigraMailBridge`. Começa só com `app:info` e `settings:get/update`.
### `src/main/ipc/register.ts` (CRIAR)
- Copiar `handle()` e `broadcast()` do Memora sem mudar a lógica (remetente, validação, `UserError`).
### `src/preload/index.ts` (CRIAR)
- Copiar do Memora; expor `window.migramail` com `invoke`, `on` e `pathForFile` (arrastar CSV).
### `src/renderer/index.html`, `main.tsx`, `app/App.tsx`, `app/Shell.tsx`, `styles/tokens.css`, `styles/app.css`, `lib/api.ts`, `i18n/pt-BR.ts`, `components/{Button,Dialog,Form,Icon,Chart}.tsx` (CRIAR)
- Tema escuro e componentes copiados do Memora. `Shell` com navegação lateral: **Uma conta**, **Várias contas**, **Perfis**, **Sobre**. Páginas vazias com o título.
- `Chart.tsx`: wrapper ECharts igual ao do Memora (init/dispose/resize).
- CSP no `index.html`: `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:`.

### Verificação Fase 1
- [x] `npm install` e `npm run typecheck` sem erro
- [x] `npm run lint` e `npm run build` sem erro
- [x] `npm test` roda (pode ter só um teste de fumaça do `register.ts` copiado)
- [x] `npm run dev` abre a janela com as 4 entradas do menu, tema escuro, sem erro no console

---

## Fase 2: Lógica pura (parser, argumentos, códigos, CSV)

Tudo em `src/shared/` ou `src/main/imapsync/` sem importar `electron`, para rodar no Vitest.

### `src/shared/model.ts` (CRIAR)
- Schemas zod + tipos:
```ts
security: z.enum(['ssl', 'tls', 'none'])
preset: z.enum(['none', 'gmail', 'office'])
ServerProfile { id, name, host, port, security, preset, allowInvalidCert: boolean, extraArgs: string }
Endpoint { profileId: string | null, host, port, security, preset, allowInvalidCert, user, rememberPassword: boolean }
MigrationOptions { automap: boolean (padrão false), justfolders, subfolder2: string, exclude: string[], folders: string[],
                   f1f2: { from, to }[], syncinternaldates, maxBytesPerSecond: number | null,
                   errorsMax: number (padrão 50), extraArgs: string }
Account { id, label, source: Endpoint, dest: Endpoint, options: MigrationOptions }
JobMode: z.enum(['login', 'sizes', 'dry', 'migrate'])
```
- `defaultPort(security)` → 993 / 143 / 143.
- Senha **não** faz parte de `Account`: vai à parte (`JobSecrets { password1, password2 }`) só no pedido de iniciar job.

### `src/main/imapsync/args.ts` (CRIAR)
- `buildArgs(account, mode, paths: { pidfile, logdir, logfile }): string[]`
  - `--host1/--user1/--port1` + `--ssl1` | `--tls1` | `--nossl1`; idem 2.
  - SSL/TLS sem `allowInvalidCert` → `--sslargs1 SSL_verify_mode=1` (idem 2).
  - preset: `--gmail1`, `--office1` etc. (antes das opções do usuário, para o usuário poder sobrescrever).
  - modo: `login` → `--justlogin`; `sizes` → `--justfoldersizes`; `dry` → `--dry`; `migrate` → nada.
  - opções: `--automap` ou `--noautomap` (sempre explícito: `--gmail1/2` ligam o automap sozinhos), `--justfolders`, `--subfolder2 X`, cada `--exclude`, `--folder`, `--f1f2 a=b`, `--syncinternaldates`, `--maxbytespersecond N`, `--errorsmax N`.
  - fixos: `--no-modulesversion --pidfile ... --logdir ... --logfile ...`.
  - por último: `splitArgs(profile.extraArgs)` e `splitArgs(options.extraArgs)`.
- `splitArgs(s): string[]`: divide por espaço respeitando aspas duplas. (Fase 5: `splitArgs` e `checkExtraArgs` moram em `src/shared/extraArgs.ts`, para a interface mostrar os avisos ao vivo; `args.ts` reexporta.)
- `checkExtraArgs(tokens): { errors: string[], warnings: string[] }`:
  - erro: `--password1`, `--password2` (senha na linha de comando), `--showpasswords` e `--debugenv` (senha no log, testado no 2.314), `--pidfile`, `--logdir`, `--logfile` (o app controla).
  - aviso: `--delete1`, `--delete2`, `--delete1emptyfolders`, `SSL_verify_mode=0`, `--nossl*`, `--debugimap[12]` e `--debugcontent` (conteúdo das mensagens no log).
- `buildEnv(secrets): NodeJS.ProcessEnv` → `{ ...process.env, IMAPSYNC_PASSWORD1, IMAPSYNC_PASSWORD2 }`.

### `src/shared/exitCodes.ts` (CRIAR)
- `EXIT_CODES: Record<number, { name, status: 'ok' | 'warning' | 'error', title, hint }>` com a tabela do PRD §6 / RE §3, textos em pt-BR. Ex.: `161 → error, "Falha de login na origem", "Verifique usuário e senha da origem. No Gmail/M365 use senha de app."`; `111 → warning, "Terminou com erros"`; `113 → error, "Destino sem cota"`.
- `describeExit(code, nameFromLog?)` → entrada conhecida ou genérica com o nome vindo do log.

### `src/main/imapsync/parser.ts` (CRIAR)
- `classifyLine(line): ParsedLine | null` — uma função pura por tipo; regex ancoradas, tolerante a espaços repetidos e `\r`:
  - `login` — `^Host([12]): success login on \[(.+?)\] with user \[(.+?)\]`
  - `folderSize` — `^Host([12]) folder\s+(\d+)/(\d+) \[(.*?)\]\s+(?:Size:\s+(\d+) Messages:\s+(\d+)|.*does not exist yet)`
  - `totalMessages` — `^Host([12]) Nb messages:\s+(\d+)`
  - `totalSize` — `^Host([12]) Total size:\s+(\d+) bytes`
  - `quotaExceeded` — `Quota limit will be exceeded`
  - `folderStart` — `^Folder\s+(\d+)/(\d+) \[(.*?)\]\s+-> \[(.*?)\]`
  - `msgCopied` — `^msg (.+?) \{(\d+)\}\s+(copied to|copying to)` + (opcional) `([\d.]+) msgs/s\s+([\d.]+) KiB/s` + `(\d+)\s+s\s+(\d+)/(\d+) msgs left`
  - `eta` — `^ETA: .*?(\d+)\s+s\s+(\d+)/(\d+) msgs left`
  - `msgError` — `^- msg .*could not`
  - `statMessagesTransferred`, `statMessagesSkipped`, `statBytesTransferred`, `statErrors` (`Detected (\d+) errors`)
  - `exit` — `^Exiting with return value (\d+) \((\w+)`
  - `dryNotSimulated` — `^Since --dry mode is on and folder \[.*\] on host2 does not exist yet` (Fase 5, `test/fixtures/imapsync/run_dry_newfolders.txt`): no `--dry`, pasta que ainda não existe no destino não tem a cópia simulada; o redutor guarda a pasta da origem em `dryUnsimulatedFolders` (uma vez por pasta).
  - `mostFrequentError` — `^The most frequent error is (.*)`
- `initialProgress(mode): JobProgress` (em `model.ts` desde a Fase 5; o parser reexporta) e `applyLine(p, parsed): JobProgress` (redutor puro):
  - fases: `starting → login → sizing → copying → finalSizing → done`.
  - `sizing`: guarda `folders[name] = { size1, msgs1, size2, msgs2 }`; `sizingIndex/sizingTotal` vêm do `Host1 folder i/N`.
  - ao primeiro `folderStart` vira `copying`; calcula `estimatedToCopy = Σ max(0, size1 − size2)` e `totalMessages = Host1 Nb messages`.
  - `msgCopied`/`eta`: `msgsLeft`, `bytesSent += {N}`, `msgsCopied++`, `speedKiBs`, `etaSeconds`. % por mensagens = `(M − N) / M` do `N/M msgs left`, que é **global da conta** (confirmado em `run_copy.txt`: 7/9 na 1ª pasta, 0/9 no fim) — não precisa de `doneBeforeFolder`.
  - `--dry`: a linha `copying to ... not really` não traz `{bytes}` nem velocidade; `copying to` sem `not really` (saída do `--debug`) é ignorado para não contar em dobro. Velocidade vem em KiB/MiB/GiB/s e é convertida para KiB/s.
  - `Host1 folder` depois de `copying` → `finalSizing` (não sobrescreve os tamanhos iniciais; grava em `finalFolders`).
  - stats/exit → preenche `summary` e `exitCode`; `done`.
  - `percentMessages` e `percentBytes` (limitado a 100, `null` se não houver estimativa) são calculados em `derive(p)`.
- `createLineSplitter(onLine)`: buffer de texto, quebra em `\n`, tira `\r`, entrega a última linha incompleta só no `flush()`.

### `src/main/imapsync/parser.test.ts` (CRIAR)
- Lê `test/fixtures/imapsync/run_sizes.txt`, `run_copy.txt`, `run_badauth.txt` e passa linha a linha.
  - `run_sizes`: termina `done`, `exitCode 0`, `Host1 Total size 412660890`, 26 pastas medidas.
  - `run_copy`: `msgsCopied 8`, `bytesSent 169494` = `Total bytes transferred`, % por mensagens chega a 100, passa por todas as fases na ordem.
  - `run_badauth`: `exitCode 161`, `describeExit` → "Falha de login na origem".
- Casos sintéticos: linha `--dry` (`copying to ... not really`), `does not exist yet`, nome `[Entw&APw-rfe] = [Entwürfe]`, `\r\n`, linha partida em dois chunks.

### `src/main/imapsync/args.test.ts` (CRIAR)
- Nenhum token contém a senha; `SSL_verify_mode=1` presente para SSL/TLS e ausente com `allowInvalidCert`; `--justlogin` no modo login; `splitArgs('--f1f2 "A B=C D" --dry')`; `checkExtraArgs` recusa `--password1`.

### `src/shared/csv.ts` (CRIAR) + `csv.test.ts`
- `parseAccountsCsv(text): { rows: AccountDraft[], errors: { line, message }[] }`
  - detecta formato: primeira linha com cabeçalho `host1,user1,password1,host2,user2,password2[,extra]` (separador `,` ou `;`) **ou** o `file.txt` oficial `host1;user1;senha1;host2;user2;senha2;extras;` (sem cabeçalho, `#` é comentário).
  - aspas duplas com `""` escapado; linha vazia ignorada; BOM removido.
  - `host` pode vir `host:porta`; segurança padrão SSL (993).
- `exportAccountsCsv(accounts): string` — formato com cabeçalho, **coluna de senha vazia**.
- Testes: os dois formatos, comentário, aspas, host com porta, linha com colunas faltando vira erro com o número da linha.

### Verificação Fase 2
- [x] `npm test` passa com os testes acima, usando as saídas reais de `test/fixtures/imapsync/`
- [x] Nenhum arquivo desta fase importa `electron`
- [x] `npm run typecheck` e `npm run lint` sem erro

---

## Fase 3: Execução de jobs no main

### `src/main/imapsync/paths.ts` (CRIAR)
- `imapsyncExe()` → `process.resourcesPath/imapsync/imapsync.exe` empacotado, `<raiz>/vendor/imapsync/imapsync.exe` em dev; lança `UserError` claro se não existir.
- `jobPaths(jobId)` → `{ pidfile: userData/run/<jobId>.pid, logdir: userData/logs, logfile: <conta>_<AAAAMMDD-HHmmss>_<jobId>.txt }` (`logs` = `%APPDATA%\MigraMail\logs`, RF9).

### `src/main/imapsync/job.ts` (CRIAR)
- `class Job` com `id`, `accountId`, `mode`, `state: 'queued' | 'running' | 'stopping' | 'finished'`, `progress: JobProgress`, `logTail: string[]` (últimas 2.000 linhas em memória).
- `start(exe, args, env)`: `spawn(exe, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })`; stdout e stderr passam pelo `createLineSplitter` → `classifyLine` → `applyLine`. Decodificar como UTF-8.
- `stop()`: `taskkill /PID <pid> /T /F` (via `execFile`, sem shell); estado `stopping`; ao sair marca `stoppedByUser: true` (status "Parado", não "Erro").
- No `exit`: se o log não trouxe `Exiting with return value`, usa o código do processo; `flush()` do splitter; apaga o pidfile.
- Emite `onChange` com throttle de 250 ms (RNF3, no máximo 4×/s) e `onLog` em lote com as linhas novas.
- Ao fim de todo job apaga `%TEMP%\par-<usuário>\temp-<pid>`: o exe (PAR::Packer) extrai ~35 MB ali a cada execução; o `taskkill` deixa tudo e a saída normal deixa 2 arquivos.
- Senhas (≥ 3 caracteres) que aparecerem na saída viram `MASKED` no `logTail` (defesa contra `--debugimap` nos extras).
- Série temporal para o gráfico: a cada 2 s guarda `{ t, percentMessages, percentBytes, bytesSent }` (máximo 1.800 pontos, depois descarta um a cada dois).

### `src/main/imapsync/manager.ts` (CRIAR)
- `JobManager` com fila FIFO e `parallelism` (1–5, vem das settings).
- `enqueue(account, mode, secrets): jobId`, `stop(jobId)`, `stopAll()`, `retry(jobId)` (reaproveita conta e segredos guardados só em memória enquanto o app estiver aberto), `list(): JobSnapshot[]`, `batchSummary()` (contas por status, % geral por mensagens e por bytes, série total).
- Aviso RF10: `concurrencyWarnings()` → hosts com mais de 3 jobs rodando ao mesmo tempo.
- Se a conta já tiver um job rodando, recusa com `UserError` ("Esta conta já está em andamento"). Extras com erro no `checkExtraArgs` também são recusados aqui.
- Tipos `JobSnapshot`, `JobStatus`, `JobSeriesPoint`, `BatchSummary` ficam em `src/shared/model.ts` (o renderer usa).

### `src/main/imapsync/instance.ts` (CRIAR)
- `getJobManager()`: singleton com o exe real (`paths.ts`), `jobPaths` e o paralelismo das settings (`onSettingsChanged`).

### `src/main/imapsync/manager.test.ts` (CRIAR)
- Usa um **exe falso**: `test/fixtures/fake-imapsync.mjs` que reproduz um arquivo de `test/fixtures/imapsync/` linha a linha com atraso de 5 ms e sai com o código do `Exiting with return value`. O manager recebe o comando por injeção (`spawnCommand: { file: process.execPath, prefixArgs: [fakePath] }`).
- Casos: paralelismo 2 com 5 jobs (nunca mais de 2 rodando); `stop` de um job em andamento → status "Parado"; o env do filho tem `IMAPSYNC_PASSWORD1` e os args não têm a senha; job 161 termina com erro traduzido.

### `test/fixtures/fake-imapsync.mjs` (CRIAR)
- Lê `--fixture <arquivo>` (passado pelo teste) e imprime o conteúdo; imprime também o `IMAPSYNC_PASSWORD1` mascarado (`MASKED`) para provar que chegou.

### `src/main/index.ts` (MODIFICAR)
- RNF5: em `close` da janela, se `jobManager.hasRunning()`, `dialog.showMessageBox` "Há N migrações em andamento. Parar e sair?"; sim → `stopAll()` e espera os processos saírem (timeout 5 s) antes de `app.quit()`.

### Verificação Fase 3
- [x] `npm test` passa, incluindo `manager.test.ts` com o exe falso
- [x] Teste manual com o exe real (script `scripts/try-job.ts` executado com `tsx`, contra `test1/test2.lamiral.info` com as senhas públicas do FAQ): linhas chegam ao vivo, 1ª execução copia, 2ª pula
- [x] Com `SSL_verify_mode=1` o login em `test1.lamiral.info` funciona (o exe tem CAs; o `test2` entrega o certificado do `test1` e falha com 102, como deve: nos testes o destino usa `allowInvalidCert`). **Se falhar por falta de CA no exe**, parar e propor a correção na Spec (opção: embutir `cacert.pem` da Mozilla e passar `--sslargs1 SSL_ca_file=...`)
- [x] Depois de `stop`, `tasklist` não mostra `imapsync.exe` órfão
- [x] Medir o tempo até o login na 1ª e na 2ª execução e anotar no `progress.md` (PRD §8)

---

## Fase 4: Perfis, contas salvas e senhas

### `src/main/store/profiles.ts` (CRIAR)
- `profiles.json` em `userData`: `listProfiles()`, `saveProfile(p)`, `deleteProfile(id)`. Validação com zod ao ler (entrada inválida é descartada com log, sem derrubar o arquivo).
- Perfis prontos (somente leitura): "Gmail" (`imap.gmail.com`, 993, SSL, preset gmail), "Microsoft 365" (`outlook.office365.com`, 993, SSL, preset office). Ficam no código (`BUILTIN_PROFILES` em `model.ts`, ids `builtin:*`), sempre no topo da lista; o `profiles.json` (`{ profiles: [...] }`) guarda só os do usuário.
- Nome de perfil não se repete (sem diferenciar maiúsculas). `applyProfile(endpoint, profiles)` (shared) aplica host/porta/segurança/preset/certificado do perfil ao lado da conta; perfil excluído vira "Personalizado". O main aplica no `accounts:load` e no `jobs:start`.

### `src/main/store/accounts.ts` (CRIAR)
- `accounts.json`: a última tabela de "Várias contas" e o último formulário de "Uma conta" (`{ single: Account | null, batch: Account[] }`), para reabrir o app onde parou. Conta inválida ou repetida é descartada com log; campos fora do schema (uma senha) não são gravados.

### `src/main/secrets.ts` (CRIAR)
- Copiar de `~/memora/src/main/secrets.ts` sem mudar a lógica. Chaves: `pw:<accountId>:1` e `pw:<accountId>:2`.
- Só grava quando `endpoint.rememberPassword`; desmarcar remove o segredo. O renderer só recebe `savedPasswords: { [accountId]: { source, dest } }` (booleanos).
- `src/main/store/passwords.ts`: `resolvePasswords` (digitada ou, com "lembrar", a salva), `rememberPasswords`, `forgetPasswordsExcept` (o `accounts:save` apaga senhas de contas que saíram da lista). `secrets.ts` ganhou só `secretIds()`.

### `src/shared/ipc.ts` (MODIFICAR) + `src/main/ipc/{profiles,accounts,jobs}.ts` (CRIAR)
- Canais:
  - `profiles:list`, `profiles:save`, `profiles:delete`
  - `accounts:load → { single, batch, savedPasswords }`, `accounts:save { single, batch, passwords?: { accountId, password1?, password2? }[] } → idem` (lembra as senhas digitadas dos lados marcados), `accounts:importCsv { path } → { rows, errors }` (.csv/.txt, até 5 MB, UTF-8 ou Windows-1252), `accounts:exportCsv { accounts } → { path | null }` (diálogo de salvar no main)
  - `jobs:start { account, mode, password1?, password2? } → { jobId, warnings }` — senha vazia ⇒ usa a salva; nenhuma das duas ⇒ `UserError` "Informe a senha da origem"
  - `jobs:stop { jobId }`, `jobs:stopAll`, `jobs:retry { jobId }`, `jobs:list`, `jobs:log { jobId } → { lines }`, `jobs:openLog { jobId }` (`shell.showItemInFolder`)
  - `settings:update { parallelism }` repassa ao `JobManager`
- Eventos: `jobs:changed JobSnapshot[]` (só os jobs que mudaram, juntados a cada 100 ms), `jobs:log { jobId, lines }`, `jobs:removed { jobId }` (o retry troca o job).
- `jobs:start` devolve em `warnings` os avisos de `checkExtraArgs` (extras dos perfis + da conta), os de concorrência (RF10) e "a senha não foi salva" se a criptografia do sistema faltar (não impede o job). Mesmo perfil nos dois lados entra uma vez nos extras.
- `JobSnapshot` tem schema zod estrito (`jobSnapshotSchema` em `model.ts`): em dev, campo a mais barra o envio.
- O schema de `jobs:start` limita tamanho dos campos (host ≤ 253, user ≤ 320, senha ≤ 1024, extraArgs ≤ 4.000).

### Testes
- [x] `src/main/store/profiles.test.ts`: arquivo corrompido volta aos perfis prontos; entrada inválida descartada (também cobre `accounts.ts`).
- [x] `src/main/ipc/register.test.ts`: copiado do Memora (remetente recusado, payload inválido), com os limites dos canais novos.
- [x] `src/main/ipc/jobs.test.ts`: `JobSnapshot` e tudo que vai ao renderer não têm a senha (busca no JSON serializado); senha lembrada; extras de perfil; retry; CSV.
- [x] `src/main/secrets.test.ts`: copiado do Memora.

### Verificação Fase 4
- [x] `npm test`, `typecheck`, `lint` sem erro
- [x] `profiles.json`/`accounts.json` não contêm senha (teste automatizado lendo os arquivos)
- [x] `secrets.json` só tem texto base64 cifrado

---

## Fase 5: Tela "Uma conta" e "Perfis"

### `src/renderer/app/store.ts` (CRIAR)
- zustand: `jobs: Record<jobId, JobSnapshot>` alimentado por `on('jobs:changed')`; `logs` por job (só do job aberto na tela, para não guardar 5 logs no renderer).

### `src/renderer/pages/profiles/ProfilesPage.tsx` (CRIAR)
- Lista + formulário: nome, host, porta (troca o padrão ao mudar a segurança), segurança, preset, "aceitar certificado inválido" (aviso vermelho), argumentos extras. Nota fixa: "Gmail e Microsoft 365 precisam de senha de app e IMAP liberado".

### `src/renderer/components/EndpointForm.tsx` (CRIAR)
- Combo de perfil (preenche host/porta/segurança/preset e trava os campos; "Personalizado" destrava), usuário, senha (campo `password`, botão mostrar), "lembrar senha". Validação: host e usuário obrigatórios, porta 1–65535.

### `src/renderer/components/OptionsForm.tsx` (CRIAR)
- Opções do PRD §4 em duas camadas: comuns visíveis (automap, syncinternaldates, subfolder2, pastas incluir/excluir) e "Avançado" recolhido (f1f2, maxbytespersecond, errorsmax, argumentos extras com os avisos de `checkExtraArgs` ao vivo).

### `src/renderer/pages/single/SinglePage.tsx` (CRIAR)
- Origem | Destino lado a lado, opções embaixo, botões **Testar login**, **Medir tamanho**, **Simular**, **Migrar** (este com confirmação "Copiar de X para Y?").
- Enquanto há job desta conta: botões viram **Parar**; mostra `JobPanel`.

### `src/renderer/components/JobPanel.tsx` (CRIAR)
- Cabeçalho: fase em texto ("Iniciando…", "Entrando nos servidores", "Medindo pastas 4/26", "Copiando pasta 2/26 [Archive]", "Medição final", "Concluído").
  - "Iniciando…" mostra nota: "O motor leva cerca de 30 s para começar" (medido na Fase 3: ~25–35 s em **toda** execução, não só na 1ª; o exe extrai o runtime no TEMP a cada vez).
- Barra de % (mensagens) e, se houver, % por bytes com rótulo "estimado".
- Cartões: tamanho origem, tamanho destino, falta copiar (estimado), enviado, mensagens copiadas/puladas/erros, velocidade, ETA.
- Gráfico ECharts de linha: % ao longo do tempo (mensagens sólida, bytes tracejada).
- Abas **Resumo** | **Pastas** (tabela da medição: pasta, msgs/tamanho origem, msgs/tamanho destino, diferença) | **Log** (lista virtualizada simples, rola sozinha se estiver no fim).
- Resultado: selo verde/amarelo/vermelho do `describeExit`, dica, `mostFrequentError`, botões **Abrir log** e **Rodar de novo**.
- Aviso de cota (RF10) em destaque quando `quotaExceeded`.

### `src/renderer/lib/format.ts` (CRIAR) + `format.test.ts`
- `formatBytes` (KiB/MiB/GiB, vírgula decimal pt-BR), `formatDuration` (s → "1 h 05 min"), `formatSpeed`, `formatPercent`.

### Acréscimos da implementação
- `components/ServerFields.tsx`: host/porta/segurança/ajustes/certificado, usado no perfil e no `EndpointForm` (que também ganhou "aceitar certificado inválido", travado quando há perfil).
- `components/Toasts.tsx`: avisos do `jobs:start` e erros (5 s; erro 10 s).
- `lib/jobText.ts` + teste: `phaseText`, `jobResult` (título por modo, dica, código) e `estimateToCopy` (no "Medir tamanho" o parser não calcula o "falta copiar"; a interface soma origem − destino por pasta).
- `Chart.tsx` atualiza o mesmo gráfico (`setOption`) em vez de recriar a cada mudança.
- Simulação com pastas que não existem no destino: o resultado explica por que a % não andou e sugere "Só criar as pastas" antes.
- A barra "Bytes (estimado)" só aparece enquanto o job roda.
- "Uma conta" grava o formulário 800 ms depois da última mudança e, ao sair da tela, grava o que estiver pendente.

### Verificação Fase 5
- [x] `npm test`, `typecheck`, `lint`, `build` sem erro
- [x] Manual com o exe real e as contas públicas de teste: Testar login (sucesso e senha errada → "Falha de login na origem"), Medir tamanho (aba Pastas preenchida), Simular, Migrar com gráfico subindo e resultado verde; Parar no meio → "Parado"; Rodar de novo → mensagens puladas
- [x] Fechar a janela com job rodando pede confirmação e não deixa `imapsync.exe` órfão

---

## Fase 6: Tela "Várias contas" e painel do lote

### `src/renderer/pages/batch/BatchPage.tsx` (CRIAR)
- Barra: **Importar CSV** (botão ou arrastar arquivo), **Exportar (sem senhas)**, **Adicionar linha**, **Aplicar perfil** (origem e/ou destino nas linhas selecionadas), paralelismo 1–5, modo (Testar login / Medir / Simular / Migrar), **Iniciar todas**, **Parar todas**, **Repetir com erro**.
- Erros de importação aparecem numa lista ("linha 7: faltam colunas") sem bloquear as linhas boas.
- Aviso antes de iniciar: senha faltando em linhas (não inicia essas), mais de 3 contas no mesmo host em paralelo (RF10).

### `src/renderer/pages/batch/AccountsTable.tsx` (CRIAR)
- Colunas: seleção, rótulo, origem (host/usuário), destino (host/usuário), senha (●/vazio, editável num popover), status, % (mini barra), enviado, ETA, ações (iniciar/parar/repetir/abrir detalhes/remover).
- Edição inline de host/usuário; linha rodando fica travada.
- Clicar em uma linha abre o `JobPanel` daquela conta num painel lateral.

### `src/renderer/pages/batch/BatchSummary.tsx` (CRIAR)
- % geral por mensagens e por bytes (estimado), contadores (concluídas, com erro, rodando, na fila, paradas), gráfico de linha do total e enviados totais.

### Acréscimos da implementação
- Main: `JobSnapshot.scope` (`single` | `batch`, `jobs:start { scope? }`): o painel do lote soma só os jobs de "Várias contas". O `enqueue` tira da lista o job terminado anterior da mesma conta (fica só o mais novo de cada uma). Canais novos `jobs:remove { jobId }` (linha removida da tabela, só job terminado) e `jobs:batchSummary`; evento `jobs:batch` (`BatchSummary`, no máximo 1×/s). `batchSummarySchema` e `HOST_CONCURRENCY_WARN` em `model.ts`.
- % do lote = **média das contas** em Simular/Migrar (na fila conta 0; terminada sem ser parada conta 100). A soma das mensagens só das contas já em cópia caía cada vez que uma conta da fila começava. A série do lote recomeça quando o lote parado inicia de novo e não tira amostra no 1º início (os jobs antigos das outras linhas ainda estão na lista).
- `pages/batch/rows.ts` (+ teste): importação (perfil reconhecido por host/porta/segurança; linha repetida = mesma origem, destino **e extras**, só atualiza a senha), checagem antes de iniciar (`planStart`). `pages/batch/passwords.ts`: senhas do lote só na memória do renderer (sobrevivem à troca de tela, não ao fechar o app). `pages/batch/BatchDialogs.tsx`: diálogos de senhas, aplicar perfil, confirmação e o painel lateral (JobPanel + formulários completos da conta, travados enquanto roda).
- "Repetir com erro" e o "repetir" da linha usam `jobs:start` com os dados e senhas atuais da tabela (não o `jobs:retry`), para valer a senha corrigida. "Parar todas" para só os jobs do lote.
- Confirmação antes de iniciar sempre em Migrar e quando houver aviso (senha faltando, dados incompletos, mais de 3 no mesmo host).
- Linhas incompletas ficam só na memória; `accounts:save` recebe só as válidas.
- `lib/accounts.ts` (`blankAccount`, também usado em "Uma conta"); `csv.ts` exporta `parseHost`/`hostField` (host inline aceita `host:porta`).

### Verificação Fase 6
- [x] `npm test`, `typecheck`, `lint`, `build` sem erro
- [x] Importar um `file.txt` oficial e um CSV com cabeçalho (fixtures em `test/fixtures/`, testados pelo `accounts:importCsv`)
- [x] Manual: 4 contas de teste com paralelismo 2 → nunca mais de 2 jobs (o exe do PAR abre um 2º `imapsync.exe` filho de si mesmo: são até 4 no `tasklist`, 2 filhos diretos do Electron); uma linha com senha errada termina vermelha e **Repetir com erro** só roda ela
- [x] Exportar gera CSV sem nenhuma senha (teste automatizado; o diálogo de salvar não foi clicado à mão)
- [x] UI fluida com os jobs rodando (0,2 ms até o próximo quadro com 2 rodando e 2 na fila)

---

## Fase 7: Empacotamento, Sobre e Release

### `scripts/fetch-imapsync.ts` (CRIAR)
- Baixa `https://imapsync.lamiral.info/dist2/imapsync_2.314.zip`, confere SHA-256 (fixado no script a partir do zip já usado em `C:\Tools\imapsync\imapsync_2.314\`), extrai `imapsync.exe` e a licença para `vendor/imapsync/`. Se o exe já estiver lá com o hash certo, não baixa. Alternativa offline: `--from C:\Tools\imapsync\imapsync_2.314`.
- (Fase 7) Não havia o zip em `C:\Tools`: o hash do zip foi fixado a partir do download oficial, e o script confere também o SHA-256 do exe (igual ao de `C:\Tools`). Extração com o `tar.exe` do Windows (sem lib nova). O zip não traz arquivo de licença: o script grava `vendor/imapsync/LICENSE.txt` com o texto de imapsync.lamiral.info/LICENSE. `npm run dist` = `fetch-imapsync` + `licenses` + `build` + `electron-builder`.

### `electron-builder.yml` (CRIAR)
- Copiar do Memora; `appId: com.migramail.app`, `productName: MigraMail`, sem `asarUnpack`/`fileAssociations`/`npmRebuild`.
- `extraResources`: `vendor/imapsync/` → `imapsync/`, `NOTICE`, `THIRD_PARTY_LICENSES.md`.
- NSIS por usuário, `artifactName: MigraMail-Setup-${version}.${ext}`, fuses iguais.
- (Fase 7) Ícone: `scripts/make-icon.ts` gera `build/icon.ico` (envelope do logo, cores do tema); `npm run icon` roda antes do `dist`.

### `NOTICE` (CRIAR)
- Crédito: "Usa o imapsync 2.314 de Gilles Lamiral (https://imapsync.lamiral.info), licença NO LIMIT PUBLIC LICENSE", texto da licença; deixar claro que o MigraMail não é um produto oficial do imapsync.

### `src/renderer/pages/about/AboutPage.tsx` (CRIAR)
- Versão do app, versão do motor (lida de `imapsync.exe --version` uma vez e guardada), crédito e link do imapsync, botão "Abrir pasta de logs".
- (Fase 7) `src/main/imapsync/engine.ts`: o `--version` leva ~30 s, então a versão fica em `%APPDATA%\MigraMail\engine.json`, presa ao tamanho e à data do exe. Canais `about:engine`, `about:openLogs` e `about:openSite` (URL fixa, o renderer não manda link).

### `scripts/release.ts`, `scripts/third-party-licenses.ts`, `RELEASE.md` (CRIAR)
- Copiar do Memora e trocar nomes/repo. `npm run dist` roda `fetch-imapsync` antes do build.

### `README.md` (CRIAR)
- O que é, como instalar, nota sobre antivírus (exe sem assinatura), senhas de app no Gmail/M365, onde ficam os logs.

### Verificação Fase 7
- [x] `npm run dist` gera `dist/MigraMail-Setup-0.1.0.exe`
- [x] Instalar sem admin em `%LOCALAPPDATA%\Programs\MigraMail`, abrir e rodar "Testar login" com o exe embutido
- [x] `resources/imapsync/` tem o exe, a licença e o `NOTICE`
- [ ] Release criada no GitHub privado (só quando o Bruno pedir)

---

## Testes
- [ ] Unitário: parser com as 3 saídas reais + casos sintéticos; `buildArgs`/`checkExtraArgs`; CSV (2 formatos, export sem senha); `describeExit`; `format.ts`; stores com arquivo corrompido.
- [ ] Integração: `JobManager` com o exe falso (fila, paralelismo, parar, env com senha, código de saída); IPC `register` (remetente/payload); snapshot sem senha.
- [ ] Ponta a ponta manual (pendência do Bruno no `progress.md`): migração real de uma conta de cliente em `--dry` e depois real; lote de 10+ contas; parar no meio de um APPEND grande e rodar de novo.

## Ordem de implementação
1. Esqueleto → 2. Lógica pura → 3. Jobs no main → 4. Perfis/contas/senhas + IPC → 5. Uma conta + Perfis → 6. Várias contas + lote → 7. Empacotamento e Release

## Notas / Não fazer
- **Não** passar senha por argumento, nem gravá-la em `profiles.json`, `accounts.json`, log do app ou snapshot enviado ao renderer.
- **Não** confiar no padrão TLS do imapsync (não valida certificado): sempre `SSL_verify_mode=1`, salvo opção explícita no perfil.
- **Não** usar `shell: true` no `spawn` nem no `taskkill`.
- **Não** usar o PID file padrão (`%USERPROFILE%\tmp\imapsync.pid`): é compartilhado.
- **Não** reimplementar IMAP, nem adicionar OAuth2, agendamento, auto-update, telemetria ou inglês (PRD §4 Fora).
- **Não** expor `--delete1/2` na interface; só pelos argumentos extras, com aviso.
- **Não** adicionar lib fora da tabela de dependências sem atualizar esta Spec.
- Copiar os padrões de `~/memora`: `src/shared/ipc.ts`, `src/main/ipc/register.ts`, `src/preload/index.ts`, `src/main/secrets.ts`, `src/main/settings.ts` (`writeFileAtomic`), `src/renderer/components/Chart.tsx`, `electron-builder.yml`, `scripts/release.ts`.
- O parser é a peça central: toda linha nova reconhecida entra com teste usando uma saída real.
- Nome "MigraMail" segue provisório (PRD §8); trocar só `productName`, `appId` e textos se o Bruno decidir outro.
