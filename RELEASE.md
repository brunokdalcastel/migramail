# MigraMail 0.1.1

Atualização de segurança com licença MIT e ajustes de paralelismo.

- Argumentos extras aceitam apenas opções de dados documentadas. Comandos, tokens, depuração, exclusões e sobrescrita de servidor/modo são recusados.
- Validação de extras na importação CSV, armazenamento, exportação e execução.
- Atualizados Electron para 44.10.0, Vite para 7.3.7 e Zod para 4.6.7.
- Limite de contas em paralelo confirmado antes de iniciar o lote e reconciliado no processo principal.
- Adicionada licença MIT, preservando licenças de terceiros; metadados pessoais removidos das fixtures atuais.
- 152 testes automatizados aprovados, typecheck, lint e build aprovados. Dois logins simultâneos verificados com imapsync 2.314 real, sem copiar ou apagar mensagens. A serialização relatada na versão anterior não foi reproduzida.

Instale MigraMail-Setup.exe. Em Várias contas, selecione 2 ou mais em Em paralelo. A inicialização do imapsync pode levar dezenas de segundos com os processos já ativos.
