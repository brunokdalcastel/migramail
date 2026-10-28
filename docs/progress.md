# Progresso

## 2026-10-26 · Fase 1 (Research)
- Estudo do imapsync 2.314: código-fonte + execução contra test1/test2.lamiral.info.
- Confirmado: leitura ao vivo por pipe no Node e senhas via `IMAPSYNC_PASSWORD1/2`.
- `docs/PRD.md` gerado (rascunho), aguardando aprovação.

## 2026-10-26 · Fase 2 (Spec)
- `docs/Spec.md` gerada: 7 fases de implementação, aguardando aprovação.
- Achado: o imapsync não valida certificado TLS por padrão (`SSL_verify_mode=0`); a Spec força `SSL_verify_mode=1`. Validar na Fase 3 se o exe tem CAs.

- 2026-10-27: Spec aprovada pelo Bruno. Próximo: Fase 1 (Esqueleto).

## 2026-10-27 · Implementação · Fase 1 (Esqueleto) — concluída, aguardando revisão
- Projeto Electron + React + TS criado a partir do Memora: configs (electron-vite, tsconfig, vitest, eslint, prettier), `src/main` (index, windows, logger, errors, settings, `ipc/register.ts`), preload (`window.migramail`), `src/shared/{ipc,schemas}.ts`, renderer com tema escuro, `Shell` com **Uma conta / Várias contas / Perfis / Sobre** (páginas vazias) e componentes `Button`, `Dialog`, `Form`, `Icon`, `Chart`.
- IPC: `app:info`, `settings:get`, `settings:update` + evento `settings:changed`. Settings `{ parallelism: 2, lastMode, showBytesPercent }`; o app reabre na última tela de migração usada.
- Desvios pequenos da Spec:
  - `src/shared/schemas.ts` criado (settings e app:info), como no Memora; `model.ts` segue para a Fase 2.
  - Sem a lib `motion` (não está na tabela de dependências): `Dialog` e a troca de página animam com CSS (`.enter`/`.fade`).
  - Estado da página fica em `useState` no `App`; o `store.ts` (zustand) nasce na Fase 5 com os jobs.
  - `dist` ainda é só `build + electron-builder`; o `fetch-imapsync` entra na Fase 7. `licenses`/`release` apontam para scripts da Fase 7.
  - CSP do `index.html` igual à da Spec, mais `script-src`/`connect-src 'self'`, `object-src 'none'` e `base-uri 'none'` (mais restrita; o dev afrouxa só no Vite).
- Verificação: `typecheck`, `lint`, `build` sem erro; `npm test` 12/12 (`register.test.ts`: remetente, payload inválido, erro interno, contrato da resposta, UserError, settings); `npm run dev` sobe; teste de fumaça no build: 4 itens no menu, `window.require`/`process` indefinidos no renderer, IPC ok, console sem erros/avisos, `settings.json` grava `lastMode`.
- `npm audit`: 3 avisos "high" em electron 44.5.1, vite 7.3.6 e zod 4.6.5 — as versões fixadas na Spec (as mesmas do Memora). Atualizar exige mudar a tabela da Spec; decisão do Bruno.
- Próximo: Fase 2 (lógica pura).

## 2026-10-27 · Implementação · Fase 2 (Lógica pura) — concluída, aguardando revisão
- Criados: `src/shared/model.ts` (schemas zod de perfil, endpoint, opções, conta, `JobSecrets`, `JobProgress`, `defaultPort`, `defaultMigrationOptions`), `src/shared/exitCodes.ts` (tabela completa do RE §3 em pt-BR + `describeExit`), `src/shared/csv.ts`, `src/main/imapsync/args.ts`, `src/main/imapsync/parser.ts` e os testes (`parser`, `args`, `csv`, `exitCodes`).
- Correções da Spec achadas nos dados reais / no fonte (Spec já atualizada):
  - `N/M msgs left` é global da conta, não por pasta: % = `(M − N)/M`; `doneBeforeFolder` removido.
  - Linha do `--dry` não tem `{bytes}` nem velocidade (fonte, linha 13002); `copying to` sem `--dry` só sai com `--debug` e é ignorado (contaria em dobro).
  - Velocidade vem em KiB/MiB/GiB/s (`bytes_display_string_bin`); o parser converte para KiB/s.
  - Nomes `[X] = [Y]` (UTF-7 + UTF-8) também no `Folder i/N ... -> ...`; o parser guarda o nome legível (Y).
- Pequenas adições/decisões:
  - Linha `Host1: connecting and login` também leva a fase para `login` (o cabeçalho "Entrando nos servidores" aparece antes do sucesso).
  - `buildArgs` recebe `profileExtraArgs` (os extras dos perfis), já que `Account` só guarda `profileId`.
  - Segurança `none` passa `--nossl1 --notls1` (o imapsync liga SSL sozinho no probe se só tiver `--nossl1`); `syncinternaldates: false` vira `--nosyncinternaldates`.
  - CSV: porta 143 importada vira STARTTLS; sem cabeçalho só aceita o `file.txt` (`;`). O export perde a segurança "nenhuma" (só host:porta).
- Verificação: `npm test` 56/56, `typecheck`, `lint` e `prettier --check` sem erro; nenhum arquivo da fase importa `electron`.
- Próximo: Fase 3 (jobs no main).

## 2026-10-27 · Implementação · Fase 3 (Jobs no main) — concluída, aguardando revisão
- Criados: `src/main/imapsync/{paths,job,manager,instance}.ts`, `manager.test.ts`, `test/fixtures/fake-imapsync.mjs`, `scripts/try-job.ts`; tipos `JobSnapshot`/`JobStatus`/`JobSeriesPoint`/`BatchSummary` em `src/shared/model.ts`. `index.ts`: confirmação ao fechar com job ativo (via `browser-window-created`, vale para janela recriada) e `before-quit` que para tudo (até 5 s) antes de sair.
- `vendor/imapsync/imapsync.exe` copiado de `C:\Tools\imapsync\imapsync_2.314` (fora do git; o `fetch-imapsync` da Fase 7 substitui).
- Decisões pequenas (Spec atualizada):
  - `instance.ts` (singleton do `JobManager` com o exe real e o paralelismo das settings) separado do `manager.ts`, que fica sem electron para o Vitest.
  - `retry` troca o job terminado por um novo (evento `onRemove`); senhas ficam só na memória do manager.
  - `enqueue` também recusa extras com erro do `checkExtraArgs` (senha na linha de comando etc.).
  - Senhas (≥ 3 caracteres) que aparecerem na saída viram `MASKED` no `logTail` (defesa contra `--debugimap` nos extras). O log em arquivo do próprio imapsync não passa por essa máscara.
  - Série: depois de 1.800 pontos descarta um a cada dois **e** passa a amostrar com metade da frequência, para manter o espaçamento igual.
  - O exe falso aceita `--fixture/--delay/--report/--leak` pelos argumentos extras; `--delay 0` imprime tudo de uma vez (o timer do Windows tem ~15 ms e estourava o tempo do teste).
- Achados com o exe real:
  - **TLS**: o exe tem CAs; `SSL_verify_mode=1` loga no `test1`. O `test2.lamiral.info` entrega o certificado do `test1` (CN/SAN `test1.lamiral.info`), então com validação o destino falha com 102, como deve. Nos testes o destino usa `allowInvalidCert`. Sem mudança de Spec.
  - **Partida lenta em toda execução**: ~25–35 s até a 1ª linha, na 1ª e na 2ª execução igual. O exe (PAR::Packer, empacotado com limpeza) extrai ~35 MB / 360 arquivos em `%TEMP%\par-<usuário>\temp-<pid>` a cada vez; `PAR_GLOBAL_CLEAN=0` é ignorado. Quase sem CPU no imapsync durante a espera; o Defender (MsMpEng) varrendo os arquivos extraídos é o suspeito provável. Nota do `JobPanel` (Fase 5) ajustada para "cerca de 30 s".
  - **Sobra no TEMP**: o `taskkill` deixa os ~35 MB em `temp-<pid>` e a saída normal deixa 2 arquivos; o `Job` agora apaga essa pasta ao fim de todo job (testado).
- Tempos medidos (`scripts/try-job.ts`): login da origem em 35,0 s na 1ª execução e 31,0 s na 2ª; 1ª linha da saída em 32,4 s / 28,5 s; migração de 2 pastas/9 mensagens em 62 s (copiou 8, pulou 1) e a 2ª em 49 s (pulou 9).
- Verificação: `npm test` 68/68 (rodado 3–5× sem falha intermitente), `typecheck`, `lint`, `prettier --check` e `build` sem erro. Teste real: linhas chegam ao vivo (~50 lotes por job), 1ª copia e 2ª pula, parada termina "Parado" com 0 `imapsync.exe` no `tasklist`.
- Não testado à mão: o diálogo de fechar com job rodando (ainda não há como iniciar job pela interface; fica para a verificação da Fase 5).
- Pendências do Bruno:
  - Decidir sobre a partida de ~30 s: aceitar, sugerir exclusão do Defender para `%TEMP%\par-*` no README, ou buscar outro build do imapsync.
- Próximo: Fase 4 (perfis, contas salvas, senhas e IPC).

## 2026-10-27 · Implementação · Fase 4 (Perfis, contas salvas e senhas) — concluída, aguardando revisão
- Criados: `src/main/store/{profiles,accounts,passwords}.ts`, `src/main/secrets.ts` (do Memora + `secretIds()`), `src/main/ipc/{profiles,accounts,jobs}.ts`; canais e eventos novos em `src/shared/ipc.ts`; em `model.ts`, `BUILTIN_PROFILES`, `applyProfile` e os schemas zod de `JobSnapshot`/`JobProgress`.
- Decisões (Spec atualizada):
  - Perfis prontos (Gmail, Microsoft 365) ficam no código, não no `profiles.json`: nunca se perdem com arquivo corrompido e uma correção de host chega a quem já instalou.
  - Conta presa a um perfil usa os dados **atuais** do perfil (`applyProfile` no `accounts:load` e no `jobs:start`); perfil excluído vira "Personalizado".
  - `accounts:save` aceita `passwords` para lembrar a senha sem precisar iniciar (útil na tabela da Fase 6) e apaga as senhas de contas que saíram da lista.
  - `jobs:start`: senha vazia usa a lembrada só se "lembrar senha" estiver marcado; desmarcado apaga a salva. Se a criptografia do Windows faltar, a migração roda e volta o aviso "a senha não foi salva".
  - Evento novo `jobs:removed` (o retry troca o job); `jobs:changed` manda só os jobs que mudaram, juntados a cada 100 ms.
  - `jobSnapshotSchema` é estrito: em dev, um campo a mais no snapshot (ex.: senha) barra o envio.
  - CSV: aceita UTF-8 e cai para Windows-1252 (CSV salvo pelo Excel em pt-BR); export grava com BOM para o Excel ler os acentos.
- Fica para a Fase 6: canal do `batchSummary()` (painel do lote), que a Spec ainda não lista.
- Verificação: `npm test` 95/95 (3 rodadas sem falha), `typecheck`, `lint`, `prettier --check` e `build` sem erro. Testes leem `accounts.json`, `profiles.json`, `secrets.json` e os logs: nenhum contém a senha; `secrets.json` só tem base64 cifrado.
- Não testado à mão: os diálogos de exportar CSV e "Abrir log" (sem interface ainda; ficam para a verificação das Fases 5 e 6).
- Próximo: Fase 5 (telas "Uma conta" e "Perfis").

## 2026-10-27 · Implementação · Fase 5 (Telas "Uma conta" e "Perfis") — concluída, aguardando revisão
- Criados: `src/renderer/app/store.ts` (zustand: jobs pelos eventos, log só do job aberto, toasts, settings, perfis, contas salvas), `pages/single/SinglePage.tsx`, `pages/profiles/ProfilesPage.tsx`, `components/{EndpointForm,OptionsForm,ServerFields,JobPanel,Toasts}.tsx`, `lib/{format,jobText}.ts` com testes. `App.tsx` liga o store e mostra as duas telas novas.
- Mudanças pequenas fora do renderer (Spec atualizada):
  - `splitArgs`/`checkExtraArgs` foram para `src/shared/extraArgs.ts` (avisos dos argumentos extras ao vivo no formulário); `args.ts` reexporta.
  - `initialProgress` foi para `src/shared/model.ts` (o teste do renderer não importa do main).
  - Parser: linha nova `dryNotSimulated`. Achado com o exe real: no `--dry`, pasta que ainda não existe no destino **não tem a cópia simulada** (fonte, linha 10812), então a simulação terminava "Concluída" com 0% sem explicação. Agora o resultado explica e sugere "Só criar as pastas" antes. Saída real em `test/fixtures/imapsync/run_dry_newfolders.txt` (sem senha), com teste.
  - `Chart.tsx` atualiza o mesmo gráfico em vez de recriar a cada 2 s.
- Decisões de interface:
  - "Aceitar certificado inválido" também no lado da conta (sem perfil não havia como testar o `test2`), com o aviso vermelho; com perfil, fica travado.
  - "Falta copiar" no "Medir tamanho" é calculado na interface pelas pastas (o parser só calcula ao começar a cópia).
  - A barra "Bytes (estimado)" some quando o job termina: na 2ª execução ela ficava em 0% com mensagens em 100% (a estimativa era 1 KiB de uma duplicada pulada).
  - O painel do job rola para a tela ao iniciar (ficava abaixo dos formulários).
  - Avisos (toasts): 5 s; erro 10 s.
- Bug achado no teste e corrigido: trocar de tela menos de 800 ms depois de mexer no formulário perdia a mudança (a tela é recriada a partir do que foi salvo). Agora grava o pendente ao sair da tela e o store já guarda a versão nova antes de o main responder.
- Verificação: `npm test` 113/113, `typecheck`, `lint`, `prettier --check` e `build` sem erro. Teste manual no app compilado (dirigido por CDP, `--user-data-dir` separado), contra `test1/test2.lamiral.info`, subpasta `gui_probe_bruno_f5`:
  - Testar login com senha errada → "Falha de login na origem", código 161, destino "Entrou"; com a certa → "Login funcionou nos dois servidores".
  - Medir tamanho → 394 MiB na origem, aba Pastas com as 26 pastas.
  - Simular (2 pastas) → explicação das pastas não simuladas.
  - Migrar (confirmação "Copiar de test1 … para test2 …?") → 8 copiadas + 1 pulada, 100%, gráfico subindo, verde. Rodar de novo → 0 copiadas, 9 puladas.
  - Parar com 5 de 47 copiadas → "Parado" (12%), 0 `imapsync.exe`; Rodar de novo → 41 copiadas + 6 puladas.
  - Reabrir o app → formulário restaurado; senha da origem lembrada (placeholder "Senha lembrada"), a do destino não. `accounts.json` sem senha; `secrets.json` sem texto puro.
  - Fechar pelo X (WM_CLOSE): "Há 1 migração em andamento. Parar e sair?"; Cancelar mantém o job; "Parar e sair" fecha com 0 `imapsync.exe`. Obs.: `window.close()` vindo da página fecha sem o diálogo (o Electron não emite `close` nesse caminho), mas o `before-quit` para os jobs do mesmo jeito. O app não chama `window.close()`.
  - Perfis: obrigatórios, aviso/erro dos extras ao vivo, porta acompanha a segurança, Gmail somente leitura com "Duplicar", conta presa ao perfil acompanha a edição e vira "Personalizado" quando ele é excluído.
- Próximo: Fase 6 (Várias contas e painel do lote).

## 2026-10-27 · Implementação · Fase 6 (Várias contas e painel do lote) — concluída, aguardando revisão
- Criados: `src/renderer/pages/batch/{BatchPage,AccountsTable,BatchSummary,BatchDialogs}.tsx`, `rows.ts` (+ teste), `passwords.ts`, `src/renderer/lib/accounts.ts`, `test/fixtures/{file.txt,contas.csv}`. `App.tsx` mostra a tela; `JobPanel` exporta `ProgressChart`/`Percent` para o painel do lote.
- Main (Spec atualizada em "Acréscimos"): job com `scope` (`single`/`batch`), `enqueue` troca o job terminado anterior da mesma conta, `remove`, canal `jobs:batchSummary` e evento `jobs:batch` (1×/s). O resumo e a série do lote contam só os jobs do lote.
- Decisões:
  - % geral = média das contas (fila = 0, terminada = 100). Com a soma de mensagens, o gráfico caía de 100% para 66% quando a 3ª conta começava (visto no teste real).
  - Linha repetida na importação = mesma origem, destino e extras; reimportar o mesmo arquivo só devolve as senhas (útil depois de reabrir o app, já que as senhas do lote ficam só na memória).
  - Perfil reconhecido na importação pelo host/porta/segurança (Gmail/M365 ganham o ajuste do provedor sozinhos).
  - "Repetir com erro" usa `jobs:start` com os dados e senhas atuais (com `jobs:retry` a senha corrigida não valeria).
  - Host inline aceita `host:porta` (mesma regra do CSV); com perfil, fica travado.
- Achado: cada job do imapsync são **2 processos** `imapsync.exe` (o exe do PAR::Packer abre uma cópia de si como filho). Paralelismo 2 = até 4 no `tasklist`; o certo é contar os filhos diretos do Electron (máximo 2 no teste).
- Verificação: `npm test` 126/126, `typecheck`, `lint`, `prettier --check` e `build` sem erro. Manual no app compilado (CDP, `--user-data-dir` separado), `test1 → test2` com `--subfolder2 gui_probe_bruno_f6{a..d} --folder INBOX.Urlaub --folder Borrador` nos extras do CSV:
  - Importar CSV pelo botão: 4 linhas, destino reconhecido pelo perfil "test2 (teste)" (com `allowInvalidCert`); reimportar → "4 linhas já estavam na tabela: só a senha foi atualizada".
  - Iniciar todas (Migrar, paralelismo 2) com confirmação: A/B/C "Concluído" 100% (166 KiB cada), D "Falha de login na origem"; painel do lote 3 concluídas, 1 com erro, 497 KiB.
  - Repetir com erro: só a D rodou de novo (confirmação "Iniciar 1 conta?"). Senha corrigida no diálogo + "lembrar" → D concluída; `accounts.json`/`secrets.json` sem a senha em texto.
  - Parar todas com 2 rodando e 2 na fila → as 4 "Parado", 0 `imapsync.exe`.
  - Aplicar perfil: "Personalizado" destrava o host, o perfil trava de novo. Reabrir o app volta na tela do lote com os rótulos.
- Não testado à mão: o diálogo nativo de "Exportar" (o conteúdo sem senha é coberto pelos testes) e arrastar arquivo para a tela (o caminho é o mesmo do botão).
- Pendências do Bruno: lote real de 10+ contas de cliente (já listado em "Testes" da Spec); a decisão da partida de ~30 s (Fase 3) segue aberta.
- Próximo: Fase 7 (empacotamento, Sobre e Release).


## 2026-10-27 · Implementação · Fase 7 (Empacotamento, Sobre e Release) — concluída, aguardando revisão
- Criados: `scripts/fetch-imapsync.ts`, `electron-builder.yml`, `NOTICE`, `THIRD_PARTY_LICENSES.md` (gerado), `scripts/{release,third-party-licenses}.ts` (do Memora), `RELEASE.md`, `README.md`, `src/main/imapsync/engine.ts` (+ teste), `src/renderer/pages/about/AboutPage.tsx`. Canais `about:engine`, `about:openLogs`, `about:openSite`. O `Placeholder` do `Shell` saiu (todas as telas existem).
- Decisões (Spec atualizada):
  - `fetch-imapsync` confere o SHA-256 do zip **e** do exe; o hash do zip veio do download oficial (não havia zip em `C:\Tools`), o do exe bate com o de `C:\Tools`. Extrai com o `tar.exe` do Windows, sem lib nova. Testado: download, "já está no lugar" e `--from`.
  - O zip não tem arquivo de licença: o script grava `vendor/imapsync/LICENSE.txt` com o texto da NO LIMIT PUBLIC LICENSE do site.
  - Versão do motor: `imapsync.exe --version` leva ~36 s, então fica em `engine.json` (tamanho + data do exe); a tela mostra "Lendo a versão… (cerca de 30 s na primeira vez)".
  - `npm run dist` roda `fetch-imapsync` → `licenses` → `build` → `electron-builder`.
- Verificação: `npm test` 128/128, `typecheck`, `lint`, `prettier --check` sem erro. `npm run dist` gerou `dist/MigraMail-Setup-0.1.0.exe` (122 MiB). Instalado com `/S`, sem admin, em `%LOCALAPPDATA%\Programs\MigraMail`; `resources\imapsync\` tem `imapsync.exe` (hash certo), `LICENSE.txt` e `NOTICE`. No app instalado (dirigido por UI Automation, porque o app instalado recusa a porta de depuração, como deve): "Testar login" test1 → test2 rodou o exe de `resources\imapsync` e deu "Login funcionou nos dois servidores"; "Sobre" mostrou 0.1.0 e "imapsync 2.314" depois de 26 s; nenhuma sobra em `%TEMP%\par-*`.
- Obs.: `--user-data-dir` sem aspas num caminho com espaço não pegou, e o teste gravou um `accounts.json` com as contas de teste no `%APPDATA%\MigraMail` real; já apagado.
- Não testado à mão: "Abrir pasta de logs" e "Site do imapsync" (abrem o Explorer/navegador; código igual ao do "Abrir log").
- Pendências do Bruno:
  - Release no GitHub (`npm run release`): só quando pedir; precisa de commit (nada commitado desde as fases 1–4).
  - Seguem abertas: partida de ~30 s (Fase 3; o README já explica) e os testes reais com contas de cliente.
- Ícone (pedido do Bruno): `scripts/make-icon.ts` (como no Memora) desenha `build/icon.ico` em 16–256 px com o envelope do logo da barra de título, fundo `--accent` e traço `--accent-fg`; `npm run icon` entra no começo do `npm run dist`. Conferido no `MigraMail.exe` instalado e no instalador.
- README com "Como usar" (Uma conta, Várias contas, Perfis, Sobre) e 9 prints em `docs/img/`, gerados por `npm run screenshots` (`scripts/screenshots.cjs`, como no Memora): abre o `out/` com `.demo/` como pasta de dados e migra de verdade test1 → test2 em subpastas `gui_readme_<hora>_*` (~6 min). O andamento vai para `.demo/screenshots.log` (o stdout do Electron não chega ao terminal no Windows).
- Bug achado nos prints e corrigido: depois de migrar, "Tamanho no destino" ficava com o valor da medição inicial (0 B numa pasta nova). Agora a medição final atualiza só o `totalSize2`; a origem segue como base da estimativa. Teste do parser ajustado (128/128).
- O botão "Baixar" do README aponta para `releases/latest/download/MigraMail-Setup.exe`: só funciona depois do `npm run release`.

## 2026-10-27 · Ajuste pedido pelo Bruno: pastas copiadas exatamente como estão
- "Mapear pastas especiais" (`--automap`) passou a vir **desligado** e foi renomeado para "Juntar pastas especiais com as do destino", com a explicação do que muda. Desligado, o app manda `--noautomap` (os presets `--gmail1/2` do imapsync ligam o automap sozinhos). Pastas comuns (ex.: `teste`) sempre foram com o mesmo nome; o automap só mexia em Enviados/Lixeira/Rascunhos/Spam.
- Continuam valendo os ajustes de provedor do imapsync: com Gmail, o prefixo `[Gmail]/` sai do nome no destino; com Microsoft 365 no destino, a pasta `Files` vira `Files_renamed_by_imapsync` (o M365 não aceita essa pasta). PRD, Spec e README atualizados.

## 2026-10-27 · Senhas fora do log mesmo com argumentos extras
- Testado com o exe real (`--justlogin` test1/test2): `--debugenv` imprime `IMAPSYNC_PASSWORD1/2`; `--showpasswords` + `--debugimap` grava `LOGIN <usuário> <senha>`; `--debugimap`, `--debug`, `--debugcontent` e `--showpasswords` sozinhos não mostraram a senha.
- `checkExtraArgs`: `--showpasswords` e `--debugenv` viram erro (o job não inicia; vale para extras da conta, do perfil e do CSV, porque o `enqueue` confere); `--debugimap`, `--debugimap1/2` e `--debugcontent` viram aviso (conteúdo das mensagens no log). Testes 130/130.
