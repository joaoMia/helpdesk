# HelpDesk

HelpDesk é um projeto pessoal de portfólio para organizar solicitações de suporte de TI, do registro à solução. A v1.0 candidata demonstra como combinar autorização por papel, histórico auditável e cálculo de SLA com uma interface web responsiva.

| Papel         | Experiência                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Solicitante   | Dashboard próprio, abertura por categoria e serviço, formulário dinâmico, anexos privados, conversa e solicitação de projeto |
| Técnico       | Dashboard próprio, filas, triagem, prioridade, atribuição, início, pendência, retomada e solução com data efetiva            |
| Administrador | Dashboard, gestão de pessoas, organização, calendário, catálogo, formulários versionados e políticas de SLA                  |

A ação **Adicionar solução** leva o chamado a `RESOLVED`. O SLA de solução usa a data efetiva validada, e a auditoria mantém a hora do registro. `CLOSED` permanece disponível na API para o encerramento com métricas finais A/B. O laboratório visual é uma área separada com simulações.

## Arquitetura

Monorepo npm com frontend React, TypeScript, Vite, Tailwind, ECharts e GSAP. O backend Express valida contratos Zod e usa Prisma com PostgreSQL. O pacote de contratos é compartilhado entre frontend e backend. Os anexos ficam em armazenamento privado, com metadados e hashes no banco. O chat usa SSE para notificar alterações.

- `apps/frontend` — aplicação web e laboratório visual
- `apps/backend` — API, migrations, serviços, scripts e testes
- `packages/contracts` — contratos compartilhados
- `infra` — PostgreSQL local com Docker Compose
- `docs` e `planning` — contrato da v1, decisões, histórico e backlog

## Executar localmente

Requer Node.js 24, npm 11 e Docker com Compose. O ensaio de instalação e restauração foi feito no Windows com PostgreSQL 18.6. Escolha um workspace novo e use apenas dados sintéticos.

```powershell
npm ci
npm run env:setup
npm run auth:env:setup
npm run db:config
npm run db:up
npm run prepare:core --workspace @helpdesk/backend
npm run db:migrate:dev --workspace @helpdesk/backend
npm run db:migrate:status --workspace @helpdesk/backend
```

Os scripts criam a configuração local a partir das variáveis de [.env.example](.env.example). Confira o destino antes de aplicar a cadeia de treze migrations. O runner exige `helpdesk_dev` local, com `helpdesk_test` separado para testes. A configuração padrão usa PostgreSQL em `127.0.0.1:5432`, API em `127.0.0.1:3001` e Vite em `127.0.0.1:5173`. Use volumes, portas e credenciais próprios ao executar uma segunda instância. O Compose padrão declara um nome fixo de container.

Para provisionar ADMIN e técnicos, use um PowerShell interativo no qual seja possível digitar senhas ocultas:

```powershell
# O Client já foi gerado em prepare:core.
cd apps/backend
node ../../node_modules/tsx/dist/cli.mjs scripts/provision-development.ts
cd ../..
```

Crie o solicitante pelo cadastro da aplicação. Na Central Administrativa, crie empresa, setor e expediente fictícios e associe um calendário padrão. Em Catálogo, crie uma categoria e um serviço sintéticos, edite o rascunho e publique o formulário. Para reproduzir o ensaio, adicione um campo de arquivo obrigatório. Veja o [roteiro local](docs/v1-operacao-local.md) e o [fluxo de provisionamento](docs/22-provisionamento-desenvolvimento.md).

Em terminais separados, com as dependências e o Client já preparados:

```powershell
# Terminal 1, na raiz
cd apps/backend
node ../../node_modules/tsx/dist/cli.mjs src/server.ts
```

```powershell
# Terminal 2, na raiz
npm run dev:frontend
```

Abra o endereço local informado pelo Vite. Consulte `/health` na API ou `/api/health` pelo frontend. O backend compilado deve ser executado dentro da instalação do workspace, com as dependências raiz e locais disponíveis.

## Qualidade

```powershell
npm run lint
npm run format:check
npm run prisma:validate --workspace @helpdesk/backend
node --import tsx --test apps/frontend/tests/*.test.ts
npm run build --workspace @helpdesk/frontend

cd apps/backend
node ../../node_modules/typescript/bin/tsc --noEmit
node ../../node_modules/typescript/bin/tsc -p tsconfig.build.json
node --experimental-vm-modules ../../node_modules/jest/bin/jest.js --config jest.config.mjs --runInBand
node --experimental-vm-modules ../../node_modules/jest/bin/jest.js --config jest.integration.config.mjs --runInBand
cd ../..
```

Execute a integração em ambiente local isolado. O alvo dos testes é `helpdesk_test` e os schemas descartáveis não são compartilhados com desenvolvimento. Prepare o Prisma Client antes da suíte e mantenha a geração sequencial.

## Recuperação, segurança e limites

A recuperação completa combina dump PostgreSQL, bytes privados dos anexos, manifesto e checksums. O ensaio restaurou esse conjunto em outro destino e verificou integridade e acesso autorizado. O [runbook](docs/v1-operacao-local.md) descreve o procedimento e a política proposta para sessões restauradas.

A aplicação usa cookies HttpOnly, CSRF, sessões revogáveis e autorização no servidor. Upload e download são privados. O ambiente HTTP local é restrito a loopback. Esta é uma candidata de demonstração local. Homologação visual final, revisão das referências históricas e decisão sobre licença antecedem a publicação.

As capturas de portfólio devem ser produzidas em instância sintética após a homologação. Dashboards próprios de técnico e solicitante estão integrados às APIs reais. Projetos inclui solicitação, atribuição, planos versionados, atividades, progresso automático, atualizações e conclusão/cancelamento conforme o [contrato vigente](docs/37-workflow-projetos.md). Integrações e deploy permanecem fora deste escopo. Consulte o [contrato vigente e índice histórico](docs/v1-contrato.md) e o [backlog reconciliado](planning/backlog.csv).

Projeto pessoal de João Pedro Miá. A licença de reutilização do projeto está pendente de decisão. As dependências têm licenças próprias.
