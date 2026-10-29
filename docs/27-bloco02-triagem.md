# BLOCO 02 — Triagem e classificação reais

HD-035, HD-036 e a parte de triagem da HD-037 implementadas para revisão. Reutiliza o núcleo de chamados, autenticação, grants, ticketScope, triageSelect e TicketEvent. Nenhuma migration, alteração de schema, infraestrutura, matriz de permissões, abertura ou dashboard. Não aprova ADRs pendentes e não inicia o BLOCO 03.

## API e privacidade

- GET /tickets/triage: exclusivo de TECHNICIAN por tickets.triage. Fila operacional OPEN sem técnico. queue=UNCLASSIFIED (padrão, prioridade nula), CLASSIFIED (prioridade definida) ou ALL (união sem duplicação). ALL não inclui atendimentos atribuídos neste bloco.
- Filtros estritos: page (1–100000), pageSize (1–50, padrão 10), search (código público exato, número ou HD-número, até 2147483647), priority (LOW/MEDIUM/HIGH). Combinações contraditórias, como UNCLASSIFIED com priority=HIGH, retornam zero. Campos desconhecidos e buscas por dados privados são rejeitados.
- Retorna items/total/page/pageSize. Cada item contém exclusivamente id, code, status, priority e createdAt. Não consulta assunto, descrição, solicitante, snapshot, respostas ou identidades técnicas. Contagem e itens usam RepeatableRead; ordem createdAt/id crescente.
- PATCH /tickets/:id/priority: exclusivo de TECHNICIAN por tickets.classify. Payload estrito: priority=LOW/MEDIUM/HIGH e expectedPriority obrigatório, com a prioridade vista na fila (inclusive null). Retorna {ticket} na mesma projeção mínima.
- REQUESTER e ADMIN recebem 403 nessas operações; ADMIN mantém a leitura global já existente. Detalhes completos de chamados livres continuam bloqueados ao técnico. Reutiliza cookies, JWT, CSRF, origem/CORS, no-store, atividade e troca obrigatória de senha.

## Transação e auditoria

Classificação revalida o usuário TECHNICIAN e sua sessão no PostgreSQL, com locks na ordem usuário/sessão. Na transação Serializable, lê somente chamado OPEN livre no escopo aprovado; compara expectedPriority e faz UPDATE condicional com escopo, ID e prioridade observada. Não há retry automático de conflitos. Conflitos de estado/prioridade, serialização ou deadlock resultam em TICKET_CONFLICT/409. UUID inexistente e chamado inelegível recebem a mesma resposta segura, sem revelar o recurso.

Uma mudança efetiva atualiza exclusivamente priority, classifiedAt, classifiedById e o updatedAt do Prisma; acrescenta PRIORITY_CLASSIFIED em TicketEvent, com ator, data, oldValue.priority e newValue.priority. Falha de auditoria desfaz a atualização. Repetição com a prioridade atual como precondição e destino é neutra: não altera datas/ator nem duplica eventos. A precondição compara o valor de prioridade observado, sem criar um protocolo novo de versionamento geral do chamado.

Status permanece OPEN; assignedTechnicianId e firstStartedAt permanecem null. Serviço, formulário, snapshot e OPENED não são alterados. Não há assunção, períodos de trabalho, status novo ou notificações fictícias. A consulta de histórico do BLOCO 01 continua com sua whitelist, sem expor JSON arbitrário dos eventos. O solicitante vê a prioridade atual e o evento de classificação com texto legível.

## Interface

Na sidebar autenticada do técnico: Chamados → Não classificados / Classificados / Todos. As rotas #/technician/chamados/nao-classificados, /classificados e /todos só são resolvidas para a identidade TECHNICIAN real, após a troca obrigatória. Laboratório #/demo/ preservado.

Reutiliza PageHeading, tab-bar, filter-bar, ticket-table/table-scroll, badges, EmptyState, TicketPagination, MotionRegion e o diálogo existente. O diálogo recebe apenas uma opção pending, falsa por padrão, para bloquear fechamento/duplo envio durante a gravação real. Preserva foco, GSAP, reduced motion, temas e layout; não cria estilos novos ou detalhes completos de chamados livres.

Busca por número, filtros e paginação consultam a API. Alteração confirmada atualiza a fila automaticamente, removendo o item de Não classificados; Classificados o recupera com a prioridade persistida. Troca de fila não apresenta linhas antigas enquanto a consulta nova está pendente. Filtros são preservados entre abas; navegação pelas abas volta à primeira página. Erros de conflito permanecem visíveis após atualização da lista. Sem reenvio automático em falhas de transporte; o usuário é orientado a conferir a fila. Renovação/reenvio só acontece para SESSION_INVALID, recusada antes da gravação.

## Validação

- Testes Jest/Supertest com login, cookies e CSRF reais, em namespace descartável de helpdesk_test: três prioridades, filas/filtros/paginação, whitelist, grants, estado/atribuição, precondição obsoleta, concorrência entre técnicos, operação neutra, rollback da auditoria, histórico, snapshots e revogação entre autenticação e transação.
- Regressões de autenticação, autorização, catálogo e BLOCO 01 preservadas. Comparação somente leitura das linhas de helpdesk_dev antes/depois; checksums das duas migrations conferidos.
- Testes frontend: contratos estritos, rotas por perfil, cookies/CSRF, resposta mínima e ausência de retry em conflito/rede.
- Resultado executado: 39 testes unitários backend, 149 de integração PostgreSQL e 67 frontend (255 ao todo), além de typecheck, lint, formatação, build, Prisma validate e diff --check. Build mantém o aviso de bundles acima de 500 kB, sem mudar a estratégia de empacotamento neste bloco.
- Navegador em ambiente isolado: classificação real, passagem entre filas sem F5, pesquisa, conflito entre duas abas, temas claro/escuro, sidebar e diálogo móvel. Desktop 1440 px e mobile 390 px, sem overflow horizontal da página; tabela mantém rolagem interna. Evidências em .local/bloco02-*.png, ignoradas pelo Git. Não equivale a homologação de todos os navegadores corporativos ou auditoria WCAG completa.

## Revisão manual (máximo de seis verificações)

1. Como REQUESTER, abrir chamado básico real e conferir OPEN, sem prioridade/técnico.
2. Como TECHNICIAN, acessar Chamados → Não classificados e localizar seu código; conferir ausência de dados privados.
3. Classificar como Baixa, Média ou Alta; verificar saída automática e presença em Classificados, ainda Aberto.
4. Conferir Todos, busca por código, filtro de prioridade e persistência após F5.
5. Como solicitante original, conferir prioridade atual e evento no histórico; outro solicitante continua sem acesso.
6. Testar duas abas com prioridade antiga, confirmação de conflito, menu móvel e ambos os temas; ADMIN/REQUESTER não acessam triagem/classificação.

Pendências: HD-038 (assunção atômica), HD-039 e demais operações de atendimento permanecem nos próximos blocos. Não há bloqueio de negócio para a triagem mínima entregue. Nenhuma ampliação de visibilidade, calendário, SLA, anexos ou projeto foi inferida.

Referências: [autorização](21-autorizacao-backend.md), [BLOCO 01](26-bloco01-chamados.md), [contratos](06-contratos-api.md), [regras](03-regras-de-negocio.md), [design](07-telas-e-design.md).

## Arquivos do bloco

18 arquivos: 14 modificados e quatro novos; nenhum removido. Caminhos relativos à raiz:

- Backend modificados: apps/backend/src/modules/tickets/ticket-api.repository.ts, ticket-api.service.ts, ticket.controller.ts e ticket.routes.ts.
- Backend novo: apps/backend/tests/integration/triage-http.integration.test.ts.
- Frontend modificados: apps/frontend/src/app/auth-entry.tsx, apps/frontend/src/components/demo-dialog.tsx, apps/frontend/src/lib/auth-client.ts, apps/frontend/src/navigation/auth-routes.ts, apps/frontend/src/pages/account.tsx e apps/frontend/src/pages/requester-ticket-detail.tsx.
- Frontend novos: apps/frontend/src/pages/technician-triage.tsx e apps/frontend/tests/triage.test.ts.
- Contratos: packages/contracts/src/index.ts (aditivo).
- Documentação modificada: README.md, docs/06-contratos-api.md e docs/21-autorizacao-backend.md. Novo: docs/27-bloco02-triagem.md.
