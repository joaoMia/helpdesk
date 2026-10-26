# HelpDesk — Backend

Express 5.3.0, TypeScript 5.9.3, Zod 4.6.7 e Prisma 7.10.1, com ESM/NodeNext. DEV-001 acrescentou contratos e abertura interna transacional; DEV-002 aplicou a primeira migration mínima em desenvolvimento. Sem autenticação ou endpoints de negócio implementados.

## Execução

Na raiz, após `npm ci` e `npm run env:setup`:

- `npm run dev:backend`: watcher tsx em [http://127.0.0.1:3001](http://127.0.0.1:3001).
- `npm run build --workspace @helpdesk/backend`.
- `npm run start --workspace @helpdesk/backend`: executa o JavaScript de `dist/`.
- `npm run typecheck --workspace @helpdesk/backend`.
- `npm run lint --workspace @helpdesk/backend`.
- `npm test --workspace @helpdesk/backend`.

A configuração carrega o `.env` raiz explicitamente e permite sobrescrever pelo ambiente do processo. Zod valida NODE_ENV, HOST, PORT e URLs opcionais de desenvolvimento/testes, sem registrar valores sensíveis. Host/porta padrão: 127.0.0.1:3001. Um host diferente depende de decisão de exposição apropriada.

## Endpoint e testes

`GET /health` responde status 200 e `{"status":"ok","service":"helpdesk-api"}`. É liveness, independente do PostgreSQL. Erros usam JSON sem stack e requestId gerado pelo servidor. Login/escrita de chamados continuam inexistentes (404), aguardando autenticação real e contratos aprovados.

`createApp()` não abre porta, facilitando testes por Supertest. `server.ts` carrega ambiente, inicia o listener e trata encerramento. Não há camadas vazias: futuros módulos seguirão routes → controller → service → repository conforme necessidade real.

Jest 30.5.2 + ts-jest 29.4.15 + Supertest 7.3.1 exercitam TypeScript e imports ESM. O script usa `node --experimental-vm-modules`, pois o suporte ESM do Jest ainda tem limitações. Typecheck e build são independentes dos testes.

## Banco e Prisma

Prisma CLI, Client e adapter-pg 7.10.1 e pg 8.23.1 estão integrados por prisma.config.ts, schema e factory. Client ESM gerado em src/generated/prisma/, ignorado. A importação não abre instância global nem torna o healthcheck dependente do banco.

```text
npm run prepare:core --workspace @helpdesk/backend
npm run prisma:validate --workspace @helpdesk/backend
npm run db:migrate:dev --workspace @helpdesk/backend
npm run db:migrate:status --workspace @helpdesk/backend
npm run prisma:generate --workspace @helpdesk/backend
npm run db:prisma:check --workspace @helpdesk/backend
npm run test:db --workspace @helpdesk/backend
```

prepare:core compila contratos e gera Client antes de typecheck/build/testes. Não aplica DDL. A factory limita o pool; seu proprietário deve executar $disconnect() ao encerrar. db:prisma:check faz somente SELECT.

Na DEV-002, a base mínima foi autorizada e aplicada em helpdesk_dev por `20261026222500_fundacao_nucleo`. São oito tabelas, enums, FKs/índices, checks e triggers de histórico. O SQL da migration é a fonte canônica, incluindo recursos não expressos no PSL; review-constraints.sql permanece apenas como nota de compatibilidade da DEV-001.

db:migrate:dev é um executor restrito à primeira migration revisada: exige NODE_ENV=development, helpdesk_dev local/public e banco de testes distinto; confere banco efetivo, ausência de objetos desconhecidos ou checksum/histórico aplicado. Invoca migrate deploy sem reset/shadow database e sem credenciais na linha de comando/log. Não é um runner de produção nem autoriza migrations futuras. SQL inicial foi gerado sem aplicação por migrate diff --from-empty --script, revisado e testado antes do deploy. Não se usou db push ou resolve para simular aplicação.

test:db lê os próprios arquivos de migration (não uma cópia derivada do schema), confirma helpdesk_test local e distinto do desenvolvimento, cria namespace exclusivo dentro de transação e força rollback de DDL/dados. As fronteiras statement-breakpoint preservam corpos SQL de funções; BEGIN/COMMIT da migration são substituídos pela transação de teste. Não há migration persistente em testes. Desenvolvimento é conferido antes/depois por conexão somente leitura, incluindo contagem de registros.

npm test executa unitários/HTTP sem depender do Docker. test:db é opt-in e falha se banco/isolamento não estiverem disponíveis; não usa skipped para aparentar validação.

modules/tickets contém serviço e repositório Prisma transacional: solicitante ativo real, um serviço, respostas, snapshot e evento juntos. Sem rota/controller de escrita vazio, autenticação improvisada ou regras de supervisão, tempos úteis e projetos. Condições e upload aguardam seus módulos/aprovações.

Proteções mínimas de histórico: abertura só OPEN/null/null; snapshot/serviço/versão/solicitante/data de criação não podem ser sobrescritos; versões já usadas e seus campos não podem ser editados/ampliados/removidos. Evolução exige nova versão, preservando respostas antigas. Isso não define fluxo administrativo de rascunho/publicação. Condições continuam recusadas até homologação; são JSON declarativo, sem execução de código. Nenhuma senha/fixture funcional permanece nos bancos.

O critério técnico de schema válido e migration local da HD-013 foi demonstrado. Backlog e aprovações globais HD-003/004/005/006 não são encerrados automaticamente; novos campos, condições, publicação e módulos dependem de decisões próprias.

Referências: [arquitetura](../../docs/04-arquitetura.md), [contratos preliminares](../../docs/06-contratos-api.md), [segurança](../../docs/10-seguranca-e-testes.md) e [ADR-10](../../docs/18-adr10-stack-e-fundacao.md).
