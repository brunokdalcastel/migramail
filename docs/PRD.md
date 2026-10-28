# PRD: MigraMail — interface gráfica para o imapsync

> Data: 2026-10-26 · Status: rascunho

## 1. Problema
Migrar e-mails de um servidor para outro (troca de provedor, de hospedagem, ida para o M365/Google) com o imapsync hoje significa montar linhas de comando ou `.bat` na mão, ler centenas de linhas de log para saber se está andando e não ter ideia de quanto falta. Com várias contas de um cliente, o `.bat` oficial roda uma de cada vez, sem visão geral. O Bruno (técnico de MSP) precisa de uma tela que faça isso de forma visível e repetível.

## 2. Objetivo e resultado esperado
- Migrar uma conta preenchendo um formulário, sem tocar em linha de comando.
- Migrar N contas (importadas de CSV ou digitadas) com paralelismo configurável.
- Ver, por conta e no total: tamanho na origem e no destino, quanto falta, bytes enviados, velocidade, ETA e um gráfico da % enviada.
- Saber no fim, sem ler log, se cada conta terminou bem, e se não, por quê (código de saída traduzido).

## 3. Usuários e cenários de uso
- **Bruno, técnico de MSP**, no PC dele (Windows 11):
  - Migração de 1 caixa de um cliente, com teste de login antes.
  - Migração de 10–50 caixas de um domínio (planilha do cliente), rodando de 2 a 5 em paralelo, em várias passadas (antes e depois da troca do MX).

## 4. Escopo
### Dentro
- Modo **Uma conta**: formulário origem/destino (host, porta, segurança SSL/STARTTLS/nenhuma, usuário, senha), opções comuns, botões "Testar login", "Medir tamanho", "Simular" e "Migrar".
- Modo **Várias contas**: tabela editável (linha = conta), importar CSV no formato do `file.txt` oficial (`host1;user1;senha1;host2;user2;senha2;extras;`) e CSV com cabeçalho, exportar a tabela sem senhas, paralelismo 1–5 (padrão 2), iniciar/parar tudo ou uma linha.
- **Perfis de servidor**: salvar origem/destino (host, porta, segurança, opções), escolher num combo no formulário e na tabela.
- **Progresso** por conta: fase (iniciando → login → medindo pastas i/N → copiando pasta i/N → medição final → concluído), barra e gráfico de % ao longo do tempo, bytes enviados, mensagens copiadas/puladas, velocidade, ETA.
- **Painel do lote**: % geral (por mensagens e por bytes), contas concluídas/com erro/na fila, gráfico total.
- **Resultado**: status por conta a partir do código de saída (tabela da seção 6), resumo final (`Messages transferred`, `Total bytes transferred`, erros), botão "Abrir log" e "Rodar de novo".
- Opções expostas: `--automap` (desligado por padrão desde 2026-10-27, a pedido do Bruno: as pastas vão com o mesmo nome), `--dry`, `--justfolders`, `--subfolder2`, `--exclude`, `--folder`, `--f1f2`, `--syncinternaldates`, `--maxbytespersecond`, `--errorsmax`, presets `--gmail1/2` e `--office1/2`, campo "argumentos extras".
- Log por conta numa pasta do app (`--logdir`), com o log completo visível numa aba.
- Instalador NSIS por usuário com o `imapsync.exe` embutido; Release no GitHub privado.

### Fora (não fazer agora)
- OAuth2 interativo (login Microsoft/Google pelo app). No MVP só senha / senha de app; `--oauthaccesstoken` fica disponível pelo campo "argumentos extras".
- `--delete1` (apagar da origem) e `--delete2`: perigosos; ficam só por argumentos extras, com aviso.
- Agendamento, serviço Windows, modo servidor/web, multiusuário.
- Reimplementar o protocolo IMAP: o motor é sempre o imapsync.
- Auto-update, telemetria, inglês.

## 5. Restrições
- Stack: Electron + React + TypeScript (igual ao Memora), ECharts para gráficos, zod no IPC.
- Custo: zero (sem serviços).
- Onde roda: desktop Windows 10/11 x64, por usuário, sem admin.
- Rede: o app só fala com os servidores IMAP do usuário (via imapsync); nada mais.

## 6. Contexto técnico encontrado
Base: leitura do código-fonte do imapsync 2.314 (`imapsync.pl`) e execuções reais contra test1/test2.lamiral.info.

### Código existente para reutilizar / copiar padrão
- `~/memora/package.json` — versões já fixadas e testadas de Electron 44.5.1, electron-vite 5.0.0, React 19.3, ECharts 6.1.0, zod 4.6.5, Vitest 5.0.3, electron-builder 26.17.0, electron-log 5.4.4, zustand 5.0.15, Tailwind 4.3.3.
- `~/memora/electron-builder.yml` — NSIS por usuário, `extraResources`, fuses do Electron; copiar e trocar o `extraResources` para incluir o imapsync.
- `~/memora/src/shared/ipc.ts` + `src/main/ipc/*` — padrão de canal IPC tipado com zod.
- `~/memora/src/main/secrets.ts` — guardar segredo com `safeStorage` (para senhas de perfis/contas salvas).
- `~/memora/scripts/release.ts` e `RELEASE.md` — fluxo de Release no GitHub.
- `~/memora/src/renderer` — tema escuro, Tailwind, componentes; e o uso de ECharts nas telas de evolução.

### Documentação e APIs (com fonte)
- **imapsync 2.314** — saída, opções e códigos de saída: ver o código-fonte (`imapsync.pl` linhas 1050, 1079–1105, 4887–5214, 13995–14035, 14334–14400, 16645–16720).
  Linhas que o parser precisa reconhecer (todas observadas no exe):
  ```
  Host1: success login on [test1.lamiral.info] with user [test1] auth [LOGIN] or [LOGIN]
  Host1 folder    2/26 [Archive]                           Size:     47720 Messages:     1 Biggest:     47720
  Host2 folder    2/26 [Archive]                           Size:   3865137 Messages:     6 Biggest:   1240659
  Host1 Nb messages:                 2263 messages
  Host1 Total size:             412660890 bytes (393.544 MiB)
  Folder     1/2 [Borrador]                          -> [gui_probe_bruno.Borrador]
  msg Borrador/37 {1050}           copied to gui_probe_bruno.Borrador/1          0.26 msgs/s  0.263 KiB/s 1.025 KiB copied ETA: Monday 26 October 2026-10-26 21:32:22 -0300  27 s  7/9 msgs left
  ETA: Monday 26 October 2026-10-26 21:32:00 -0300  1 s  1/9 msgs left
  Messages transferred                    : 8
  Total bytes transferred                 : 169494 (165.521 KiB)
  Exiting with return value 161 (EXIT_AUTHENTICATION_FAILURE_USER1) 1/50 nb_errors/max_errors PID 28280
  ```
  Códigos de saída: 0 OK · 1 genérico · 6 sinal · 7 parado por arquivo · 8 PID file · 10/101/102 conexão (geral/origem/destino) · 12 TLS · 16/161/162 autenticação (geral/origem/destino) · 21 subfolder1 · 111 terminou com erros · 112 limite de erros · 113 cota do destino · 114–117 APPEND/FETCH/CREATE/SELECT · 118 limite de bytes · 119 antivírus · 120/121 FLAGS/SEARCH.
- **Cálculo da %** (decisão desta pesquisa):
  - % por mensagens (principal, exata) = `(total − msgs left) / total`, vindo das linhas `msg ... ETA ... X/Y msgs left` e `ETA: ... X/Y msgs left`. Conta as mensagens puladas (que não imprimem linha própria).
  - Bytes enviados = soma dos `{N}` das linhas `copied`.
  - "Falta copiar" estimado = Σ por pasta `max(0, tamanho Host1 − tamanho Host2)` da medição inicial; a % por bytes = enviados / estimado (limitada a 100%).
  - As linhas `Host1 folder` / `Host1 Total size` aparecem de novo na medição final: o parser muda de fase ao ver o primeiro `Folder i/N` e ao ver `msgs left` chegar a 0 no último `Folder`.
- **Node `child_process.spawn`** — `env` por processo e `windowsHide`; leitura de `stdout` por evento `data` com buffer de linha. Testado em 2026-10-26: as linhas chegam em tempo real (o imapsync faz autoflush). https://nodejs.org/api/child_process.html#child_processspawncommand-args-options
- **Electron `safeStorage`** — `encryptString`/`decryptString` com DPAPI no Windows. https://www.electronjs.org/docs/latest/api/safe-storage
- **Parar um job**: matar o processo (`taskkill /PID <pid> /T /F` ou `child.kill()`) é seguro porque rodar de novo retoma (mensagens presentes são puladas: observado 8 copiadas na 1ª, 1 pulada/0 copiadas na 2ª).

### Repositórios de referência
- https://github.com/imapsync/imapsync — fonte do motor, FAQs por provedor (`FAQ.d/FAQ.Office365.txt`, `FAQ.Gmail.txt`), `file.txt` e `sync_loop_windows.bat` (formato do lote).
- Distribuição Windows: https://imapsync.lamiral.info/dist2/imapsync_2.314.zip (o GitHub não tem o `.exe`).

## 7. Requisitos
### Funcionais
- RF1: Formulário de uma conta com origem/destino, perfis salvos e validação dos campos.
- RF2: "Testar login" (`--justlogin`) e "Medir tamanho" (`--justfoldersizes`) mostram o resultado sem copiar nada; a medição lista pastas com tamanho/mensagens nos dois lados.
- RF3: "Simular" (`--dry`) e "Migrar" rodam o imapsync com as opções escolhidas e mostram progresso ao vivo.
- RF4: Tabela de várias contas: adicionar/editar/remover linha, importar CSV (`;` do `file.txt` e CSV com cabeçalho `host1,user1,password1,host2,user2,password2,extra`), aplicar perfil de origem/destino a várias linhas.
- RF5: Fila com paralelismo 1–5; iniciar todas, parar todas, iniciar/parar/repetir uma linha; linhas com erro podem ser repetidas sozinhas.
- RF6: Para cada conta: fase atual, barra de %, gráfico da % no tempo, tamanho origem/destino, bytes enviados, mensagens copiadas/puladas/erros, velocidade, ETA.
- RF7: Painel total do lote com % geral e gráfico, contas por status.
- RF8: Ao terminar, status traduzido do código de saída e resumo final; dica legível quando houver ("Verifique a senha da origem", "Cota do destino vai estourar").
- RF9: Log completo por conta numa aba e em arquivo (`%APPDATA%\MigraMail\logs\`), com senha mascarada (o imapsync já mascara).
- RF10: Avisos antes de começar: cota do destino insuficiente (linha `Quota limit will be exceeded`), muitas contas em paralelo no mesmo servidor.

### Não funcionais
- RNF1: Senhas nunca na linha de comando: passadas por `IMAPSYNC_PASSWORD1/2` no `env` do processo filho; salvas só se o usuário marcar "lembrar senha", com `safeStorage`.
- RNF2: Cada job com `--pidfile` e `--logdir` próprios (o PID file padrão é compartilhado e se sobrescreve).
- RNF3: UI fluida com 5 jobs paralelos: atualizações de progresso agregadas no main e enviadas ao renderer no máximo 4×/s por job.
- RNF4: Parser coberto por testes com as saídas reais de `test/fixtures/imapsync/` (start, medição, cópia, pulada, erro de login, fim).
- RNF5: Fechar o app com jobs rodando pede confirmação e encerra os processos filhos (sem órfãos).
- RNF6: Instalador por usuário, sem admin; `imapsync.exe` em `resources/imapsync/` com NOTICE e licença.

## 8. Riscos e dúvidas em aberto
- [ ] **Nome do produto**: "MigraMail" é provisório. Prefere outro?
- [ ] O exe leva ~30 s até o login (descompactação do Perl empacotado na 1ª execução + conexão). Mostrar "iniciando…" — verificar se nas execuções seguintes cai.
- [ ] Antivírus pode reclamar do `imapsync.exe` sem assinatura dentro do instalador. Mitigar com documentação; avaliar assinar o app depois.
- [ ] Gmail/M365 sem OAuth2 dependem de senha de app / IMAP básico liberado. Fica documentado na tela de perfis; OAuth2 interativo é candidato a versão 2.
- [ ] A % por bytes é estimativa (pasta com mesmo tamanho nos dois lados não garante mensagens iguais). A % por mensagens é a referência; a de bytes vai com o rótulo "estimado".
- [ ] Parar no meio de um APPEND grande: assumido seguro (servidor descarta APPEND incompleto), validar num teste manual.
