# CLAUDE.md

## Projeto
**MigraMail** (nome provisório): app Windows com interface gráfica para migrar caixas de e-mail de um servidor IMAP para outro. Por baixo roda o `imapsync.exe` (embutido), uma conta por vez ou várias em paralelo, mostrando o tamanho dos dados e um gráfico da porcentagem já enviada.

## Stack
- TypeScript (strict) em todo o app
- Electron (main + preload) + React (renderer), build com electron-vite, testes com Vitest
- Gráficos: ECharts (mesma versão do Memora)
- Motor de migração: `imapsync.exe` 2.314 (licença NO LIMIT), rodado como processo filho
- Plataforma alvo: Windows 10 2004+ x64, instalador NSIS por usuário

## Fluxo de trabalho
- Este projeto usa Spec-Driven Development: `docs/PRD.md` → `docs/Spec.md` → implementação por fases.
- Implementar uma fase por vez, parar para revisão e registrar em `docs/progress.md`.
- Pendências que dependem do Bruno (contas reais, teste manual) não bloqueiam a fase: vão para o `progress.md`.
- Commits em Conventional Commits, só quando o Bruno pedir.

## Preparar numa máquina nova
- `npm install` (Node igual ao do Memora).
- O `imapsync.exe` não vai para o git: baixar o 2.314 para Windows em `imapsync.lamiral.info/dist2` (não no GitHub) e copiar para `vendor/imapsync/imapsync.exe`. `npm run fetch-imapsync` faz isso (confere o SHA-256; `-- --from <pasta>` sem internet).
- Estado atual e próxima fase: fim do `docs/progress.md`.
- Testes com o exe real usam as contas públicas `test1/test2.lamiral.info` (senhas `secret1`/`secret2`); o `test2` entrega o certificado do `test1`, então o destino usa `allowInvalidCert`. Teste manual: `npx tsx --tsconfig tsconfig.node.json scripts/try-job.ts`.

## Padrões
- Mesma organização do Memora (`~/memora`): `src/main`, `src/preload`, `src/renderer`, `src/shared` (tipos e contratos IPC)
- Todo canal IPC tipado em `src/shared/ipc.ts` e validado com zod; o renderer só acessa o sistema via `contextBridge`
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` em todas as janelas
- O parser da saída do imapsync é lógica pura, testada com as saídas reais em `test/fixtures/imapsync/`
- Interface e textos em pt-BR

## Restrições
- Senhas nunca na linha de comando, em log ou em arquivo em texto puro: vão ao imapsync por `IMAPSYNC_PASSWORD1/2`; salvas só via `safeStorage`
- Nunca desligar validação TLS por padrão
- Não usar a marca/logo do imapsync como se fosse o produto; creditar no "Sobre" e no NOTICE
- Sem telemetria
- Não adicionar libs sem registrar na Spec (versões com ≥ 2 semanas de publicadas)
