# BLOCO 03 — Assunção atômica e atendimento atribuído

> Registro de desenvolvimento. Para regras e escopo atuais, consulte o [contrato vigente da v1.0](v1-contrato.md).

Entrega para revisão das HD-038 a HD-042, limitada à autorização do BLOCO 03. Reutiliza os modelos, migrations, grants, startPrecondition, ticketScope e TicketEvent existentes. Não altera infraestrutura, banco, permissões ou identidade visual.

| Tarefa | Situação no bloco                       | Limite                                                                             |
| ------ | --------------------------------------- | ---------------------------------------------------------------------------------- |
| HD-038 | Concluída no escopo autorizado          | Assumir e iniciar atomicamente, sem transferência                                  |
| HD-039 | Parcial                                 | Somente OPEN → IN_PROGRESS pela assunção                                           |
| HD-040 | Concluída para as operações disponíveis | Serviço único, snapshots e respostas protegidos; nenhuma edição estrutural         |
| HD-041 | Parcial                                 | Auditoria de abertura, classificação e início; ciclo restante pendente             |
| HD-042 | Parcial                                 | Assunção, Meus atendimentos e detalhe atribuído; sem tratar pendência/encerramento |

## API e transação

POST /tickets/:id/start exige tickets.start, exclusivo de TECHNICIAN. Body vazio ou {} e sem parâmetros adicionais; contrato Zod estrito recusa técnico, estado, prioridade, datas, serviço, respostas ou identidades fornecidos pelo cliente. Retorna 200 com {ticket}: id, code, status=IN_PROGRESS, priority, assignedTechnicianId e firstStartedAt ISO.

Na mesma transação Serializable, o repositório bloqueia e revalida usuário e sessão (atividade, papel, revogação, validade e troca obrigatória concluída), na ordem de locks já usada pelas mutações. O UPDATE combina ID e ticketScope(identity, tickets.start), que utiliza startPrecondition: OPEN, prioridade definida e responsável nulo. Atualiza apenas status, assignedTechnicianId, firstStartedAt e updatedAt do Prisma. A data é produzida pelo servidor; o cliente não a escolhe.

Count diferente de um, conflito de serialização ou deadlock resulta em TICKET_CONFLICT/409. Chamado inexistente e inelegível têm a mesma resposta segura, sem dados privados. Não há retry automático do servidor. Duas assunções concorrentes têm um sucesso e um conflito, com um único responsável e evento. Repetir início em chamado atribuído também retorna 409, sem alterar o primeiro instante.

ATTENDANCE_STARTED registra ator, instante, estado e atribuição anterior/nova em TicketEvent na mesma transação. O instante do evento é igual a firstStartedAt. Falha da auditoria desfaz todos os efeitos. OPENED e PRIORITY_CLASSIFIED permanecem preservados. Serviço, formulário, solicitante, snapshot, respostas e prioridade não são alterados. As proteções históricas do PostgreSQL continuam vigentes e não foram modificadas.

Não há endpoint genérico de status nem de edição estrutural. IN_PROGRESS, PENDING e CLOSED não podem ser assumidos. As constraints existentes impedem um OPEN com responsável; não há transferência ou reabertura.

## Consultas e interface

Reutiliza GET /tickets, GET /tickets/:id e GET /tickets/:id/history. Para TECHNICIAN, ticketScope filtra assignedTechnicianId no PostgreSQL, inclusive totais, busca e paginação. Chamados livres ou de outro técnico retornam o mesmo 404 de inexistentes no detalhe/histórico. REQUESTER mantém a leitura própria; ADMIN mantém a leitura global, sem ganhar permissão de início.

Na fila Classificados há Assumir atendimento, com confirmação e bloqueio de envio repetido. Após resposta confirmada, a fila é atualizada e oferece o detalhe e Meus atendimentos. Em 409, informa indisponibilidade e atualiza a lista. Em resultado de rede incerto, orienta consultar Meus atendimentos. POST não é repetido automaticamente após transporte, 5xx ou conflito; somente SESSION_INVALID anterior à gravação permite renovar sessão e tentar novamente.

- #/technician/atendimentos: lista real, busca, filtros de status/prioridade, paginação e persistência após F5/novo login.
- #/technician/chamado/:uuid: detalhe e histórico completos conforme ownership confirmado pela API.

As páginas reais de listagem/detalhe do solicitante recebem opções de apresentação técnica, preservando seu comportamento padrão. Reutilizam PageHeading, RealTicketTable, TicketPagination, painéis, badges, timeline e MotionRegion. Sidebar recebe Meus atendimentos; não há novo CSS, redesign ou mudanças em dashboards/ECharts. Laboratório #/demo/ permanece intacto.

Responsável é apresentado com a identidade autenticada quando corresponde à atribuição. A timeline distingue o solicitante do chamado sem inventar um nome ou consultar um perfil privado adicional. Histórico traduz ATTENDANCE_STARTED e conserva sua whitelist, sem expor JSON arbitrário. Datas de abertura e primeiro início são apresentadas; nenhum tempo útil é calculado.

## Limites obrigatórios e dependências

**Encerramento definitivo não foi implementado.** RN-026 exige congelar métricas finais e referências históricas de jornadas/eventos; calendários, pausas, versionamento de jornada e política de fechamento (incluindo ADR-09) ainda dependem dos módulos e decisões correspondentes. Não se substitui esse requisito por tempo de relógio ou métricas fictícias.

Pendência depende de motivos ativos, flags/snapshots e períodos próprios, além das regras de retomada. Sem essas estruturas aprovadas, não há PENDING, retomada ou encerramento nesta entrega. Permanecem indisponíveis transferência, comentários, anexos, reabertura, troca de serviço e cálculos A/B. Nenhuma ADR ou tarefa global é aprovada implicitamente.

## Validação e roteiro manual

Testes usam exclusivamente namespaces descartáveis em helpdesk_test. Cobrem concorrência com dois técnicos reais autenticados, rollback de auditoria, integridade histórica com respostas, permissões, validação, CSRF/CORS, revogação e escopos. Uma comparação somente leitura de todos os registros de helpdesk_dev e dos checksums das migrations verifica preservação do desenvolvimento. Não há fixtures permanentes em helpdesk_dev.

1. Abrir e classificar um chamado básico; confirmar OPEN sem responsável antes da assunção.
2. Como técnico, em Classificados, confirmar Assumir atendimento e conferir saída da fila livre.
3. Abrir Meus atendimentos, testar busca/filtros e F5; conferir status Em atendimento, responsável e primeiro início.
4. Abrir detalhe/histórico: OPENED, classificação e início; confirmar serviço e snapshot preservados.
5. Como outro técnico, tentar a mesma assunção e o detalhe: conflito/recusa sem dados. Como solicitante original, conferir acompanhamento permitido.
6. Testar desktop/mobile e temas; confirmar ausência de ações de pendência, encerramento e edição estrutural.

Referências: [regras](03-regras-de-negocio.md), [tempos e pendências](09-tempos-pendencias.md), [ADRs pendentes](13-decisoes-pendentes.md), [autorização](21-autorizacao-backend.md), [triagem](27-bloco02-triagem.md), [design](07-telas-e-design.md).

## Auditoria da retomada — 29/10/2026

A retomada preservou a implementação existente e não exigiu correções no código da aplicação. Inventário reconciliado: 20 arquivos, sendo 17 modificados e três novos; nenhuma exclusão. HEAD de referência: `f03e32516bfaac07af5ce4555304d10b9c58c280`, branch `main`, sem commit ou push.

Foram reexecutados e aprovados 272 testes: 39 unitários backend, 161 de integração PostgreSQL e 72 frontend. Passaram também typecheck, lint, formatação, build, Prisma validate e git diff --check. O build mantém o aviso de chunks frontend superiores a 500 kB; otimização de bundles não integra este bloco.

A validação no navegador utilizou uma instância temporária da aplicação com autenticação real e namespace exclusivo em `helpdesk_test`, sem usar ou alterar contas de desenvolvimento. Foram conferidos classificação seguida de assunção, saída da fila, lista atribuída, F5, novo login, pesquisa por código, filtros de status/prioridade, estado vazio para outro técnico e recusa do detalhe fora do escopo. A paginação foi coberta pela integração automatizada; o cenário visual continha somente um atendimento atribuído.

As verificações visuais em desktop de 1440 px e mobile de 390 px confirmaram temas claro/escuro, detalhe, timeline, primeiro atendimento e componentes existentes. No mobile, não houve overflow horizontal da página; a tabela conserva rolagem interna. O console observado não apresentou erros ou avisos. A conferência somente leitura do namespace confirmou dois chamados, dois eventos OPENED, um PRIORITY_CLASSIFIED e exatamente um ATTENDANCE_STARTED após confirmação com duplo clique. O servidor temporário foi encerrado e seu namespace descartável foi liberado pelo mecanismo de testes existente.

Essas verificações não equivalem à homologação de todos os navegadores corporativos nem a uma auditoria completa de acessibilidade. Encerramento, pendências e métricas finais permanecem fora do escopo pelas dependências descritas acima.

## Inventário para revisão

Modificados:

- `README.md`
- `apps/backend/src/modules/tickets/ticket-api.repository.ts`
- `apps/backend/src/modules/tickets/ticket-api.service.ts`
- `apps/backend/src/modules/tickets/ticket.controller.ts`
- `apps/backend/src/modules/tickets/ticket.routes.ts`
- `apps/backend/tests/integration/tickets-http.integration.test.ts`
- `apps/frontend/src/app/auth-entry.tsx`
- `apps/frontend/src/components/real-ticket-table.tsx`
- `apps/frontend/src/lib/auth-client.ts`
- `apps/frontend/src/navigation/auth-routes.ts`
- `apps/frontend/src/pages/account.tsx`
- `apps/frontend/src/pages/requester-ticket-detail.tsx`
- `apps/frontend/src/pages/requester-tickets.tsx`
- `apps/frontend/src/pages/technician-triage.tsx`
- `docs/06-contratos-api.md`
- `docs/21-autorizacao-backend.md`
- `packages/contracts/src/index.ts`

Novos:

- `apps/backend/tests/integration/start-http.integration.test.ts`
- `apps/frontend/tests/start-ticket.test.ts`
- `docs/28-bloco03-assuncao.md`
