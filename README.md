# HelpDesk — Fundação técnica local

Monorepositório em npm workspaces para suporte de TI. DEV-001/002 consolidaram contratos, núcleo interno e migration inicial; DEV-003 implementa cadastro de solicitante, login, sessão, troca de senha e logout reais em PostgreSQL. Chamados/projetos/dashboards continuam demonstrativos e separados da autenticação.

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
npm run auth:env:setup
npm run db:config
npm run db:up
npm run db:check
```

O único lockfile é `package-lock.json`, na raiz. Não é necessário instalar TypeScript, Prisma ou outras ferramentas globalmente. O script de ambiente cria `.env` com credencial local aleatória somente se esse arquivo não existir; nunca o sobrescreve nem mostra os valores. [.env.example](.env.example) contém somente os nomes e valores não sensíveis. Não use as credenciais locais em produção.

Se já houver `.env`, confira os nomes e URLs sem publicar seu conteúdo. Alterar nomes de bancos/usuários no arquivo não modifica automaticamente um volume PostgreSQL já inicializado.

`npm run auth:env:setup` acrescenta apenas chaves AUTH_* ausentes, aleatórias e distintas, sem mostrar valores nem sobrescrever credenciais do banco. Configuração local HTTP é explícita; não copiar essa exceção para produção.

`npm run db:migrate:dev --workspace @helpdesk/backend` aplica somente as migrations revisadas DEV-002/003, recusando destinos diferentes de helpdesk_dev local e histórico/objetos inesperados. Não executa reset ou seed administrativo. `npm run prisma:generate --workspace @helpdesk/backend` gera o Client; `npm run db:migrate:status --workspace @helpdesk/backend` consulta o histórico. Futuras migrations exigem revisão própria; não editar migrations aplicadas.

## Executar as aplicações

Em dois terminais separados, a partir da raiz:

```text
npm run dev:backend
npm run dev:frontend
```

- Frontend: [http://127.0.0.1:5173](http://127.0.0.1:5173).
- Conta real: [login](http://127.0.0.1:5173/#/login) e [cadastro](http://127.0.0.1:5173/#/register). Cadastre um solicitante fictício com senha própria de 12–128 caracteres; nenhum usuário/senha padrão é fornecido.
- Laboratório visual isolado: [prévia sem autenticação](http://127.0.0.1:5173/#/demo/requester/painel). Seu seletor de perfis não altera a identidade real da API.
- API: [http://127.0.0.1:3001/health](http://127.0.0.1:3001/health).
- Resposta de integridade: `{"status":"ok","service":"helpdesk-api"}`.

O frontend consulta a API por `/api/health`, usando o proxy de desenvolvimento do Vite. Com configuração válida, o processo responde ao healthcheck mesmo com PostgreSQL indisponível. A verificação da persistência é feita separadamente por `npm run db:check`.

Na DEV-003, o bootstrap exige DATABASE_URL e configuração AUTH_* válidas; não exige conexão com o banco para servir /health. O formulário real usa cookies HttpOnly e CSRF. Logout revoga sessão no servidor; troca de senha revoga todas e exige novo login. E-mail ainda não é verificado por envio. Recuperação de acesso permanece pendente; consulte a [ADR-12](docs/20-adr12-autenticacao.md). O provisionamento local manual da HD-019 está descrito abaixo.

## Provisionamento de desenvolvimento

`npm run provision:dev` prepara um administrador inicial e três técnicos mediante credenciais informadas diretamente em terminal seguro, sem senha padrão. Não roda automaticamente nem altera contas preservadas. Os quatro exigem troca da senha inicial. Consulte o [procedimento HD-019](docs/22-provisionamento-desenvolvimento.md) antes de executar; não compartilhe senhas no chat ou na linha de comando.

`npm run provision:dev:auto` é a alternativa Windows autorizada pela DEV-005.1: gera senhas aleatórias próprias e entrega os acessos em `%LOCALAPPDATA%\HelpDesk\credenciais-iniciais-dev.txt`, com ACL exclusiva do usuário atual. Recusa contas ou arquivo já existentes; não redefine senhas. Consulte o mesmo procedimento e apague o arquivo após a troca das senhas.

## Qualidade e build

DEV-006: o solicitante pode consultar e editar **Meu perfil** em `#/requester/perfil`, com persistência real por `GET/PATCH /users/me`. Mudança de e-mail exige senha atual e novo login. Limites e pendência de verificação do endereço estão no [procedimento do perfil](docs/23-perfil-solicitante.md).

```text
npm run typecheck
npm run lint
npm test
npm run build
npm run format:check
```

Jest/Supertest permanecem no backend em ESM, com `--experimental-vm-modules`. Testes dos modelos demonstrativos frontend: `node --import tsx --test apps/frontend/tests/*.test.ts`. Contratos compartilhados são compilados e Prisma Client gerado na preparação dos comandos do backend; artefatos não são versionados.

`npm run test:db --workspace @helpdesk/backend` executa a migration canônica e integração real somente em helpdesk_test local, com DDL/dados em transações integralmente desfeitas. `npm run db:prisma:check --workspace @helpdesk/backend` confere por SELECT. A migration inicial DEV-002 contém oito tabelas fundamentais e proteções de histórico; migrations não criam credenciais ou executam provisionamento. Regras/ADRs restantes não foram aprovadas por consequência dessa entrega. Serviço interno não está exposto sem autenticação.

`npm run format` aplica Prettier aos aplicativos, infraestrutura, scripts, configurações e ADR desta fundação. A configuração preserva os documentos funcionais históricos e o CSV do backlog e ignora segredos, caches e artefatos.

## Organização

| Pasta                                              | Conteúdo                                                      |
| -------------------------------------------------- | ------------------------------------------------------------- |
| [apps/frontend](apps/frontend/README.md)           | Prévia React/Tailwind navegável, mocks isolados, GSAP/ECharts |
| [apps/backend](apps/backend/README.md)             | Express/Zod, healthcheck e núcleo Prisma interno em revisão   |
| [packages/contracts](packages/contracts/README.md) | Zod e tipos compartilhados ESM para a base em revisão         |
| [infra](infra/README.md)                           | PostgreSQL de desenvolvimento e banco de testes isolado       |
| `docs/`, `planning/`                               | Requisitos, arquitetura, decisões, diagramas e backlog        |
| `skills/helpdesk-task/`                            | Procedimento e checklist compartilhados pelos agentes         |

## Infraestrutura e limites

O Compose cria somente os recursos com projeto `helpdesk`, sem utilizar containers, redes ou bancos de outros projetos. O volume PostgreSQL é persistente; não execute `down -v` nem prune. Para verificar o estado, use `npm run db:status`.

A implantação futura é no Server 10 Linux da empresa, pela rede interna, com DNS, certificados e backups gerenciados pela TI. Nenhum deploy foi realizado. Vite não é servidor de produção; a prévia não representa autenticação/autorização. Próximos módulos seguem backlog e aprovações próprias.

Respeite UTF-8/LF e a política específica do CSV em `.editorconfig` e `.gitattributes`. Alterações e próximas tarefas precisam de autorização própria; não há publicação automática.

DEV-007 / HD-021: ADMIN acessa **Gestão de usuários** para listar, cadastrar e editar técnicos reais. TECHNICIAN acessa **Meu perfil**. Senha provisória é exibida apenas após cadastro e exige troca inicial. Consulte [gestão de técnicos](docs/24-gestao-tecnicos.md).

DEV-008 / HD-025: **Catálogo de serviços** real, com página independente exclusiva de ADMIN (DEV-008.1). As consultas GET autenticadas de solicitantes/técnicos permanecem disponíveis para integração futura à abertura. Categorias, serviços e formulário básico v1 persistem no PostgreSQL; não há abertura HTTP de chamados nem editor persistente de campos. Consulte [catálogo real](docs/25-catalogo-real.md).
