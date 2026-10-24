# 04 — Arquitetura e organização de código

## Diretório local obrigatório
O projeto reside exclusivamente na pasta `helpdesk` dentro da pasta `dev` já existente no computador do usuário; o caminho absoluto depende do SO. Não modificar projetos irmãos.

## Arquitetura-alvo
**Monorepositório autorizado para a fundação M1**: uma única revisão de frontend, backend, contratos, documentação e testes. A proposta inicial de dois repositórios continua alternativa; o monorepo reduz atrito para Claude Code e unifica as issues. Manter READMEs separados para apps. Confirmar se a avaliação Rocketseat exige dois repositórios; nesse caso separar na fase de entrega.

```text
helpdesk/
├── apps/
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── app/                 # providers, bootstrap, rotas
│   │   │   ├── assets/
│   │   │   ├── components/          # UI genérica
│   │   │   ├── features/            # auth, dashboards, tickets, ...
│   │   │   ├── hooks/
│   │   │   ├── layouts/
│   │   │   ├── lib/                 # client HTTP, helpers
│   │   │   ├── routes/
│   │   │   └── styles/
│   │   ├── tests/
│   │   └── README.md
│   └── backend/
│       ├── src/
│       │   ├── config/
│       │   ├── middlewares/
│       │   ├── modules/
│       │   │   ├── auth/
│       │   │   ├── users/
│       │   │   ├── tickets/
│       │   │   ├── services/
│       │   │   ├── pending/
│       │   │   ├── schedules/
│       │   │   ├── metrics/
│       │   │   ├── dashboards/
│       │   │   ├── comments/
│       │   │   └── attachments/
│       │   ├── shared/
│       │   ├── app.ts
│       │   └── server.ts
│       ├── prisma/                  # ou contract/migrations segundo versão aprovada
│       ├── tests/
│       └── README.md
├── packages/contracts/              # tipos compartilhados/contratos Zod
├── infra/docker-compose.yml         # PostgreSQL local
├── docs/                             # especificação, ADR, diagramas e API
├── .github/workflows/
├── .env.example
├── .gitignore
├── CLAUDE.md
├── package.json
├── package-lock.json             # npm workspaces
└── README.md
```

## Padrão de módulo backend
`routes -> controller -> service/use-case -> repository/Prisma`. Regras de negócio nos serviços, não nos controllers. DTO e validação com Zod. Tratamento central de erros, logs, requestId, paginação, transações e autorização por objeto.

## Stack
- Frontend: React + Vite + TypeScript, Tailwind CSS, componentes reutilizáveis, roteamento, formulários com Zod, ECharts e GSAP (+ ScrollTrigger/ScrollSmoother seletivos).
- Backend: Node.js + Express + TypeScript, Prisma (preferência frente Knex), JWT, Zod, PostgreSQL.
- Testes: Jest + Supertest na API; testes frontend unitários e de interação; E2E do fluxo principal (Playwright é uma proposta).
- Ambiente: PostgreSQL em Docker Compose; frontend/backend podem executar diretamente no host para hot reload; volumes de arquivos controlados.
- Gestão: GitHub Projects com Issues/PRs vinculados, Miro para diagramas rastreados, Figma para interface.

## Gerenciador de pacotes
Na fundação M1, utilizar `npm workspaces` para manter um único lockfile e minimizar a preparação do ambiente.

## Compatibilidade de versões
Stack da fundação aprovada na [ADR-10](18-adr10-stack-e-fundacao.md): Node 24 LTS, TypeScript 5.9.3, React 19.3.1, Vite 8.3.5, Tailwind 4.3.3, Express 5.3.0, Zod 4.6.7, Prisma 7.10.1 e PostgreSQL 18.6. Manter versões exatas nos manifests e um único lockfile raiz. Prisma 8 RC não faz parte desta base. Não combinar snippets ou CLI de majors diferentes.

Backend em ESM/NodeNext; frontend com resolução Bundler. Jest e Supertest permanecem no backend, com a limitação de ESM documentada na ADR-10. As camadas do diagrama são arquitetura-alvo: a fundação contém somente configuração, app/server e healthcheck, sem classes ou módulos vazios. `packages/contracts` permanece reservado até sua tarefa de uso.

## Regras de frontend
Rotas por papel e layouts distintos, mas componentes e tokens compartilhados. API Client centralizado; estados loading/empty/error; feedback visual não deve mascarar falha de requisição. GSAP com `@gsap/react`, suporte a reduced motion. ECharts com importação modular; não usar ScrollSmoother em tabelas/filas por padrão.

## Infraestrutura futura
Destino atual definido pelo responsável: Server 10 Linux da empresa, containers Linux e acesso apenas pela rede interna; DNS, certificados e backups administrados pela TI. Deploy somente depois da homologação local e de autorização própria. Render/Vercel/Netlify permanecem referências históricas da entrega educacional, não destinos desta implantação corporativa. A persistência e o armazenamento de anexos serão planejados sem acoplamento ao disco efêmero da aplicação.
