# HelpDesk — Fundação técnica local

Monorepositório existente em npm workspaces para uma aplicação de suporte de TI. A fundação contém uma interface técnica React, uma API Express e PostgreSQL local em Docker. Autenticação, usuários, chamados e dashboards ainda não foram implementados.

O projeto oficial fica em `C:\dev\helpdesk`. As instruções permanentes estão em [AGENTS.md](AGENTS.md) e [CLAUDE.md](CLAUDE.md). As Skills de Codex e Claude usam o [procedimento compartilhado](skills/helpdesk-task/procedimento.md); sua presença não concede autorização para novas tarefas, commits ou publicações.

## Pré-requisitos

- Node.js 24 LTS e npm 11. A fundação reaproveita Node 24.21.0 e npm 11.19.0 instalados, sem atualizações globais.
- Docker Engine e plugin Docker Compose funcionando com Linux containers. Ambiente auditado: Docker Desktop 4.93.0, Engine 29.8.1 e Compose 5.5.1.
- Portas locais 5173 (frontend), 3001 (API) e 5432 (PostgreSQL) livres. Os serviços fazem bind apenas em loopback.

Versões fixadas e decisões estão na [ADR-10](docs/18-adr10-stack-e-fundacao.md). Requisitos funcionais e decisões ainda pendentes continuam em [docs/](docs/) e no [backlog](planning/backlog.csv). HD-003 permanece pendente.

## Instalação reproduzível

Na raiz do repositório:

```text
npm ci
npm run env:setup
npm run db:config
npm run db:up
npm run db:check
```

O único lockfile é `package-lock.json`, na raiz. Não é necessário instalar TypeScript, Prisma ou outras ferramentas globalmente. O script de ambiente cria `.env` com credencial local aleatória somente se esse arquivo não existir; nunca o sobrescreve nem mostra os valores. [.env.example](.env.example) contém somente os nomes e valores não sensíveis. Não use as credenciais locais em produção.

Se já houver `.env`, confira os nomes e URLs sem publicar seu conteúdo. Alterar nomes de bancos/usuários no arquivo não modifica automaticamente um volume PostgreSQL já inicializado.

## Executar as aplicações

Em dois terminais separados, a partir da raiz:

```text
npm run dev:backend
npm run dev:frontend
```

- Frontend: [http://127.0.0.1:5173](http://127.0.0.1:5173).
- API: [http://127.0.0.1:3001/health](http://127.0.0.1:3001/health).
- Resposta de integridade: `{"status":"ok","service":"helpdesk-api"}`.

O frontend consulta a API por `/api/health`, usando o proxy de desenvolvimento do Vite. A API inicia e responde ao healthcheck mesmo sem banco configurado/disponível. A verificação da persistência é feita separadamente por `npm run db:check`.

## Qualidade e build

```text
npm run typecheck
npm run lint
npm test
npm run build
npm run format:check
```

Jest + Supertest estão no backend, com transformação TypeScript em ESM. O comando de teste usa a opção `--experimental-vm-modules`; as limitações estão na ADR-10. O frontend tem typecheck, lint e build; não há ainda suíte de testes de interface. Prisma está instalado para preparação futura, sem schema de domínio, migrations ou Client gerado.

`npm run format` aplica Prettier aos aplicativos, infraestrutura, scripts, configurações e ADR desta fundação. A configuração preserva os documentos funcionais históricos e o CSV do backlog e ignora segredos, caches e artefatos.

## Organização

| Pasta                                              | Conteúdo                                                        |
| -------------------------------------------------- | --------------------------------------------------------------- |
| [apps/frontend](apps/frontend/README.md)           | React/TypeScript, Vite e Tailwind; tela técnica provisória      |
| [apps/backend](apps/backend/README.md)             | Express/Zod, configuração de ambiente, healthcheck e testes ESM |
| [packages/contracts](packages/contracts/README.md) | Reservado; sem contratos artificiais de negócio                 |
| [infra](infra/README.md)                           | PostgreSQL de desenvolvimento e banco de testes isolado         |
| `docs/`, `planning/`                               | Requisitos, arquitetura, decisões, diagramas e backlog          |
| `skills/helpdesk-task/`                            | Procedimento e checklist compartilhados pelos agentes           |

## Infraestrutura e limites

O Compose cria somente os recursos com projeto `helpdesk`, sem utilizar containers, redes ou bancos de outros projetos. O volume PostgreSQL é persistente; não execute `down -v` nem prune. Para verificar o estado, use `npm run db:status`.

A implantação futura é no Server 10 Linux da empresa, pela rede interna, com DNS, certificados e backups gerenciados pela TI. Nenhum deploy é feito nesta fundação. O servidor Vite de desenvolvimento não é servidor de produção. GSAP e ECharts serão incorporados quando houver tarefas de telas funcionais autorizadas.

Respeite UTF-8/LF e a política específica do CSV em `.editorconfig` e `.gitattributes`. Alterações e próximas tarefas precisam de autorização própria; não há publicação automática.
