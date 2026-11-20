# Workflow real de Projetos — v1.0 pessoal

Extensão B1: [anexos privados nos formulários](39-anexos-privados-projetos.md), com claim transacional e leitura por ownership atual. A extensão B2 acrescenta conversa operacional persistida, SSE e anexos próprios de mensagem; as regras abaixo de workflow permanecem separadas do chat.

Extensão vigente: [categorias e formulários reais — Etapa A](38-formularios-reais-projetos.md). Categorias, respostas e versões de formulário complementam este workflow. Anexos privados de abertura foram concluídos na Etapa B1; a conversa operacional foi concluída na Etapa B2.

O responsável aprovou D1–D8 do [documento36](36-proposta-workflow-projetos.md), com separação entre definições de plano e execução, idempotência persistida e revalidação transacional. Esta entrega substitui a limitação anterior a solicitação/consulta; não altera o fluxo ou as métricas dos chamados.

## Estados, atores e precondições

| Transição                       | Ator                 | Precondições                                                                       |
| ------------------------------- | -------------------- | ---------------------------------------------------------------------------------- |
| criação → REQUESTED             | Solicitante          | Título 3–160, objetivo/necessidade 10–4000, sessão válida e clientOperationId      |
| REQUESTED → PLANNING            | ADMIN ou responsável | Atribuição pelo ADMIN ou primeira gravação de plano de projeto legado já atribuído |
| PLANNING → IN_PROGRESS          | Responsável ou ADMIN | Plano publicado válido e responsável elegível                                      |
| IN_PROGRESS → COMPLETED         | Responsável ou ADMIN | Todas as atividades vigentes DONE e resumo da entrega                              |
| REQUESTED → CANCELED            | Autor ou ADMIN       | Justificativa                                                                      |
| PLANNING/IN_PROGRESS → CANCELED | ADMIN                | Justificativa                                                                      |

A atribuição pelo ADMIN move um projeto REQUESTED para PLANNING na mesma transação, revisão e entrada do histórico. A execução continua dependendo de uma ação explícita depois da publicação. A troca de responsável em um projeto já em planejamento ou em execução exige motivo, preserva estado, plano e progresso e retira o acesso do técnico anterior. A conta elegível é TECHNICIAN ativa com troca inicial concluída. Projetos concluídos e cancelados conservam as restrições de escrita.

A solicitação original e seu evento permanecem imutáveis. Pedidos antigos sem workflow continuam em REQUESTED, revisão 1. Projetos legados ainda em REQUESTED com responsável elegível avançam no primeiro salvamento ou publicação do plano pelo ADMIN ou pelo responsável. O evento dessa operação registra a transição na data em que ela ocorre.

## Plano e execução separados

O rascunho é editável por ADMIN/responsável em PLANNING ou IN_PROGRESS e não é exposto ao solicitante. Limites:25 etapas,200 atividades, títulos 3–160, descrições até 2000, ordem única e contígua a partir de 1. IDs lógicos novos são atribuídos no servidor; IDs existentes são validados contra o projeto/rascunho corrente.

Publicação exige ao menos uma etapa e atividade por etapa. Uma versão publicada, suas etapas e definições de atividades não podem ser editadas nem receber definições posteriores. Triggers protegem a imutabilidade e verificam a publicação completa no commit. Nova publicação idêntica é recusada sem duplicar a versão.

Estados TODO/IN_PROGRESS/DONE ficam em registros de execução separados, ligados pelo ID lógico. Revisão preserva o estado das atividades mantidas, cria novas como TODO e conserva as removidas nas versões anteriores. Após iniciar, somente ADMIN publica revisão de escopo, com justificativa; responsável pode preparar o rascunho. Eventos registram o percentual anterior e posterior.

Progresso = floor(100 × DONE / total vigente). Cada etapa usa suas atividades. Sem plano publicado, progresso nulo e “Ainda sem plano”. Não se usa média de etapas nem percentual manual.100% não conclui automaticamente. Cancelamento conserva o progresso e não é conclusão.

A consulta de uma versão anterior mostra a definição histórica e identifica explicitamente que os estados de execução exibidos são os atuais. Estados anteriores permanecem nos eventos auditáveis; a definição não é reescrita.

## APIs e compatibilidade

As leituras antigas GET /projects, /projects/:id e /projects/:id/history continuam com seus contratos e projeções. POST /projects mantém campos originais e agora exige clientOperationId, conforme D8. O cliente autenticado gera/preserva a chave durante tentativas. Um consumidor HTTP antigo deve enviar esse campo; ausência retorna400 explicitamente.

| Método e rota                                         | Uso                                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| GET /projects/workflows                               | Lista operacional com busca por título/código, estado, responsável, paginação e ownership  |
| GET /projects/workflows/dashboard                     | Agregações reais por perfil                                                                |
| GET /projects/:id/workflow                            | Solicitação, estado, responsável, plano, progresso e capacidades autorizadas               |
| GET /projects/:id/workflow/history                    | Histórico paginado, incluindo a solicitação original e o conteúdo das atualizações antigas |
| GET /projects/:id/updates                             | Leitura de atualizações legadas para compatibilidade                                       |
| GET /projects/:id/plan-versions                       | Versões publicadas paginadas                                                               |
| GET /projects/:id/plan-versions/:version              | Definição publicada histórica                                                              |
| GET /projects/:id/conversation                        | Histórico cronológico paginado da conversa autorizada                                      |
| GET /projects/:id/conversation/stream                 | SSE autenticado; evento `sync` invalida o cache e faz o cliente buscar a página atual      |
| POST /projects/:id/conversation/messages              | Mensagem com `clientMessageId` e IDs de anexos temporários do próprio autor                |
| POST /projects/:id/conversation/attachments           | Upload binário privado temporário para a conversa                                          |
| DELETE /projects/:id/conversation/attachments/:fileId | Descarta temporário próprio ainda não associado                                            |
| GET /projects/:id/conversation/attachments/:fileId    | Download autenticado de anexo associado a mensagem                                         |
| GET/PUT /projects/:id/plan-draft                      | Consulta autorizada/salvamento de rascunho                                                 |
| POST /projects/:id/assignment                         | Atribuição, com entrada em planejamento quando o projeto está em REQUESTED                 |
| POST /projects/:id/plan-publication                   | Publicação/revisão do plano                                                                |
| POST /projects/:id/start                              | Início da execução                                                                         |
| PATCH /projects/:id/activities/:activityId            | Estado de atividade; sair de DONE exige motivo                                             |
| POST /projects/:id/complete                           | Conclusão com resumo e validação de todas as atividades                                    |
| POST /projects/:id/cancel                             | Cancelamento justificado                                                                   |

As escritas continuam usando `clientOperationId` UUID e, depois da criação, `expectedRevision`. A atribuição usa `technicianId` e `reason`. Publicação, conclusão e cancelamento usam `reason` de 3–2000 caracteres. Rascunhos usam `definition`, e atividades usam `state` e `reason`. As rotas de início manual do planejamento e criação de atualização manual foram descontinuadas. As regras de mensagens e anexos estão na [documentação da conversa](39-anexos-privados-projetos.md).

## Autorização e auditoria

- REQUESTER: workflow próprio, plano publicado, histórico e indicadores próprios. Cancela somente próprio REQUESTED. Sem rascunho, atribuição ou execução.
- TECHNICIAN consulta os projetos atribuídos, inclusive os terminais. Prepara rascunhos, publica antes do início, atualiza atividades e inicia ou conclui o projeto conforme as precondições.
- ADMIN tem leitura global e poderes explícitos para atribuir ou substituir o responsável, planejar, publicar revisões durante a execução, iniciar, concluir e cancelar.

Concluir e retirar operacionalmente um projeto estão disponíveis somente a ADMIN e ao TECHNICIAN que é o responsável atual, conforme o estado e as precondições. A conclusão exige todas as atividades vigentes DONE e o resumo da entrega. REQUESTER e técnicos sem vínculo não podem executar essas operações, inclusive por chamada direta à API. “Excluir projeto” registra uma retirada operacional auditada em `operational_retirements`; não apaga fisicamente o pedido, o workflow, as mensagens, os anexos ou o histórico. O motivo e o ator ficam registrados.

As permissões explícitas incluem `projects.workflow-read`, `projects.assign`, `projects.plan`, `projects.transition`, `projects.cancel` e `projects.conversation`. A conversa é acessível ao autor, ao responsável atual e ao ADMIN. A leitura antiga `projects.read` mantém os perfis anteriores, e técnicos consultam a projeção operacional dos projetos atribuídos.

Cada escrita bloqueia/revalida usuário, sessão e projeto, verifica estado/ownership e atualiza pela revisão esperada. Revisões monotônicas e evento único por revisão. Auditoria falha → rollback. Payloads Zod estritos, CSRF, cookies HttpOnly, CORS e sessões revogáveis preservados. Sem acesso cruzado por IDs.

O Histórico autorizado retorna tipo, resumo, autor, data e revisão. A transição automática também registra os estados anterior e novo na auditoria. Cada atualização ou correção antiga aparece uma única vez no Histórico, com conteúdo, autor e data originais. Os eventos e registros antigos continuam imutáveis.

## Idempotência e concorrência

Resultados confirmados são persistidos em project_operations, por ator e clientOperationId, com hash canônico do comando e resultado original. Após revalidar acesso atual, repetição idêntica recupera o resultado original mesmo com revisão avançada. Mesma chave/payload diferente retorna409. Perda de acesso após substituição continua efetiva; a chave não contorna autorização.

Bloqueio de linha e atualização condicional garantem um vencedor em escritas incompatíveis, com409 para leitura desatualizada. Não há retry automático de escrita. Erros400/401/403/404 mantêm seus significados. A interface conserva o texto em conflito e consulta o estado atual antes de nova confirmação; em falha de transporte preserva o comando para recuperar a confirmação com a mesma chave.

## Persistência

Migration aditiva 20261106160000_workflow_projetos, testada em PostgreSQL isolado antes da aplicação local com backup verificável. Novas tabelas: project_workflows, project_plan_drafts, project_plan_versions, project_plan_stages, project_plan_activities, project_activity_states, project_workflow_updates, project_workflow_events e project_operations. A migration B2 `20261108200000_conversa_projetos` acrescenta `project_conversation_messages`, `project_conversation_attachments` e `project_conversation_attachment_events`; as mensagens são únicas por projeto, autor e chave idempotente, e anexos temporários só podem ser reivindicados por uma mensagem do mesmo projeto/autor.

FKs RESTRICT, índices por responsável/estado e paginação, restrições de estado, revisão, ordens/IDs e ligações compostas entre versão/etapa/execução. Os modelos Prisma correspondentes preservam ProjectRequest/ProjectRequestEvent. Migrations anteriores permanecem intactas; tabelas legadas OC não foram removidas ou reativadas.

## Interface e indicadores

Solicitante, técnico e ADMIN têm lista filtrável e detalhe autorizado. O detalhe prioriza a conversa e apresenta a solicitação original com os dados persistidos; as informações do projeto e o progresso ficam no painel lateral. Planejamento, consulta de etapas, versões e Histórico são acessados por controles compactos, com ações disponíveis conforme papel, vínculo e estado. O detalhe inclui conversa operacional entre solicitante autor, responsável atual e ADMIN. Em COMPLETED/CANCELED a conversa é somente leitura.

A atribuição ADMIN de um projeto REQUESTED registra a mudança de responsável e abre PLANNING na mesma operação. Depois da publicação do plano, iniciar a execução continua sendo uma ação explícita. O responsável atual e ADMIN consultam as informações necessárias ao trabalho conforme suas permissões; REQUESTER consulta o plano publicado, etapas, progresso e histórico autorizados, sem edição operacional.

A criação de novas atualizações formais foi descontinuada. O endpoint legado `GET /projects/:id/updates` permanece somente para leitura compatível; registros antigos continuam acessíveis no Histórico com conteúdo, autoria e data originais. A conversa do projeto é o canal para mensagens posteriores. Mensagens, eventos de workflow, versões publicadas e atualizações formais antigas são registros distintos e não substituem uns aos outros.

Dashboards separam Projetos de Chamados: distribuição por estado, solicitações recentes, progresso, atividades pendentes da carteira técnica, sem responsável para ADMIN, responsáveis principais(até 10) e evolução mensal UTC de solicitações/conclusões/cancelamentos nos últimos 12 meses. Últimas 24 mudanças mostram evolução individual do progresso, sem média fictícia entre projetos. Sem amostra, estado vazio honesto. Progresso não é SLA, produtividade ou prazo cumprido.

## Validação e limites de aceite

Testes cobrem transições, legado, IDs cruzados, rascunhos, versões, execução, progresso, substituição/perda de acesso, atualização/correção, idempotência após avanço, duas escritas/publicações concorrentes, rollback de auditoria, FKs e terminais. Relatório e resultados desta entrega ficam no checkpoint local. Homologação visual só é declarada com evidência própria; indisponibilidade da ferramenta não é aprovação.

A migration aplicada mantém seus bytes exatos por regra específica em .gitattributes (-text), evitando alteração de checksum por normalização futura de terminadores de linha. Nenhuma migration aplicada foi reescrita.

## Ajustes de homologação operacional — 10/11/2026

- Prioridade de Projetos não faz parte da solicitação do REQUESTER. A criação persiste `NULL`; ADMIN e o TECHNICIAN responsável atual podem classificar ou alterar prioridade, com evento `PRIORITY_CHANGED`. Não há SLA de Projetos.
- O editor oferece “Salvar e publicar” quando permitido. A interface mantém as duas operações versionadas do contrato: salvar rascunho e publicar usando a revisão retornada. Falha na segunda operação informa que o rascunho foi salvo sem afirmar publicação.
- “Feito” em uma etapa atualiza em uma transação as atividades existentes para `DONE`, avança uma revisão e registra o evento. Status e progresso da etapa derivam das atividades. A conclusão efetiva é derivada dos eventos; estados legados sem timestamp não recebem data inventada.
- REQUESTER consulta somente a versão publicada e o estado operacional real, sem ações de edição. O responsável e ADMIN mantêm ações operacionais conforme estado e RBAC.
- O detalhe concentra ações no início da página. Planos publicados e revisões anteriores continuam imutáveis.
