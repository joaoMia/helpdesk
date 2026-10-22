# HelpDesk — Backend (`apps/backend`)

**Estado:** pasta reservada. Nenhuma API foi criada ainda; não há código executável, banco de dados nem dependências instaladas.

## Objetivo
API REST própria do HelpDesk: autenticação JWT, autorização por papel e por vínculo com o recurso, regras de chamados, pendências, expedientes, métricas de tempo útil e dashboards calculados no servidor.

## Stack prevista
Node.js + Express + TypeScript, Zod para validação, Jest + Supertest para testes e PostgreSQL. Prisma somente após a escolha e fixação da major (ADR-10 / HD-008).

## Organização prevista
Conforme `docs/04-arquitetura.md`: `src/config`, `src/middlewares`, `src/modules/*` (`routes -> controller -> service -> repository`), `src/shared`, `app.ts`, `server.ts` e `tests/`.

## Próximos passos
- **HD-011** — inicializar Express/TypeScript/Zod/Jest com endpoint de saúde (`/health`) e teste inicial (mediante aprovação).
- **HD-013** — Prisma e conexão de desenvolvimento, após HD-012.
- **HD-015** — convenções de API e formato padrão de erros.

Referências: `docs/04-arquitetura.md`, `docs/06-contratos-api.md`, `docs/10-seguranca-e-testes.md`, `docs/15-m1-plano-de-execucao.md`.
