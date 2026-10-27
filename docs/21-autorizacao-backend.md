# DEV-004 — Autorização reutilizável (HD-018)

Implementação técnica em revisão, autorizada em 27/10/2026. Reutiliza a autenticação da [ADR-12](20-adr12-autenticacao.md), os modelos existentes e a [matriz de permissões](02-requisitos-e-permissoes.md). Não aprova ADRs pendentes nem disponibiliza APIs de usuários, catálogo, chamados ou dashboards.

## Composição HTTP

`authorization(authRuntime)` em `apps/backend/src/modules/authorization/http.ts` oferece `permission(operação)` e `roles(...perfis)`. Ambos incluem origem/CORS, CSRF nas mutações e autenticação real antes do guard. A identidade é reconstruída do JWT, sessão e usuário no PostgreSQL a cada requisição, mesmo que algum middleware anterior tenha preenchido req.identity. Body, parâmetros, headers e seletor demonstrativo não concedem autoridade.

As verificações de assinatura/claims, revogação, expiração, atividade e troca obrigatória da senha permanecem no módulo auth. Políticas internas também recusam identidade ausente e mustChangePassword. Essas funções recebem somente Identity produzida no servidor; não são parsers de identidade enviada pelo cliente. Nunca passar req.body/req.query como identidade.

Lista vazia de papéis, operação desconhecida e operações de outro tipo de recurso são negadas por padrão. ADMIN não é wildcard nem herda TECHNICIAN. RBAC por operação não substitui ownership: o consumidor precisa aplicar também o escopo do recurso.

## Permissões disponíveis

| Operação                                                | Perfil e limite                                                                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| users.read                                              | Própria conta para todos; ADMIN pode ler solicitantes/técnicos. Outros administradores não são incluídos automaticamente.                   |
| users.update-self                                       | REQUESTER/TECHNICIAN, exclusivamente a própria conta, conforme RN-003/004. Não autoriza alterar papel/atividade/senha por payload genérico. |
| users.update-requester                                  | ADMIN, atualização de recursos REQUESTER; não concede alteração arbitrária de perfil.                                                       |
| technicians.create / technicians.update                 | ADMIN, criação/atualização de TECHNICIAN; não concede exclusão ou desativação ainda pendente.                                               |
| services.create / services.update / services.deactivate | ADMIN, operações previstas na RN-005; não concede exclusão. CRUD não implementado.                                                          |
| tickets.create                                          | REQUESTER; abertura continua interna e sem endpoint.                                                                                        |
| tickets.read / tickets.aggregate                        | REQUESTER: próprios; TECHNICIAN: atribuídos; ADMIN: visão global documentada.                                                               |
| tickets.triage                                          | TECHNICIAN: somente OPEN sem atribuição e projeção mínima.                                                                                  |
| tickets.classify                                        | TECHNICIAN: OPEN livre, independentemente da atribuição; não atribui o chamado.                                                             |
| tickets.start                                           | TECHNICIAN: OPEN livre com prioridade definida; somente verificação de elegibilidade.                                                       |
| tickets.update-assigned                                 | TECHNICIAN: próprio atendimento ainda não encerrado; não aprova transições ou exceções.                                                     |

Permissões não concedidas continuam bloqueadas, incluindo supervisão administrativa de classificação/assunção/pendência/encerramento, reabertura, transferência e exclusão de técnicos. Uma operação de gestão não autoriza mudança arbitrária de perfis: futuras APIs precisam de contratos estritos, whitelist dos campos editáveis e validações de negócio próprias.

## Ownership e consulta

`ticket-scope.ts` e `user-scope.ts` produzem filtros Prisma por identidade e operação. `AuthorizedResources` em `resources.repository.ts` combina sempre `AND: [escopo, filtros validados, identificador]` antes da consulta. Não busca todos os registros para depois filtrá-los em memória.

Identificadores inválidos, inexistentes ou fora do escopo retornam o mesmo NOT_FOUND/404 sem dados do recurso. Negação de operação por perfil retorna FORBIDDEN/403, sem consultar o identificador. Sessão ausente/inválida retorna 401. Consultas de usuários usam select explícito e nunca retornam hash, sessão ou refresh.

Listas têm limite interno de 50 registros e ordenação estável; futuras rotas definirão paginação nos contratos apropriados. Filtros aceitos hoje: status, prioridade e serviceId. Rejeita propriedades extras, where, OR, requesterId, assignedTechnicianId ou papel fornecidos pelo cliente. Consultas agregadas usam o mesmo escopo no groupBy PostgreSQL, sem produzir dashboards ou KPIs. Resumo da fila e atendimentos atribuídos são consultas distintas.

## Triagem conservadora — ADR-03 ainda pendente

Projeção operacional mínima: id, code, status, priority e createdAt. Não recupera subject, description, respostas, snapshots de formulário/serviço, anexos ou identidades do solicitante/técnico. A proposta de ampliar a triagem para descrição/anexos não foi aprovada; ampliar exige decisão expressa e testes. A leitura completa exige atribuição ao técnico; o solicitante lê somente seus próprios chamados, e ADMIN mantém leitura global documentada.

## Autorização não é transição

`modules/tickets/ticket-preconditions.ts` separa elegibilidade de classificação/início e o bloqueio de modificações em CLOSED. Não há gravação ou transição nova. `assertTicketOperation` é somente preflight; não reserva nem assume o chamado. A futura HD-036 deverá combinar escopo e precondição no UPDATE condicional, dentro da mesma transação da atribuição/mudança de estado/evento, verificando o resultado para resolver concorrência. Um check seguido de UPDATE irrestrito não atende à RN-011.

Fluxos de pendência, encerramento, calendários, reabertura, transferência e exceções administrativas continuam nas tarefas e ADRs correspondentes. Nenhuma permissão genérica substitui essas regras.

## Testes e limites

Probes HTTP existem somente em tests/integration/authorization-fixture.ts; server.ts/createApp não os importam. Contas com papéis reais e senhas aleatórias protegidas por Argon2id são criadas somente no namespace descartável de helpdesk_test, com login/cookies/CSRF reais. Não há seed de desenvolvimento ou credencial fixa. Reutiliza o isolamento e a limpeza verificada já utilizados na DEV-003; desenvolvimento é conferido por conexão somente leitura antes/depois.

Migrations, contratos existentes, autenticação e frontend permanecem preservados. A HD-019 ainda deverá provisionar administrador/técnicos com credenciais seguras, troca inicial e autorização específica; esta camada não cria contas reais ou operações de gerenciamento.
