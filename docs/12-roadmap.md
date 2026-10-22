# 12 — Roadmap de implementação e marcos

| Marco | Resultado verificável | Gate de saída |
|---|---|---|
| M0 — Especificação | RN/RF validados, ADRs críticos, ERD, fluxos, análise Figma | aprovação do escopo |
| M1 — Fundação | monorepo/workspace, frontend e API, DB Docker, auth scaffold, lint/test/CI | execução local documentada |
| M2 — Identidade | login JWT, permissões, cliente, técnico, senhas, avatar | testes de acesso e fluxo de primeiro login |
| M3 — Catálogos | serviços, horários, motivos, seeds | CRUD e histórico seguros |
| M4 — Chamados e triagem | abertura, histórico, filas, prioridade | criar sem técnico; classificar sem assumir |
| M5 — Atendimento | assumir atômico, serviços, status, histórico | fluxo técnico validado |
| M6 — Comunicação e pendências | comentários/anexos, motivos e auto-retomada | regras de pendência testadas |
| M7 — Motor de tempos | dois indicadores úteis e calendários versionados | bateria de testes de intervalo |
| M8 — Dashboards e acabamento | 3 dashboards, ECharts, GSAP, responsividade, acessibilidade | métricas consistentes e telas validadas |
| M9 — Homologação local | E2E, testes regressão, docs e demo | aprovação final local |
| M10 — Deploy (posterior) | Render e Vercel/Netlify se autorizado | URLs e READMEs de entrega |

## Prioridade para iniciar
1. Validar Figma e decisões abertas de alta prioridade.
2. Aprovar proposta monorepo e major do Prisma.
3. Criar Miro/GitHub e backlog em estado Backlog (não criar código ainda).
4. Começar M1 com PR de fundação; validar no navegador e API local.

**Observação:** dashboards devem consumir APIs reais; pode-se prototipar o visual com dados fictícios devidamente sinalizados, mas jamais marcar funcionalidade pronta enquanto indicadores reais não estiverem integrados.
