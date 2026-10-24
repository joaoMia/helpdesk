# HelpDesk — Infraestrutura local

PostgreSQL 18.6 na imagem oficial `postgres:18.6-bookworm`, usando Docker Compose e projeto `helpdesk`. Frontend e backend executam inicialmente no host. Não há infraestrutura de produção nesta tarefa.

## Comandos pela raiz

```text
npm run env:setup
npm run db:config
npm run db:up
npm run db:status
npm run db:check
```

O Compose recebe explicitamente o `.env` raiz. Não execute `docker compose config` sem `--quiet` em relatórios, pois a saída resolvida pode expor credenciais. O exemplo versionado não contém senha real.

## Recursos e isolamento

- Container: `helpdesk-postgres`.
- Rede: `helpdesk_database`, sem conexão com outros projetos.
- Volume: `helpdesk_postgres-data`, montado em `/var/lib/postgresql`, conforme PostgreSQL 18.
- Porta: somente `127.0.0.1:5432` por padrão; confirmar conflitos antes de alterar POSTGRES_PORT e as URLs.
- Healthcheck: `pg_isready`; limites locais de 512 MiB e 1 CPU.
- Banco de desenvolvimento: `helpdesk_dev`.
- Banco de testes: `helpdesk_test`, criado pelo script de init somente em volume novo. Nenhuma tabela funcional é criada.

Os bancos usam URLs distintas no mesmo cluster local. A futura suíte de persistência deve usar exclusivamente TEST_DATABASE_URL e rejeitar o banco de desenvolvimento. O usuário do entrypoint é administrativo no ambiente local e não é modelo de permissões para produção.

Não apague volumes, não execute `down -v` nem prune e não reutilize recursos de outros projetos. Alterações de ambiente não recriam bancos ou usuários em volumes existentes. Se o volume já estiver inicializado e faltar o banco de testes, diagnostique e faça a preparação específica sem destruir dados.

Persistência em volume não substitui backup. Política de backups e restauração, DNS, certificados e recursos do Server 10 serão definidos com a TI em tarefa de implantação futura. Veja a [ADR-10](../docs/18-adr10-stack-e-fundacao.md).
