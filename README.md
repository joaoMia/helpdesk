# HelpDesk — Início do marco M1 (pacote v1.5 com Skill Claude)

**Etapa:** fundação técnica em ambiente local. **Código da aplicação:** ainda não criado.
**Diretório obrigatório do projeto:** pasta `helpdesk` **dentro** da pasta existente `dev` do proprietário. O caminho absoluto depende do sistema operacional.

## Como começar
1. No computador, localizar a pasta `dev` já existente.
2. Criar uma pasta vazia `helpdesk` dentro dela, caso ainda não exista. Verificar antes para não sobrescrever nada.
3. Descompactar **o conteúdo** deste ZIP na raiz de `dev/helpdesk` (não criar outra pasta aninhada chamada `HelpDesk_Inicio_M1_v1_4`).
4. Abrir exatamente `dev/helpdesk` no VS Code ou no Claude Code Desktop (ambiente local) e verificar o caminho.
5. Ler `docs/15-m1-plano-de-execucao.md`, `docs/16-decisoes-para-proximos-modulos.md` e `CLAUDE.md`.
6. No início de uma sessão, solicitar diagnóstico e plano, sem edições, conforme `docs/17-guia-de-inicializacao-do-claude.md`.
7. Após revisar e aprovar o plano da tarefa atual, usar a Skill `/helpdesk-task HD-XXX`, a instrução explícita na conversa ou issue aprovada e os documentos relevantes. O escopo da fundação está em `docs/15-m1-plano-de-execucao.md`.
8. Revisar o resultado do Claude, comandos executados, testes e arquivos antes de commitar ou publicar. Confira `docs/17-guia-de-inicializacao-do-claude.md`.

**Limites:** este pacote contém documentos, backlog e diagramas conceituais; não contém aplicação funcional. Não há acesso ao computador do usuário, nem repositório/board remoto criado.

## Pastas
- `docs/`: requisitos, decisões, arquitetura, regras e diagramas Mermaid.
- `planning/backlog.csv`: 64 tarefas com rastreabilidade e estados iniciais.
- `CLAUDE.md`: política do agente para esta fase.

## Estado da aprovação
O responsável aprovou a **estrutura para início**. Isso autoriza somente o marco M1. As decisões funcionais ainda pendentes ficam registradas em `docs/16-decisoes-para-proximos-modulos.md` e não autorizam implementar regras ambíguas.

## Skill do Claude Code
A Skill do projeto está em `.claude/skills/helpdesk-task/SKILL.md`, com invocação manual `/helpdesk-task HD-009`. O `CLAUDE.md` da raiz contém as regras permanentes.

## Workspace local (HD-009)
Estrutura do monorepositório preparada com **npm workspaces** (`apps/*` e `packages/*`). Nenhuma dependência foi instalada e nenhuma aplicação funciona ainda.

| Pasta | Finalidade | Estado |
|---|---|---|
| `apps/frontend/` | Interface React/Vite/TypeScript/Tailwind | reservada (README) |
| `apps/backend/` | API Express/TypeScript/Zod/Jest | reservada (README) |
| `packages/contracts/` | Contratos Zod e tipos compartilhados | reservada (README) |
| `infra/` | PostgreSQL local via Docker Compose | reservada (README) |
| `docs/`, `planning/` | Documentação e backlog | preservados |

Padronização: `.editorconfig` (LF/UTF-8; `*.csv` em CRLF com BOM) e `.gitattributes` com a mesma política. O `package.json` raiz ainda não tem scripts, pois `npm run ... --workspaces` falha enquanto nenhuma pasta possuir `package.json`; os scripts serão adicionados com HD-010/HD-011.

## Comandos planejados para HD-010 a HD-015 (não executados)
Referência para as próximas tarefas, **cada uma sujeita a aprovação própria**. Versões exatas dependem da ADR-10 / HD-008 e não devem ser instaladas sem fixação explícita.

| Tarefa | Comandos previstos (indicativos) | Observações |
|---|---|---|
| HD-010 | `npm create vite@<versão> apps/frontend -- --template react-ts`; `npm install -w apps/frontend tailwindcss @tailwindcss/vite` | Preservar ou mesclar o README existente na pasta |
| HD-011 | `npm init -w apps/backend`; `npm install -w apps/backend express zod`; `npm install -D -w apps/backend typescript jest supertest` (+ integração TS para Jest) | Fixar TypeScript compatível com ts-jest/typescript-eslint |
| HD-012 | `docker compose -f infra/docker-compose.yml up -d` | Requer Docker Desktop em execução; tag fixa do PostgreSQL; segredos só em `.env` |
| HD-013 | `npm install -w apps/backend prisma@<major> @prisma/client@<major>` | Fixar a major; não misturar CLI e client de majors diferentes; sem migrations de domínio |
| HD-014 | `npm run lint --workspaces --if-present`; `npm run typecheck --workspaces --if-present`; `npm test --workspaces --if-present` | CI depende de autorização para GitHub |
| HD-015 | (sem comandos de instalação) | Formato padrão de erro e `requestId`; alinhar com HD-006 |
