# HelpDesk — Backend

Fundação Express 5.3.0, TypeScript 5.9.3 e Zod 4.6.7, com ESM/NodeNext. Nenhuma regra de negócio, autenticação, usuário ou chamado foi implementado.

## Execução

Na raiz, após `npm ci` e `npm run env:setup`:

- `npm run dev:backend`: watcher tsx em [http://127.0.0.1:3001](http://127.0.0.1:3001).
- `npm run build --workspace @helpdesk/backend`.
- `npm run start --workspace @helpdesk/backend`: executa o JavaScript de `dist/`.
- `npm run typecheck --workspace @helpdesk/backend`.
- `npm run lint --workspace @helpdesk/backend`.
- `npm test --workspace @helpdesk/backend`.

A configuração carrega o `.env` raiz explicitamente e permite sobrescrever pelo ambiente do processo. Zod valida NODE_ENV, HOST, PORT e DATABASE_URL opcional, sem registrar valores sensíveis. Host/porta padrão: 127.0.0.1:3001. Um host diferente depende de decisão de exposição apropriada.

## Endpoint e testes

`GET /health` responde status 200 e `{"status":"ok","service":"helpdesk-api"}`. É liveness do processo e não exige PostgreSQL. Rotas inexistentes e erros básicos usam JSON sem stack. Convenções completas de erros/requestId pertencem à HD-015.

`createApp()` não abre porta, facilitando testes por Supertest. `server.ts` carrega ambiente, inicia o listener e trata encerramento. Não há camadas vazias: futuros módulos seguirão routes → controller → service → repository conforme necessidade real.

Jest 30.5.2 + ts-jest 29.4.15 + Supertest 7.3.1 exercitam TypeScript e imports ESM. O script usa `node --experimental-vm-modules`, pois o suporte ESM do Jest ainda tem limitações. Typecheck e build são independentes dos testes.

## Banco e Prisma

Prisma CLI, Client e adapter-pg 7.10.1 e `pg` 8.23.1 estão instalados para integração futura. A API ainda não importa Client nem depende de banco. Não há schema de domínio, Client gerado, migrations ou seeds. A HD-013 deverá definir configuração e geração com os pré-requisitos aprovados. `npm run db:check` verifica desenvolvimento e testes sem criar tabelas.

Referências: [arquitetura](../../docs/04-arquitetura.md), [contratos preliminares](../../docs/06-contratos-api.md), [segurança](../../docs/10-seguranca-e-testes.md) e [ADR-10](../../docs/18-adr10-stack-e-fundacao.md).
