# BLOCO 03.1 — Visão operacional e proposta de distribuição

> Registro de desenvolvimento. Para regras e escopo atuais, consulte o [contrato vigente da v1.0](v1-contrato.md).

> **Atualização da execução integrada (30/10/2026):** a solicitação posterior autorizou a persistência da distribuição sem início. As seções de proposta abaixo preservam o diagnóstico original, mas o bloqueio de persistência foi superado pela migration `20261029234000_distribuicao_sem_inicio`. Agora existem `tickets.assign`, `POST /tickets/:id/assign` e a ficha restrita `GET /tickets/:id/triage`. A atribuição grava responsável e evento `ASSIGNED` atomicamente, mantendo `OPEN` e `firstStartedAt = NULL`; o destinatário inicia separadamente. A interface confirma a gravação real. Transferência continua indisponível. Consulte o [registro da execução integrada](30-execucao-integrada.md) para o estado dos checkpoints e suas limitações.

## Escopo entregue

Preserva os 20 arquivos locais do BLOCO 03 sobre HEAD `f03e32516bfaac07af5ce4555304d10b9c58c280`. Sem commit, migration, seed ou mudança de infraestrutura. A autorização de leitura global limita-se aos metadados operacionais e ao nome do responsável; não aprova integralmente ADR-03 ou outras decisões pendentes.

- `GET /tickets/overview`: grant explícito `tickets.overview` para TECHNICIAN/ADMIN. Retorna somente id, code, status, priority, createdAt e responsibleName (nome ou null). Não retorna assunto, solicitante, descrição, ID do técnico, respostas, snapshots, anexos ou histórico. Query estrita: page, pageSize, search, status, priority (incluindo NONE). Ordem createdAt/id descendente; página/contagem na mesma transação RepeatableRead.
- `GET /tickets/assignees`: grant `tickets.assignment-candidates` para TECHNICIAN/ADMIN. Somente id/nome dos técnicos ativos e com troca inicial concluída. Query page/pageSize/search, ordem name/id. Não expõe e-mail, credenciais ou dados administrativos. Não reutiliza o CRUD de técnicos para conceder poderes administrativos.
- Os guards existentes continuam validando sessão, revogação, conta ativa, troca inicial, origem e CORS; respostas no-store. REQUESTER não acessa nenhuma dessas consultas. ADMIN continua sem classificação ou início operacional.
- Todos usa overview, incluindo atribuídos e os quatro estados existentes. `/tickets/triage` conserva seu escopo OPEN livre e cinco campos, inclusive o parâmetro legado ALL. Meus atendimentos e detalhe/histórico mantêm ownership; a visão global não oferece links para detalhes de terceiros.
- Busca dinâmica com debounce de 250 ms nas telas reais de chamados, técnicos e catálogo, sem exigir botão. Alterar texto volta à primeira página e conserva filtros. Efeitos invalidam respostas anteriores ao mudar consulta/filtros ou desmontar; a interface oculta resultados obsoletos durante a nova consulta.
- Overview, candidatos e listas de chamados usam SQL parametrizado com lower/translate e normalização de acentos portugueses, sem extensão ou migration. Códigos aceitam trechos. `%`, `_` e barra invertida são literais, não curingas fornecidos pelo usuário. A busca própria usa somente assunto/código/nome histórico do serviço dentro do ownership. Catálogo e gestão de técnicos conservam a busca parcial case-insensitive existente; neutralização de acentos nessas consultas permanece uma evolução específica. Não há busca fonética/fuzzy ou garantia universal para todos os alfabetos.

## Interface independente de persistência

TECHNICIAN acessa Todos pelas abas existentes; ADMIN acessa Chamados na navegação autenticada. Reutiliza PageHeading, painel, filtros, tabela, badges, paginação, MotionRegion e estilos existentes, sem reconstruir dashboards, GSAP, ECharts ou laboratório.

“Atribuir chamado” abre diálogo de preparação com consulta real, busca e seleção do destinatário. **Não há submit de atribuição, escrita, sucesso fictício ou seleção persistente.** O diálogo informa o bloqueio e reutiliza DemoDialog: modal nativo/portal, teclado, restauração de foco, animação GSAP e reduced motion. A operação já existente permanece como “Iniciar meu atendimento”: inicia e atribui à própria conta atomicamente; não distribui a terceiros.

`proposedAssignmentInputSchema` é somente proposta tipada (technicianId, expectedUpdatedAt). Não existe rota de escrita ou grant tickets.assign. Validade sintática não equivale a autorização ou implementação funcional.

## Distribuição sem início — proposta não implementada

### Regra e Prisma

Um chamado nasce OPEN livre, como hoje. Após classificação, TECHNICIAN/ADMIN autorizado poderá distribuir um OPEN livre para TECHNICIAN ativo habilitado. Permanecerá OPEN, assignedTechnicianId definido, firstStartedAt NULL e closedAt NULL. ADMIN será ator da distribuição, nunca destinatário automaticamente. Distribuição não inicia trabalho nem métrica B.

O destinatário verá a atribuição em Meus atendimentos. Somente ele poderá iniciar: OPEN → IN_PROGRESS, mantendo o responsável, preenchendo firstStartedAt confiável e criando evento. A assunção própria da vaga livre poderá continuar em uma transação, conforme BLOCO 03. Leitura completa pelo responsável seguirá o ownership atual; qualquer restrição adicional antes do início exige decisão explícita.

O modelo Prisma atual já comporta os campos necessários: responsável nullable e primeiro início independente. Não exige novo status ou tabela no mínimo. TicketEvent pode armazenar ASSIGNED, ator, instante, responsável anterior/novo, sem colunas redundantes. Um futuro DTO com whitelist apresentará ator/destinatário autorizado, sem expor JSON arbitrário. Novos campos de última distribuição só serão propostos se houver necessidade concreta.

### Constraint e migration futura

`ticket_state_integrity` atualmente proíbe OPEN com responsável. Não alterar a migration publicada nem seu checksum. Será necessária **nova migration evolutiva**, sem apagar registros, para substituir essa parte da constraint:

- OPEN: firstStartedAt e closedAt NULL; responsável permitido somente com prioridade definida.
- IN_PROGRESS/PENDING: manter responsável, prioridade e primeiro início obrigatórios.
- CLOSED: preservar invariantes atuais; não homologar encerramento ou métricas neste ajuste.

Essa mudança não é puramente aditiva: permite um estado antes proibido e depende de aprovação específica da constraint. Propor adição/validação da nova constraint e retirada da anterior na mesma transação, após SQL revisado e testes isolados, sem reset ou backfill destrutivo. O trigger guard_ticket_history mantém abertura livre no INSERT e imutabilidade histórica no UPDATE; as demais constraints/FKs permanecem.

Chamados existentes continuam válidos: OPEN livres permanecem livres; IN_PROGRESS atribuídos não mudam. Não preencher firstStartedAt retroativamente. Revisar precondições, contratos e permissões junto da migration antes de habilitar qualquer ação.

### API, concorrência e transferência futuras

Proposta: POST /tickets/:id/assign, grant explícito tickets.assign para TECHNICIAN/ADMIN, payload estrito conforme proposta. Ator somente da sessão. Revalidar ator, sessão, destinatário e chamado dentro da transação, com ordem consistente de locks. UPDATE condicional: OPEN, classificado, livre, revisão esperada. Evento ASSIGNED na mesma transação. Duas distribuições ou distribuição concorrente com início: um sucesso, outro 409; sem retry cego, evento duplicado ou atualização parcial. Falha de auditoria implica rollback.

O início futuro aceitará somente vaga livre para assunção própria ou atribuição prévia ao próprio ator, nunca início por outro destinatário. Revalidar atividade/habilitação no banco, não confiar no seletor. Classificação continua separada; sua elegibilidade em OPEN já atribuído exige decisão, sem ampliar silenciosamente a triagem atual.

Redistribuir chamado já atribuído/iniciado é transferência: operação separada ainda não autorizada, com justificativa, responsável anterior/novo, auditoria e efeitos em jornadas/tempo útil homologados. Definir também cancelamento de distribuição ainda não iniciada e destinatário desativado; não resolver por suposição. B começa no primeiro início real, nunca na distribuição. A e B existentes não são substituídas.

O novo intervalo entre distribuição e primeiro início também exige compatibilizar RN-021/ADR-06: definir o calendário aplicável nesse intervalo antes de implementar métricas. Não iniciar B artificialmente nem alterar as regras de jornada nesta entrega.

## Requisitos dos próximos módulos — sem implementação

Tratamento pelas tarefas oficiais correspondentes, sem substituir o backlog ou considerar tarefas concluídas pela prévia.

| Área                 | Solicitações e decisões necessárias                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Dependências                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Administração        | ADMIN gerenciará solicitantes, técnicos e administradores com permissões específicas: criar, editar, desativar, definir perfil e redefinir credencial provisória. Nome, identificador, e-mail, empresa, setor, papel e expediente aplicável. Empresas/setores configuráveis. Definir unicidade, vínculos históricos, último administrador e efeitos da desativação. Preservar autoinscrição até substituição aprovada. Nunca visualizar senhas; redefinição segura e troca obrigatória. | HD-003/004/005/006, HD-020/021 e segurança. Não ampliar CRUDs atuais implicitamente. |
| Comunicação e anexos | Solicitante e responsável comentarão/anexarão. Definir tamanho, MIME real, extensão, validação de conteúdo, armazenamento privado, proteção contra arquivos maliciosos, quarentena/antivírus quando aplicável, downloads autenticados e ownership. Preview somente de imagens suportadas/validadas; demais documentos com ícone/nome/download. Não servir SVG, HTML ou executáveis inline. Definir limites e retenção.                                                                  | HD-043/044 e ADRs de comunicação/arquivos.                                           |
| Solução              | “Adicionar solução”: descrição obrigatória, anexos permitidos, evento e transição formal aprovada. Não criar RESOLVED nem renomear CLOSED. Definir elegibilidade e efeito no fechamento e nas métricas congeladas conforme RN-026.                                                                                                                                                                                                                                                      | HD-039/041/042, calendários e decisões de encerramento.                              |
| SLA                  | Proposta inicial configurável: LOW 40, MEDIUM 16, HIGH 8 horas úteis. Homologar início, pausas/pendências, jornada/intervalos/calendário e versionamento histórico. Não substituir A/B nem usar diferença simples de relógio. Prever dashboards filtráveis por empresa, setor e prioridade. Nenhum cumprimento real declarado nesta prévia.                                                                                                                                             | HD-003/005/006, motor de tempos e dashboards. Valores ainda sujeitos à homologação.  |

## Validação

Usar namespaces isolados em helpdesk_test; comparar helpdesk_dev antes/depois. Cobrir projeção, ownership, pesquisa parcial/acentos/códigos, SQL parametrizado, filtros/paginação, candidatos, ausência de escrita de distribuição e regressões dos blocos anteriores. Resultados efetivamente executados serão registrados na entrega; esta seção não declara aprovação antecipada.

### Resultados executados em 29/10/2026

- 284 testes aprovados: 39 unitários backend, 168 de integração PostgreSQL e 77 frontend. Incluem sete casos novos de integração e cinco frontend, além das regressões anteriores.
- Typecheck, lint, formatação, build backend/frontend/contratos, Prisma validate e git diff --check aprovados. A execução paralela inicial de comandos que regeneram artefatos compartilhados causou colisão no Prisma Client e HMR transitório; a repetição sequencial passou. A sessão final do navegador não apresentou erros/avisos. Mantido o aviso de bundles frontend superiores a 500 kB, sem instalar dependências ou otimizar fora do escopo.
- Navegador real com autenticação e namespace exclusivo em helpdesk_test: classificação, início próprio e permanência em Todos; responsável correto; Meus atendimentos vazio para outro técnico e recusa do detalhe alheio; REQUESTER redirecionado ao próprio início ao tentar rota global. ADMIN consulta a visão global sem receber ações operacionais de técnico.
- Pesquisas automáticas por J/JOAO, combinação com status/prioridade, vazio, consulta atrasada seguida de consulta recente, busca de destinatário por M, técnicos por Mur, serviço por Conect e chamados próprios por assunto. Paginação e contagens combinadas com filtros cobertas pela integração; o cenário visual continha somente dois chamados.
- F5 preservou sessão e dados da visão global. Desktop 1440 px, notebook 1366 px e mobile 390 px; temas claro/escuro e ausência de overflow horizontal da página. Tabela conserva rolagem interna. Diálogo com seleção por teclado, Escape e retorno do foco à ação de origem. Reutilização de GSAP/reduced motion existentes, sem alterar o sistema de movimento; não houve auditoria completa com leitor de tela ou homologação de todos os navegadores corporativos.
- Conferência somente leitura do namespace visual: dois chamados, dois OPENED, dois PRIORITY_CLASSIFIED e um ATTENDANCE_STARTED. A prévia de distribuição não modificou responsável, status ou histórico. Servidor de teste encerrado e namespace liberado pelo mecanismo de isolamento existente.
- helpdesk_dev permaneceu idêntico à comparação inicial de todos os registros: nove usuários e duas migrations com checksums correspondentes. Schema, migrations, infraestrutura, lockfile, CSS global e módulos de gráficos/movimento não foram alterados. Nenhuma credencial identificada no diff.

## Inventário reconciliado

31 arquivos pendentes: 21 modificados e dez novos; nenhuma exclusão. Os 20 arquivos do BLOCO 03 foram preservados. Onze caminhos foram acrescentados ao inventário nesta continuação (quatro arquivos antes limpos e sete novos), além das integrações nos arquivos já pendentes. Staging vazio e sem commit/push.

Modificados:

- [README.md](../README.md)
- [apps/backend/src/modules/authorization/permissions.ts](../apps/backend/src/modules/authorization/permissions.ts)
- [apps/backend/src/modules/tickets/ticket-api.repository.ts](../apps/backend/src/modules/tickets/ticket-api.repository.ts)
- [apps/backend/src/modules/tickets/ticket-api.service.ts](../apps/backend/src/modules/tickets/ticket-api.service.ts)
- [apps/backend/src/modules/tickets/ticket.controller.ts](../apps/backend/src/modules/tickets/ticket.controller.ts)
- [apps/backend/src/modules/tickets/ticket.routes.ts](../apps/backend/src/modules/tickets/ticket.routes.ts)
- [apps/backend/tests/integration/tickets-http.integration.test.ts](../apps/backend/tests/integration/tickets-http.integration.test.ts)
- [apps/frontend/src/app/auth-entry.tsx](../apps/frontend/src/app/auth-entry.tsx)
- [apps/frontend/src/components/real-ticket-table.tsx](../apps/frontend/src/components/real-ticket-table.tsx)
- [apps/frontend/src/lib/auth-client.ts](../apps/frontend/src/lib/auth-client.ts)
- [apps/frontend/src/navigation/auth-routes.ts](../apps/frontend/src/navigation/auth-routes.ts)
- [apps/frontend/src/pages/account.tsx](../apps/frontend/src/pages/account.tsx)
- [apps/frontend/src/pages/catalog.tsx](../apps/frontend/src/pages/catalog.tsx)
- [apps/frontend/src/pages/requester-ticket-detail.tsx](../apps/frontend/src/pages/requester-ticket-detail.tsx)
- [apps/frontend/src/pages/requester-tickets.tsx](../apps/frontend/src/pages/requester-tickets.tsx)
- [apps/frontend/src/pages/technician-triage.tsx](../apps/frontend/src/pages/technician-triage.tsx)
- [apps/frontend/src/pages/technicians.tsx](../apps/frontend/src/pages/technicians.tsx)
- [docs/06-contratos-api.md](../docs/06-contratos-api.md)
- [docs/16-decisoes-para-proximos-modulos.md](../docs/16-decisoes-para-proximos-modulos.md)
- [docs/21-autorizacao-backend.md](../docs/21-autorizacao-backend.md)
- [packages/contracts/src/index.ts](../packages/contracts/src/index.ts)

Novos:

- [apps/backend/src/shared/search.ts](../apps/backend/src/shared/search.ts)
- [apps/backend/tests/integration/overview-http.integration.test.ts](../apps/backend/tests/integration/overview-http.integration.test.ts)
- [apps/backend/tests/integration/start-http.integration.test.ts](../apps/backend/tests/integration/start-http.integration.test.ts)
- [apps/frontend/src/components/assignment-preview-dialog.tsx](../apps/frontend/src/components/assignment-preview-dialog.tsx)
- [apps/frontend/src/hooks/use-debounced-value.ts](../apps/frontend/src/hooks/use-debounced-value.ts)
- [apps/frontend/src/pages/ticket-overview.tsx](../apps/frontend/src/pages/ticket-overview.tsx)
- [apps/frontend/tests/overview-ticket.test.ts](../apps/frontend/tests/overview-ticket.test.ts)
- [apps/frontend/tests/start-ticket.test.ts](../apps/frontend/tests/start-ticket.test.ts)
- [docs/28-bloco03-assuncao.md](../docs/28-bloco03-assuncao.md)
- [docs/29-bloco031-visao-e-distribuicao.md](../docs/29-bloco031-visao-e-distribuicao.md)
