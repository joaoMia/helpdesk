# DEV-004 — Autorização reutilizável (HD-018)

> Registro de desenvolvimento. Para regras e escopo atuais, consulte o [contrato vigente da v1.0](v1-contrato.md).

Implementação técnica em revisão, autorizada em 27/10/2026. Reutiliza a autenticação da [ADR-12](20-adr12-autenticacao.md), os modelos existentes e a [matriz de permissões](02-requisitos-e-permissoes.md). Não aprova ADRs pendentes nem disponibiliza APIs de usuários, catálogo, chamados ou dashboards.

## Composição HTTP

`authorization(authRuntime)` em `apps/backend/src/modules/authorization/http.ts` oferece `permission(operação)` e `roles(...perfis)`. Ambos incluem origem/CORS, CSRF nas mutações e autenticação real antes do guard. A identidade é reconstruída do JWT, sessão e usuário no PostgreSQL a cada requisição, mesmo que algum middleware anterior tenha preenchido req.identity. Body, parâmetros, headers e seletor demonstrativo não concedem autoridade.

As verificações de assinatura/claims, revogação, expiração, atividade e troca obrigatória da senha permanecem no módulo auth. Políticas internas também recusam identidade ausente e mustChangePassword. Essas funções recebem somente Identity produzida no servidor; não são parsers de identidade enviada pelo cliente. Nunca passar req.body/req.query como identidade.

Lista vazia de papéis, operação desconhecida e operações de outro tipo de recurso são negadas por padrão. ADMIN não é wildcard nem herda TECHNICIAN. RBAC por operação não substitui ownership: o consumidor precisa aplicar também o escopo do recurso.

## Permissões disponíveis

| Operação                                                   | Perfil e limite                                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| users.read                                                 | Própria conta para todos; ADMIN pode ler solicitantes/técnicos. Outros administradores não são incluídos automaticamente.                   |
| users.update-self                                          | REQUESTER/TECHNICIAN, exclusivamente a própria conta, conforme RN-003/004. Não autoriza alterar papel/atividade/senha por payload genérico. |
| users.update-requester                                     | ADMIN, atualização de recursos REQUESTER; não concede alteração arbitrária de perfil.                                                       |
| technicians.read / technicians.create / technicians.update | ADMIN, criação/atualização de TECHNICIAN; não concede exclusão ou desativação ainda pendente.                                               |
| services.create / services.update / services.deactivate    | ADMIN, operações previstas na RN-005; não concede exclusão. CRUD real disponível na DEV-008.                                                |
| tickets.create                                             | REQUESTER; abertura continua interna e sem endpoint.                                                                                        |
| tickets.read                                               | REQUESTER: próprios; TECHNICIAN e ADMIN: todos os Chamados não retirados, com detalhe integral.                                             |
| tickets.aggregate                                          | REQUESTER: próprios; TECHNICIAN: atribuídos; ADMIN: visão global documentada.                                                               |
| tickets.triage                                             | TECHNICIAN: somente OPEN sem atribuição e projeção mínima.                                                                                  |
| tickets.classify                                           | TECHNICIAN: OPEN livre, independentemente da atribuição; não atribui o chamado.                                                             |
| tickets.start                                              | TECHNICIAN: OPEN livre com prioridade definida; somente verificação de elegibilidade.                                                       |
| tickets.update-assigned                                    | TECHNICIAN: próprio atendimento ainda não encerrado; não aprova transições ou exceções.                                                     |

Permissões não concedidas continuam bloqueadas, incluindo supervisão administrativa de classificação/assunção/pendência/encerramento, reabertura, transferência e exclusão de técnicos. Uma operação de gestão não autoriza mudança arbitrária de perfis: futuras APIs precisam de contratos estritos, whitelist dos campos editáveis e validações de negócio próprias.

ADMIN e TECHNICIAN podem enviar mensagens e anexos em Chamados autorizados nos estados OPEN, IN_PROGRESS e PENDING, independentemente do início ou da atribuição. REQUESTER conserva leitura e envio somente nos próprios Chamados. RESOLVED/CLOSED permanecem somente leitura. Solução, pausa e retomada continuam exclusivas do técnico responsável.

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

DEV-007 / HD-021 disponibiliza gestão real de técnicos com contratos estritos, revalidação transacional e projeções públicas. A permissão technicians.read é exclusiva de ADMIN. Consulte os [limites e procedimentos](24-gestao-tecnicos.md); demais políticas e decisões pendentes permanecem inalteradas.

DEV-008 / HD-025: categories.read e services.read concedem consulta autenticada com escopo de disponibilidade; categories.create/update são exclusivos de ADMIN. Categorias inativas e seus serviços não são recuperados por REQUESTER/TECHNICIAN. Detalhes em [catálogo real](25-catalogo-real.md).

BLOCO 01: os endpoints reais de consulta/histórico reutilizam ticketScope e os mesmos grants, sem alterações de permissões. POST /tickets exige REQUESTER e revalida usuário/sessão na transação de abertura. Triagem permanece no adaptador mínimo, sem nova rota ou ampliação de visibilidade. Detalhes em [BLOCO 01](26-bloco01-chamados.md).

BLOCO 02 disponibiliza consulta operacional e classificação usando tickets.triage/classify existentes, sem ampliar grants ou projeção. Revalidação transacional e UPDATE condicional com evento; ADMIN continua sem poderes de técnico. Limites em [triagem real](27-bloco02-triagem.md). Assumir atendimento continua fora do escopo.

BLOCO 03 implementa a assunção com tickets.start existente, revalidação na transação e UPDATE condicional. Leitura completa permanece restrita aos atribuídos para TECHNICIAN; triagem livre mantém somente cinco campos. Nenhum grant ou escopo foi ampliado. [Detalhes e limites](28-bloco03-assuncao.md).

BLOCO 03.1 aprova explicitamente tickets.overview e tickets.assignment-candidates para TECHNICIAN/ADMIN: metadados com nome do responsável e consulta mínima de destinatários habilitados. Não concede detalhes de terceiros, classificação para ADMIN ou escrita de distribuição. [Contratos, limites e proposta](29-bloco031-visao-e-distribuicao.md).

## Evolução vigente — execução integrada aprovada

O diagnóstico anterior de distribuição foi superado pela autorização posterior: `tickets.assign` concede distribuição a TECHNICIAN/ADMIN sem iniciar. `administration.manage` é exclusivo ADMIN. Grants: tickets.comment para REQUESTER/TECHNICIAN/ADMIN com escopo de leitura e estado; tickets.solve/pause/resume somente TECHNICIAN responsável; tickets.close para responsável TECHNICIAN ou ADMIN, com solução e métricas completas; pending-reasons.read para TECHNICIAN/ADMIN com escopo de atividade; dashboard.read somente ADMIN. Nenhum é wildcard ou aceita papel vindo do cliente.

Mutações revalidam usuário, sessão, estado e vínculo dentro da transação; auditoria falha implica rollback. Mutex administrativo protege o último ADMIN e revisões de configuração; updates condicionais e locks/Serializable protegem concorrência. Leituras privadas e arquivos filtram vínculo no PostgreSQL. O DTO global técnico não foi ampliado para descrição/solicitante/snapshots/arquivos. Detalhes em [atendimento e métricas](31-atendimento-tempos-e-sla.md). As permissões de tarefas futuras não são aprovadas por este registro.

Refinamento vigente: SSE reaplica identidade/atividade/sessão/escopo continuamente. Não há grant adicional de leitura ou escrita. RESOLVED/CLOSED bloqueiam conversa; descarte autorizado atua somente sobre rascunho próprio não publicado e não elimina arquivos históricos. Retirar o botão de encerramento do frontend não altera a política preservada de /close. Ver [refinamento integrado](32-refinamento-chat-solucao-e-catalogo.md).

Continuidade posterior aprovada: contexto de categoria/serviço, solicitante, empresa e setor na listagem técnica, sem descrição ou dados completos privados. `tickets.retire` permite retirada global a ADMIN ou TECHNICIAN responsável, com revalidação transacional; filtros de retirada também alcançam contagens, arquivos e SSE. Exclusão administrativa só aceita conta sem vínculos. Não há mais grants ou rotas coletivas. Ver [regras vigentes](34-continuidade-controlada.md).
