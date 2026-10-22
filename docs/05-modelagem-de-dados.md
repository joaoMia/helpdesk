# 05 — Modelo relacional proposto (conceitual)

| Tabela | Campos centrais | Regras e índices |
|---|---|---|
| `users` | id UUID, role, name, email, password_hash, must_change_password, is_active, avatar_key, created_at, updated_at | email único case-insensitive; hash seguro |
| `technician_settings` | user_id, schedule_version_id | técnico usa calendário padrão ou personalizado |
| `work_schedules` | id, name, kind=COMPANY/PERSONALIZED, active_version | empresa e calendários por técnico |
| `work_schedule_versions` | id, schedule_id, version, timezone, valid_from, created_at | preservar parâmetros usados historicamente |
| `work_schedule_intervals` | id, schedule_version_id, weekday, starts_local, ends_local | vários intervalos por dia; sem sobreposição |
| `work_schedule_exceptions` | id, schedule_version_id, date, intervals_override, reason | proposta: feriados/folgas, habilitação faseada |
| `services` | id, name, description, price_cents, active, created_at, updated_at | desativação sem apagar histórico |
| `tickets` | id, code, requester_id, assigned_technician_id NULL, subject, description, status, priority NULL, created_at, classified_at, first_started_at NULL, closed_at NULL, closed_by NULL | índices em status, prioridade, atribuído, criação; code único |
| `ticket_services` | id, ticket_id, service_id, service_name_snapshot, unit_price_cents, quantity, added_by, added_at, source | preservar valor; ao menos 1 no create |
| `pending_reasons` | id, name, counts_toward_solution, auto_resume_on_requester_activity, active | catálogo administrável |
| `ticket_pending_periods` | id, ticket_id, reason_id, reason_name_snapshot, counts_snapshot, auto_resume_snapshot, started_by, started_at, ended_at NULL, explanation | uma pendência ativa por chamado |
| `ticket_comments` | id, ticket_id, author_id, body, created_at, edited_at NULL | autoria e ordenação |
| `ticket_attachments` | id, ticket_id, uploader_id, comment_id NULL, storage_key, original_name, mime, size_bytes, created_at | armazenamento protegido, sem URLs públicas |
| `ticket_events` | id, ticket_id, actor_id NULL, event_type, old_value_json, new_value_json, created_at | auditoria legível, sem segredos |
| `ticket_schedule_segments` | id, ticket_id, start_at, end_at, schedule_version_id | registrar qual jornada é válida por trecho |
| `ticket_metrics` | ticket_id, total_work_minutes, attendance_work_minutes NULL, calculated_at, finalized_at NULL | snapshot do cálculo; sem cronômetro no browser |

## Relacionamentos principais
- User REQUESTER 1:N Ticket; User TECHNICIAN 1:N Ticket atribuído.
- Ticket 1:N TicketService, TicketComment, TicketAttachment, TicketEvent e TicketPendingPeriod.
- Service 1:N TicketService; valores/nome permanecem em snapshot.
- PendingReason 1:N TicketPendingPeriod; regra armazenada no período.
- WorkSchedule 1:N WorkScheduleVersion 1:N WorkScheduleInterval.
- Ticket N:1 WorkScheduleVersion por intervalo de contexto (`ticket_schedule_segments`).

## Invariantes e exclusão
- `priority=NULL` até classificação. `assigned_technician_id=NULL` até assumir.
- `status=IN_PROGRESS` ou `PENDING` exige responsável. `CLOSED` exige `closed_at`.
- Há somente um período de pendência aberto por chamado; proteger por índice parcial/transação.
- Cliente excluído implica exclusão de todos seus chamados e conteúdos relacionados (regra original), em operação segura; cuidado com LGPD e trilhas de auditoria empresariais.
- Técnico e Serviço não são excluídos fisicamente na v1.
- Guardar datas instantes em UTC com timezone do calendário; dinheiro em centavos inteiros BRL.
- Campo de preço histórico não deve ser recalculado ao editar catálogo.

## Decisão de projeto
A versão definitiva do esquema/Prisma será criada somente depois das decisões registradas no arquivo `13-decisoes-pendentes.md` e da escolha da major do Prisma.
