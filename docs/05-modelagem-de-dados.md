# 05 — Modelo relacional proposto (conceitual)

**DEV-003:** users foi preservada. A migration aditiva `20261026234800_auth_sessions` cria AuthSession (usuário, datas, expiração absoluta, revogação/motivo) e AuthRefreshToken (hash único, sessão, criação, expiração e consumo). Tokens em claro não são persistidos. FKs com cascata preservam RN-004; sessões e histórico de hashes permitem revogação/replay conforme [ADR-12](20-adr12-autenticacao.md). Nenhum modelo de chamados, catálogo ou projetos foi recriado.

**Situação DEV-002:** o núcleo mínimo de oito tabelas foi migrado em desenvolvimento conforme autorização específica; veja o registro ao final. A tabela conceitual ampla abaixo inclui módulos futuros e não autoriza sua implementação.

| Tabela                     | Campos centrais                                                                                                                                                                    | Regras e índices                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `users`                    | id UUID, role, name, email, password_hash, must_change_password, is_active, avatar_key, created_at, updated_at                                                                     | email único case-insensitive; hash seguro                                            |
| `technician_settings`      | user_id, schedule_version_id                                                                                                                                                       | técnico usa calendário padrão ou personalizado                                       |
| `work_schedules`           | id, name, kind=COMPANY/PERSONALIZED, active_version                                                                                                                                | empresa e calendários por técnico                                                    |
| `work_schedule_versions`   | id, schedule_id, version, timezone, valid_from, created_at                                                                                                                         | preservar parâmetros usados historicamente                                           |
| `work_schedule_intervals`  | id, schedule_version_id, weekday, starts_local, ends_local                                                                                                                         | vários intervalos por dia; sem sobreposição                                          |
| `work_schedule_exceptions` | id, schedule_version_id, date, intervals_override, reason                                                                                                                          | proposta: feriados/folgas, habilitação faseada                                       |
| `services`                 | id, name, description, active, created_at, updated_at                                                                                                                              | desativação sem apagar histórico                                                     |
| `tickets`                  | id, code, requester_id, assigned_technician_id NULL, subject, description, status, priority NULL, created_at, classified_at, first_started_at NULL, closed_at NULL, closed_by NULL | índices em status, prioridade, atribuído, criação; code único                        |
| `ticket_services`          | id, ticket_id, service_id, service_name_snapshot, category_name_snapshot, form_snapshot, added_by, added_at, source                                                                | proposta anterior a revisar: exatamente um snapshot de serviço por chamado (VIS-003) |
| `pending_reasons`          | id, name, counts_toward_solution, auto_resume_on_requester_activity, active                                                                                                        | catálogo administrável                                                               |
| `ticket_pending_periods`   | id, ticket_id, reason_id, reason_name_snapshot, counts_snapshot, auto_resume_snapshot, started_by, started_at, ended_at NULL, explanation                                          | uma pendência ativa por chamado                                                      |
| `ticket_comments`          | id, ticket_id, author_id, body, created_at, edited_at NULL                                                                                                                         | autoria e ordenação                                                                  |
| `ticket_attachments`       | id, ticket_id, uploader_id, comment_id NULL, storage_key, original_name, mime, size_bytes, created_at                                                                              | armazenamento protegido, sem URLs públicas                                           |
| `ticket_events`            | id, ticket_id, actor_id NULL, event_type, old_value_json, new_value_json, created_at                                                                                               | auditoria legível, sem segredos                                                      |
| `ticket_schedule_segments` | id, ticket_id, start_at, end_at, schedule_version_id                                                                                                                               | registrar qual jornada é válida por trecho                                           |
| `ticket_metrics`           | ticket_id, total_work_minutes, attendance_work_minutes NULL, calculated_at, finalized_at NULL                                                                                      | snapshot do cálculo; sem cronômetro no browser                                       |

## Relacionamentos principais

- User REQUESTER 1:N Ticket; User TECHNICIAN 1:N Ticket atribuído.
- Ticket 1:1 TicketService (cardinalidade conceitual aprovada na VIS-003); Ticket 1:N TicketComment, TicketAttachment, TicketEvent e TicketPendingPeriod.
- Service 1:N TicketService; nomes, categoria e formulário permanecem em snapshot, sem preço ou cobrança.
- PendingReason 1:N TicketPendingPeriod; regra armazenada no período.
- WorkSchedule 1:N WorkScheduleVersion 1:N WorkScheduleInterval.
- Ticket N:1 WorkScheduleVersion por intervalo de contexto (`ticket_schedule_segments`).

## Invariantes e exclusão

- `priority=NULL` até classificação. `assigned_technician_id=NULL` até assumir.
- `status=IN_PROGRESS` ou `PENDING` exige responsável. `CLOSED` exige `closed_at`.
- Há somente um período de pendência aberto por chamado; proteger por índice parcial/transação.
- Cliente excluído implica exclusão de todos seus chamados e conteúdos relacionados (regra original), em operação segura; cuidado com LGPD e trilhas de auditoria empresariais.
- Técnico e Serviço não são excluídos fisicamente na v1.
- Guardar datas instantes em UTC com timezone do calendário; serviços sem preço ou cobrança (DEV-001).
- Nomes, categoria e formulário históricos não mudam ao editar o catálogo (RN-006 revisada na DEV-001).

## Impacto da VIS-003, sem schema definitivo

Cada serviço pertence a uma categoria; cada chamado referencia exatamente um serviço. Isso substitui a cardinalidade múltipla anterior. A tabela de categorias, versões de formulários, respostas, snapshots e eventual restrição única de `ticket_services.ticket_id` serão avaliadas na HD-005 e implementadas somente na HD-013. O diagrama expressa a cardinalidade, não uma migration aprovada. A divergência de preços foi resolvida na DEV-001: serviços sem preço/cobrança, preservando snapshots de nomes, categoria e formulário.

## Decisão de projeto

A versão definitiva do esquema e suas migrations dependem do aceite do modelo e das decisões aplicáveis registradas em `13-decisoes-pendentes.md`. A major Prisma 7 já foi aprovada na ADR-10; não é uma decisão ainda aberta.

## DEV-001 — Proposta executável para revisão da HD-005

Prisma 7 foi aprovado na ADR-10. `apps/backend/prisma/schema.prisma` concretiza uma **proposta executável**, sem migration persistente e sem declarar HD-003/004/005/006/013 concluídas. O aceite do modelo ainda é necessário antes de migrar desenvolvimento.

| Modelo             | Estrutura e integridade propostas                                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User               | UUID, três papéis, nome/e-mail, hash, atividade, troca obrigatória e timestamps. Índice adicional em lower(email). Sem cadastro, seed ou autenticação nesta entrega.          |
| ServiceCategory    | Categoria independente, descrição, atividade e ordem; exclusão bloqueada enquanto houver serviços.                                                                            |
| Service            | Uma categoria obrigatória, nome/descrição, atividade, ordem, timestamps, sem preço ou cobrança (RN-006 revisada na DEV-001).                                                  |
| ServiceFormVersion | Versão numerada por serviço; publicação, edição e imutabilidade ainda precisam de homologação.                                                                                |
| ServiceFormField   | ID/chave, tipo, rótulo, obrigatoriedade, ordem, opções e condição; chave única por versão. Não importa definições dos mocks.                                                  |
| Ticket             | serviceId obrigatório/escalar; FK composta garante que formulário e serviço correspondem. Número público inteiro único é proposta de armazenamento, não de apresentação HTTP. |
| TicketAnswer       | Valor JSON tipado, único por chave/chamado; FKs compostas garantem correspondência entre chamado, versão, campo e chave.                                                      |
| TicketEvent        | Ator, tipo, instante e valores anterior/novo, sem credenciais. Abertura e evento na mesma transação.                                                                          |

Nesta proposta física, o snapshot único fica em tickets.service_snapshot, junto à FK escalar, em vez de outra coleção de serviços. Preserva nome/descrição, categoria, versão e definição de campos da abertura. Não reabre a cardinalidade aprovada. Respostas permanecem separadas e ligadas à definição correspondente.

Tipos de campo são base técnica em revisão: texto, texto longo, seleção, múltipla seleção de valores, data/hora, checkbox e anexo reservado. O caso de uso **recusa condições** ainda não homologadas e respostas de arquivo sem módulo autenticado. Não promove TOTVS/Spark/Portal dos mocks a requisitos definitivos.

### Constraints, transações e preservação

- UUIDs PostgreSQL, timestamptz, índices por solicitante/criação, estado/prioridade, responsável/estado e serviço/versão.
- Abertura interna valida solicitante ativo, catálogo ativo, campos e respostas no servidor. Deriva OPEN, prioridade/responsável nulos e snapshot; recusa campos de servidor no payload.
- review-constraints.sql complementa o PSL: OPEN não tem atribuição/início/encerramento; atendimento/pendência exigem responsável, prioridade e primeiro início; encerrado exige data. Identidade do snapshot deve corresponder ao serviço/versão. Não implementa transições, exceções ou recálculo.
- Chamado, respostas e evento usam transação serializável. Classificação/atribuição possuem campos separados; assumir com concorrência continua na tarefa funcional correspondente.
- FKs protegem catálogo/histórico. Cascata de chamados/respostas/eventos do solicitante segue RN-004; exclusão de conta e saneamento de anexos não foram implementados.
- Alteração do catálogo não modifica snapshots anteriores. Não há método/endpoint de alteração do snapshot. Política de publicação/imutabilidade de versões precisa de revisão e futura proteção nas migrations aprovadas.
- Projetos, jornadas, pendências, métricas, anexos e correções retroativas não receberam tabelas antecipadas.

### Gate de persistência

DDL é derivado por prisma migrate diff, sem aplicação em desenvolvimento. test:db confirma o banco efetivo helpdesk_test local, cria namespace exclusivo dentro de transação e força **rollback de DDL e dados**, inclusive do namespace. Não usa migrate dev, db push, reset ou remoção de volumes. O catálogo do desenvolvimento é comparado antes/depois por conexão somente leitura.

Bloqueiam a migration definitiva: aceite de tabelas/relacionamentos/deleções da HD-005 e política de versionamento/condições de formulários. Visibilidade de triagem, poderes administrativos e calendário não são decididos por inferência: bloqueiam seus futuros handlers/cálculos, sem impedir infraestrutura independente. HD-013 permanece parcial porque seu aceite inclui migration local autorizada.

## DEV-002 — Primeira migration do núcleo mínimo

A autorização DEV-002 libera a base fundamental: users, service_categories, services, service_form_versions, service_form_fields, tickets, ticket_answers e ticket_events. Migration `20261026222500_fundacao_nucleo` criada sem aplicação por Prisma migrate diff, revisada e aplicada em helpdesk_dev com migrate deploy por executor restrito ao destino local. Registro/checksum confirmados em _prisma_migrations. Sem seed, dados de teste em desenvolvimento ou campos financeiros.

Mantém FKs/índices e adiciona proteções técnicas para requisitos já aprovados: inserção de chamado apenas OPEN sem classificação/atribuição; snapshot e identidade histórica imutáveis; versão/definições usadas não sofrem alteração, inclusão ou remoção de campos. Alterações posteriores usam outra versão. Locks coordenam uso/edição; abertura interna continua serializável. RN-004 e desativação de catálogo preservadas. Dados de formulário são declarativos; nenhuma expressão é executada.

SQL customizado (quatro checks, índice case-insensitive e três triggers com funções sem privilégios elevados) faz parte da migration canônica. Testes executam esse mesmo arquivo em schema exclusivo de helpdesk_test com rollback integral, inclusive em falhas; estrutura e contagem de dados de desenvolvimento são comparadas antes/depois. Introspecção e Prisma Client confirmam a base real.

O limite anterior da DEV-001 foi superado **somente para este núcleo mínimo**. Permanecem pendentes publicação administrativa/rascunhos, condições definitivas e campos específicos, permissões/contratos, calendários, métricas e projetos. Não há novas tabelas desses módulos ou endpoints sem autenticação. Não editar SQL aplicado: evoluções exigem migration futura revisada. Nenhuma ADR/tarefa global foi concluída automaticamente.
