# Workflow real de Projetos — v1.0 pessoal

Extensão B1: [anexos privados nos formulários](39-anexos-privados-projetos.md), com claim transacional e leitura por ownership atual. A extensão B2 acrescenta conversa operacional persistida, SSE e anexos próprios de mensagem; as regras abaixo de workflow permanecem separadas do chat.

Extensão vigente: [categorias e formulários reais — Etapa A](38-formularios-reais-projetos.md). Categorias, respostas e versões de formulário complementam este workflow. Anexos privados de abertura foram concluídos na Etapa B1; a conversa operacional foi concluída na Etapa B2.

O responsável aprovou D1–D8 do [documento36](36-proposta-workflow-projetos.md), com separação entre definições de plano e execução, idempotência persistida e revalidação transacional. Esta entrega substitui a limitação anterior a solicitação/consulta; não altera o fluxo ou as métricas dos chamados.

## Estados, atores e precondições

| Transição                       | Ator                 | Precondições                                                                  |
| ------------------------------- | -------------------- | ----------------------------------------------------------------------------- |
| criação → REQUESTED             | Solicitante          | Título 3–160, objetivo/necessidade 10–4000, sessão válida e clientOperationId |
| REQUESTED → PLANNING            | ADMIN                | Responsável técnico elegível e justificativa                                  |
| PLANNING → IN_PROGRESS          | Responsável ou ADMIN | Plano publicado válido e responsável elegível                                 |
| IN_PROGRESS → COMPLETED         | Responsável ou ADMIN | Todas as atividades vigentes DONE e resumo da entrega                         |
| REQUESTED → CANCELED            | Autor ou ADMIN       | Justificativa                                                                 |
| PLANNING/IN_PROGRESS → CANCELED | ADMIN                | Justificativa                                                                 |

Atribuição não inicia execução nem planejamento automaticamente. ADMIN não se torna responsável técnico. Substituição exige motivo, mantém plano/execução e retira o acesso do técnico anterior. Conta elegível: TECHNICIAN ativa com troca inicial concluída. Terminais não permitem outras alterações. Não há reabertura, retorno de estado, cobrança, orçamento ou aprovação financeira.

A solicitação original e o evento REQUESTED continuam imutáveis. Pedidos antigos são lidos como REQUESTED, revisão1, sem responsável/plano inventados; o workflow é criado na primeira gestão autorizada. Não há backfill de datas ou regravação do pedido.

## Plano e execução separados

O rascunho é editável por ADMIN/responsável em PLANNING ou IN_PROGRESS e não é exposto ao solicitante. Limites:25 etapas,200 atividades, títulos 3–160, descrições até 2000, ordem única e contígua a partir de 1. IDs lógicos novos são atribuídos no servidor; IDs existentes são validados contra o projeto/rascunho corrente.

Publicação exige ao menos uma etapa e atividade por etapa. Uma versão publicada, suas etapas e definições de atividades não podem ser editadas nem receber definições posteriores. Triggers protegem a imutabilidade e verificam a publicação completa no commit. Nova publicação idêntica é recusada sem duplicar a versão.

Estados TODO/IN_PROGRESS/DONE ficam em registros de execução separados, ligados pelo ID lógico. Revisão preserva o estado das atividades mantidas, cria novas como TODO e conserva as removidas nas versões anteriores. Após iniciar, somente ADMIN publica revisão de escopo, com justificativa; responsável pode preparar o rascunho. Eventos registram o percentual anterior e posterior.

Progresso = floor(100 × DONE / total vigente). Cada etapa usa suas atividades. Sem plano publicado, progresso nulo e “Ainda sem plano”. Não se usa média de etapas nem percentual manual.100% não conclui automaticamente. Cancelamento conserva o progresso e não é conclusão.

A consulta de uma versão anterior mostra a definição histórica e identifica explicitamente que os estados de execução exibidos são os atuais. Estados anteriores permanecem nos eventos auditáveis; a definição não é reescrita.

## APIs e compatibilidade

As leituras antigas GET /projects, /projects/:id e /projects/:id/history continuam com seus contratos e projeções. POST /projects mantém campos originais e agora exige clientOperationId, conforme D8. O cliente autenticado gera/preserva a chave durante tentativas. Um consumidor HTTP antigo deve enviar esse campo; ausência retorna400 explicitamente.

| Método e rota                                         | Uso                                                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| GET /projects/workflows                               | Lista operacional com busca por título/código, estado, responsável, paginação e ownership |
| GET /projects/workflows/dashboard                     | Agregações reais por perfil                                                               |
| GET /projects/:id/workflow                            | Solicitação, estado, responsável, plano, progresso e capacidades autorizadas              |
| GET /projects/:id/workflow/history                    | Histórico seguro paginado, incluindo REQUESTED original                                   |
| GET /projects/:id/updates                             | Atualizações paginadas                                                                    |
| GET /projects/:id/plan-versions                       | Versões publicadas paginadas                                                              |
| GET /projects/:id/plan-versions/:version              | Definição publicada histórica                                                             |
| GET /projects/:id/conversation                        | Histórico cronológico paginado da conversa autorizada                                     |
| GET /projects/:id/conversation/stream                 | SSE autenticado; evento `sync` invalida o cache e faz o cliente buscar a página atual     |
| POST /projects/:id/conversation/messages              | Mensagem com `clientMessageId` e IDs de anexos temporários do próprio autor               |
| POST /projects/:id/conversation/attachments           | Upload binário privado temporário para a conversa                                         |
| DELETE /projects/:id/conversation/attachments/:fileId | Descarta temporário próprio ainda não associado                                           |
| GET /projects/:id/conversation/attachments/:fileId    | Download autenticado de anexo associado a mensagem                                        |
| GET/PUT /projects/:id/plan-draft                      | Consulta autorizada/salvamento de rascunho                                                |
| POST /projects/:id/assignment                         | Atribuição/substituição, sem início                                                       |
| POST /projects/:id/planning                           | Entrada em planejamento                                                                   |
| POST /projects/:id/plan-publication                   | Publicação/revisão do plano                                                               |
| POST /projects/:id/start                              | Início da execução                                                                        |
| PATCH /projects/:id/activities/:activityId            | Estado de atividade; sair de DONE exige motivo                                            |
| POST /projects/:id/updates                            | Atualização textual; correctionOf vincula correção append-only                            |
| POST /projects/:id/complete                           | Conclusão com resumo e validação de todas as atividades                                   |
| POST /projects/:id/cancel                             | Cancelamento justificado                                                                  |

Criação: clientOperationId UUID. Demais escritas: expectedRevision positivo e clientOperationId. Assignment usa technicianId e reason; planning/publicação/conclusão/cancelamento usam reason de 3–2000; rascunho usa definition; atividade usa state e reason; atualização usa content 1–4000 e correctionOf opcional. Mensagens têm `clientMessageId` UUID, conteúdo de 1–4000 caracteres e até dez IDs de anexos temporários únicos. Uploads são binários de até 10 MB, sujeitos à validação de arquivo compartilhada com Chamados; apenas PNG sanitizado pode ser pré-visualizado inline. Parâmetros desconhecidos são rejeitados. Não há endpoint de percentual manual nem exclusão física.

## Autorização e auditoria

- REQUESTER: workflow próprio, plano publicado, atualizações/histórico e indicadores próprios. Cancela somente próprio REQUESTED. Sem rascunho, atribuição ou execução.
- TECHNICIAN: somente workflows atribuídos, inclusive terminais para consulta; prepara rascunho, publica antes do início, atualiza atividades, registra atualizações e inicia/conclui conforme precondições.
- ADMIN: leitura global e poderes administrativos explícitos; atribui/substitui, planeja, publica revisões após início, inicia/conclui e cancela. Não herda papel de técnico.

Grants explícitos: projects.workflow-read, projects.assign, projects.plan, projects.update, projects.transition, projects.cancel e projects.conversation, além dos grants originais. Para a conversa, REQUESTER é limitado ao autor do projeto; TECHNICIAN ao responsável atual; ADMIN tem acesso administrativo global explícito. A leitura antiga projects.read mantém os perfis anteriores; técnicos utilizam as novas projeções operacionais atribuídas.

Cada escrita bloqueia/revalida usuário, sessão e projeto, verifica estado/ownership e atualiza pela revisão esperada. Revisões monotônicas e evento único por revisão. Auditoria falha → rollback. Payloads Zod estritos, CSRF, cookies HttpOnly, CORS e sessões revogáveis preservados. Sem acesso cruzado por IDs.

Histórico público retorna tipo, resumo, autor, data e revisão; não devolve JSON interno arbitrário. Detalhes de mudança anterior/nova ficam na auditoria. Atualizações são imutáveis; correção cria novo registro vinculado ao anterior do mesmo projeto.

## Idempotência e concorrência

Resultados confirmados são persistidos em project_operations, por ator e clientOperationId, com hash canônico do comando e resultado original. Após revalidar acesso atual, repetição idêntica recupera o resultado original mesmo com revisão avançada. Mesma chave/payload diferente retorna409. Perda de acesso após substituição continua efetiva; a chave não contorna autorização.

Bloqueio de linha e atualização condicional garantem um vencedor em escritas incompatíveis, com409 para leitura desatualizada. Não há retry automático de escrita. Erros400/401/403/404 mantêm seus significados. A interface conserva o texto em conflito e consulta o estado atual antes de nova confirmação; em falha de transporte preserva o comando para recuperar a confirmação com a mesma chave.

## Persistência

Migration aditiva 20261106160000_workflow_projetos, testada em PostgreSQL isolado antes da aplicação local com backup verificável. Novas tabelas: project_workflows, project_plan_drafts, project_plan_versions, project_plan_stages, project_plan_activities, project_activity_states, project_workflow_updates, project_workflow_events e project_operations. A migration B2 `20261108200000_conversa_projetos` acrescenta `project_conversation_messages`, `project_conversation_attachments` e `project_conversation_attachment_events`; as mensagens são únicas por projeto, autor e chave idempotente, e anexos temporários só podem ser reivindicados por uma mensagem do mesmo projeto/autor.

FKs RESTRICT, índices por responsável/estado e paginação, restrições de estado, revisão, ordens/IDs e ligações compostas entre versão/etapa/execução. Os modelos Prisma correspondentes preservam ProjectRequest/ProjectRequestEvent. Migrations anteriores permanecem intactas; tabelas legadas OC não foram removidas ou reativadas.

## Interface e indicadores

Solicitante, técnico e ADMIN têm navegação de Projetos real, lista filtrável e detalhe autorizado. Gestão usa diálogos, seletor de técnicos elegíveis, editor de etapas/atividades ordenadas, rascunho/publicação, atualização e correção, histórico/versões paginados e feedback após persistência. O detalhe inclui conversa operacional compartilhada entre solicitante autor, responsável atual e ADMIN, reutilizando o componente visual do chat de Chamados. Conversa, atualizações formais, auditoria e versões continuam sendo registros distintos. Em COMPLETED/CANCELED a conversa é somente leitura. Editor carregado sob demanda; componentes, temas e animações existentes preservados.

Dashboards separam Projetos de Chamados: distribuição por estado, solicitações recentes, progresso, atualizações, atividades pendentes da carteira técnica, sem responsável para ADMIN, responsáveis principais(até 10) e evolução mensal UTC de solicitações/conclusões/cancelamentos nos últimos 12 meses. Últimas 24 mudanças mostram evolução individual do progresso, sem média fictícia entre projetos. Sem amostra, estado vazio honesto. Progresso não é SLA, produtividade ou prazo cumprido.

## Validação e limites de aceite

Testes cobrem transições, legado, IDs cruzados, rascunhos, versões, execução, progresso, substituição/perda de acesso, atualização/correção, idempotência após avanço, duas escritas/publicações concorrentes, rollback de auditoria, FKs e terminais. Relatório e resultados desta entrega ficam no checkpoint local. Homologação visual só é declarada com evidência própria; indisponibilidade da ferramenta não é aprovação.

A migration aplicada mantém seus bytes exatos por regra específica em .gitattributes (-text), evitando alteração de checksum por normalização futura de terminadores de linha. Nenhuma migration aplicada foi reescrita.

## Ajustes de homologação operacional — 10/11/2026

- Prioridade de Projetos não faz parte da solicitação do REQUESTER. A criação persiste `NULL`; ADMIN e o TECHNICIAN responsável atual podem classificar ou alterar prioridade, com evento `PRIORITY_CHANGED`. Não há SLA de Projetos.
- O editor oferece “Salvar e publicar” quando permitido. A interface mantém as duas operações versionadas do contrato: salvar rascunho e publicar usando a revisão retornada. Falha na segunda operação informa que o rascunho foi salvo sem afirmar publicação.
- “Feito” em uma etapa atualiza em uma transação as atividades existentes para `DONE`, avança uma revisão e registra o evento. Status e progresso da etapa derivam das atividades. A conclusão efetiva é derivada dos eventos; estados legados sem timestamp não recebem data inventada.
- REQUESTER consulta somente a versão publicada e o estado operacional real, sem ações de edição. O responsável e ADMIN mantêm ações operacionais conforme estado e RBAC.
- O detalhe concentra ações no início da página. Planos publicados e revisões anteriores continuam imutáveis.
