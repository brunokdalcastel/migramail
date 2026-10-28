# MigraMail 0.1.0

Primeira versão.

- Migra uma conta IMAP por vez: testar login, medir tamanho, simular e migrar, com andamento ao vivo e gráfico da porcentagem enviada.
- Migra várias contas em paralelo (1 a 5) a partir de um CSV ou do `file.txt` do imapsync, com painel do lote e "Repetir com erro".
- Perfis de servidor, com Gmail e Microsoft 365 prontos.
- Senhas nunca vão pela linha de comando; "lembrar senha" guarda cifrado pelo Windows.
- Usa o imapsync 2.314 embutido. Cada execução leva cerca de 30 s para começar (ver README).

Instalação: baixe `MigraMail-Setup.exe` e execute. Instala para o seu usuário (sem administrador).
