# BLOCO 01 — Abertura e acompanhamento reais

Implementação autorizada em 29/10/2026, em revisão. Reutiliza a modelagem, as duas migrations publicadas, TicketService, prismaTicketUnit e ticketScope. Não altera tabelas, índices, constraints, infraestrutura, papéis ou permissões. Backlog e ADRs pendentes não são aprovados por consequência desta entrega.

| Subtarefa      | Entrega no bloco                                                                     | Limite                                                      |
| -------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| HD-032         | Serviço único, formulário versionado e snapshots existentes integrados ao fluxo real | Sem migration; decisões gerais da HD-005 continuam próprias |
| HD-033         | POST /tickets autenticado e transacional                                             | Somente REQUESTER; formulário básico                        |
| HD-034         | Lista, detalhes e histórico com filtros no PostgreSQL                                | TECHNICIAN somente atribuídos; nenhuma fila de triagem nova |
| HD-037 (parte) | Quatro etapas, lista e detalhes reais do solicitante                                 | Parcial; telas operacionais de triagem não implementadas    |

## Contratos HTTP

| Método/rota              | Entrada e resultado                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| POST /tickets            | subject, description, serviceId e answers={} opcional; 201 com {ticket} no contrato openedTicketSchema e Location: /tickets/:id |
| GET /tickets             | items/total/page/pageSize; resumo de chamados no escopo autenticado                                                             |
| GET /tickets/:id         | {ticket}, descrição, snapshot, respostas históricas e datas permitidas                                                          |
| GET /tickets/:id/history | items/total/page/pageSize; id, actorId, eventType, createdAt, ordenação cronológica estável                                     |

Proxy local: /api/tickets. Mantém os contratos internos anteriores e acrescenta contratos HTTP Zod. POST exige assunto com 1–160 caracteres após trim, descrição 1–4000, UUID de exatamente um serviço e respostas vazias. Não aceita solicitante, técnico, horários, status, prioridade, snapshot, campos financeiros, múltiplos serviços ou atributos extras. A identidade vem exclusivamente da sessão validada no backend.

GET /tickets aceita page (1–100000, padrão 1), pageSize (1–50, padrão 10), search (até 120 caracteres: assunto, número HD e nome histórico do serviço), status, priority (LOW/MEDIUM/HIGH/NONE) e serviceId. A pesquisa por assunto é case-insensitive; a busca textual no nome do snapshot respeita a correspondência do PostgreSQL JSON. Histórico aceita apenas page/pageSize. Filtros por identidade, papel, where/OR e campos desconhecidos são recusados. Lista é ordenada por createdAt/id decrescentes; histórico, por createdAt/id crescentes. Contagem e registros usam a mesma transação RepeatableRead.

## Segurança, persistência e histórico

Reutiliza JWT/cookies, atividade, revogação, troca obrigatória de senha, origem/CORS, CSRF, no-store e RBAC. POST tem limite de 20 tentativas/IP/15 minutos; não substitui proteção distribuída de produção. tickets.create continua exclusivo de REQUESTER. tickets.read aplica os filtros existentes: próprios para REQUESTER, atribuídos para TECHNICIAN e leitura global documentada para ADMIN. Técnico não atribuído recebe 404 nos detalhes/histórico; a fila futura usará a projeção mínima de triagem existente, sem ampliá-la aqui. Recurso inexistente e fora do escopo têm o mesmo NOT_FOUND/404.

TicketApiService orquestra o núcleo existente; TicketApiRepository oferece a transação serializável, bloqueia usuário/sessão e revalida REQUESTER ativo, troca inicial concluída e sessão vigente antes da gravação. O núcleo verifica serviço/categoria ativos e seleciona a versão do formulário no banco. Cria chamado, snapshot, respostas e evento OPENED na mesma transação. Novo chamado permanece OPEN, priority=null, assignedTechnicianId=null. Conflito de serialização retorna TICKET_CONFLICT/409, sem resultado parcial.

O fluxo HTTP habilita apenas formulários sem campos adicionais: uma versão válida com fields=[] e answers={}. Formulário personalizado ativo retorna FORM_NOT_SUPPORTED/409; não há editor, condições, upload ou migração de respostas. Catálogo inexistente/inativo continua indisponível. Snapshots são produzidos no servidor no instante da abertura; edições posteriores do catálogo não alteram nomes, categoria, formulário ou respostas anteriores. Lista e detalhes exibem esses nomes históricos, sem substituí-los pelos dados atuais do catálogo.

Listagem usa projeção de resumo; detalhes usam whitelist compatível com a autorização existente. Histórico básico não expõe JSON arbitrário de oldValue/newValue, sessões, senhas ou dados privados de outras contas. Não há endpoints de classificação, início, pendência, comentário, anexo, encerramento, transferência ou exclusão.

## React e preservação visual

Somente REQUESTER acessa #/requester/novo, #/requester/chamados e #/requester/chamado/:uuid. Links ficam na sidebar autenticada existente. Sem alteração de dashboards, CSS, cores, tipografia, gráficos ou infraestrutura de movimento. Laboratório #/demo/ preservado e independente.

O fluxo real reaproveita PageHeading, Stepper, Panel, EmptyState, Icon, badges, MotionRegion/GSAP e o diálogo de confirmação existente. Acrescenta rótulo opcional ao diálogo, mantendo o texto demonstrativo por padrão nas telas antigas. Cartões usam selection-grid/selection-card; formulários, detail-grid/form-body/field; tabela, ticket-table/table-scroll; histórico, timeline. Mesmas composições da prévia, com dados reais e sem importação de mocks nos novos fluxos.

Abertura: categoria pesquisável/paginada → serviço único → assunto/descrição → revisão. Voltar preserva rascunho; trocar seleção com dados exige confirmação de descarte. Não permite escolher técnico, prioridade ou horário. Sem anexos nem campos condicionais. Cliente usa cookies/CSRF e não persiste chamados, rascunhos ou tokens em localStorage. Resultado confirmado navega ao detalhe com mensagem de sucesso; F5 consulta novamente o servidor. O conteúdo autenticado é remontado ao mudar o ID da identidade, descartando estado local da conta anterior.

Uma trava síncrona e o estado de envio impedem cliques repetidos. Falha de transporte, resposta inválida ou erro 5xx não repete POST automaticamente nem anuncia sucesso: bloqueia nova submissão naquele formulário e orienta consultar Meus chamados. Renovação seguida de reenvio ocorre somente em SESSION_INVALID/401 emitido antes de qualquer gravação. Não há garantia de idempotência persistente entre requisições independentes, abas ou recarregamentos; isso exigiria definição própria, sem inventar unicidade entre solicitações legitimamente iguais.

Filtros e paginação da lista são processados pela API; os detalhes apresentam snapshot e histórico básico paginado. Comentários, anexos, atendimento, métricas e novas transições continuam indisponíveis. A interface não calcula tempos úteis ou SLA.

## Validação e revisão manual

Testes automatizados usam namespaces descartáveis em helpdesk_test e identidades/cookies reais. Verificam invariantes, persistência, catálogo inativo, payloads inválidos, ownership, histórico, papéis, CSRF/CORS, revogação, proteção transacional da sessão e regressões anteriores. Comparação somente leitura dos registros de helpdesk_dev antes/depois e verificação de checksums das migrations protegem a base existente.

Validação no navegador em ambiente isolado: quatro etapas, abertura com clique repetido (um chamado/um evento confirmados no PostgreSQL), detalhes, histórico, F5, listagem, busca/estado vazio, menu móvel, tema claro/escuro e descarte controlado do rascunho. Desktop 1440 px e mobile 390 px; sem overflow horizontal da página. Tabela móvel conserva rolagem interna. Evidências locais em .local/bloco01-*.png, fora do versionamento. Testes visuais não substituem homologação corporativa ou auditoria WCAG completa.

Checklist do responsável:

1. Com ADMIN, conferir categoria e serviço básicos ativos existentes no catálogo.
2. Como REQUESTER, abrir chamado pelas quatro etapas, sem técnico/prioridade, e confirmar uma única gravação.
3. Atualizar a página e conferir Meus chamados, filtros, detalhes e evento de abertura.
4. Editar/desativar catálogo como ADMIN; confirmar nomes históricos preservados e indisponibilidade para novas aberturas.
5. Com outro solicitante, tentar a URL do primeiro chamado e confirmar recusa sem dados.
6. Conferir sidebar e formulário no mobile e nos dois temas; ADMIN/TECHNICIAN não entram nas rotas de abertura do solicitante.

Referências: [requisitos](02-requisitos-e-permissoes.md), [regras](03-regras-de-negocio.md), [modelagem](05-modelagem-de-dados.md), [contratos](06-contratos-api.md), [design](07-telas-e-design.md), [auditoria visual](19-vis004-auditoria-ui.md), [autorização](21-autorizacao-backend.md), [catálogo](25-catalogo-real.md).

## Inventário de arquivos

Caminhos a partir da raiz do repositório (26 arquivos; 14 modificados e 12 novos):

- Backend novos: apps/backend/src/modules/tickets/ticket-api.repository.ts, ticket-api.service.ts, ticket.controller.ts e ticket.routes.ts.
- Backend integrados: apps/backend/src/app.ts, apps/backend/src/server.ts e apps/backend/src/modules/tickets/ticket.service.ts (comentário de integração; núcleo preservado).
- Frontend novos: apps/frontend/src/pages/requester-new-ticket.tsx, requester-tickets.tsx e requester-ticket-detail.tsx; apps/frontend/src/components/real-ticket-table.tsx e ticket-pagination.tsx.
- Frontend integrados: apps/frontend/src/app/auth-entry.tsx, apps/frontend/src/navigation/auth-routes.ts, apps/frontend/src/lib/auth-client.ts, apps/frontend/src/pages/account.tsx; apps/frontend/src/components/confirm-change.tsx e demo-dialog.tsx (rótulo opcional, padrão demonstrativo preservado).
- Contratos: packages/contracts/src/index.ts, somente extensões aditivas.
- Testes novos: apps/backend/tests/integration/tickets-http.integration.test.ts e apps/frontend/tests/real-tickets.test.ts.
- Documentação: README.md, docs/05-modelagem-de-dados.md, docs/06-contratos-api.md, docs/21-autorizacao-backend.md e este docs/26-bloco01-chamados.md (novo).
