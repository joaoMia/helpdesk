# 06 — Contratos REST preliminares

Prefixo sugerido `/api/v1`. JSON com paginação, filtros, erros padronizados (`code`, `message`, `details`, `requestId`); timestamps ISO-8601 UTC, valores monetários em centavos, enums públicos documentados.

| Método | Rota | Quem pode | Observações |
|---|---|---|---|
| POST | `/auth/register` | Público | somente novo solicitante |
| POST | `/auth/login` | Público | JWT; política de sessão segura a definir |
| POST | `/auth/logout` | Autenticado | conforme mecanismo de sessão |
| PATCH | `/auth/change-password` | Autenticado | primeiro login e alterações |
| GET/PATCH | `/users/me` | Autenticado | próprios dados; validação por papel |
| POST | `/users/me/avatar` | Técnico/Solicitante | upload validado |
| GET/POST | `/technicians` | Admin | lista e criação |
| GET/PATCH | `/technicians/:id` | Admin | incluir associação à jornada |
| GET | `/requesters` | Admin | clientes |
| PATCH/DELETE | `/requesters/:id` | Admin | exclusão cascata |
| DELETE | `/users/me` | Solicitante | remove própria conta e dados conforme RN |
| GET/POST | `/services` | GET autenticado; POST Admin | catálogo filtrável |
| PATCH | `/services/:id` | Admin | preço/descrição/ativo |
| GET/POST | `/pending-reasons` | GET autenticado; POST Admin | motivos |
| PATCH | `/pending-reasons/:id` | Admin | regras, ativo/inativo |
| GET/POST | `/schedules` | Admin | empresa e personalizado |
| GET/PATCH | `/schedules/:id` | Admin | versionar alteração |
| GET/POST | `/tickets` | Papel conforme escopo | abrir sem técnico; GET com filtros |
| GET | `/tickets/:id` | Autorizado por objeto | limitar dados de triagem geral |
| PATCH | `/tickets/:id/priority` | Técnico/Admin | classificação sem assumir |
| POST | `/tickets/:id/start` | Técnico | atribuição atômica + mudança de status |
| POST | `/tickets/:id/services` | Técnico responsável | apenas durante atendimento |
| POST | `/tickets/:id/pending` | Técnico responsável (Admin sob regra) | exige motivo e justificativa |
| POST | `/tickets/:id/resume` | Técnico responsável/Admin | pendente -> em atendimento |
| POST | `/tickets/:id/close` | Técnico responsável/Admin | finaliza tempos |
| GET/POST | `/tickets/:id/comments` | Autorizado por objeto | atividade do solicitante pode retomar |
| POST | `/tickets/:id/attachments` | Autorizado por objeto | upload confirmado pode retomar |
| GET | `/tickets/:id/history` | Autorizado por objeto | histórico de eventos |
| GET | `/tickets/:id/metrics` | Autorizado por objeto | tempos úteis atuais/finais |
| GET | `/dashboards/requester` | Solicitante | somente próprios chamados |
| GET | `/dashboards/technician` | Técnico | desempenho individual + visão fila |
| GET | `/dashboards/admin` | Admin | agregações gerais com filtros |

## Abertura de chamado — exemplo de formato, não implementação
```json
{
  "subject": "Falha de impressão",
  "description": "A impressora não responde ao enviar documentos.",
  "serviceIds": ["<uuid-do-servico>"]
}
```
Retorno esperado: identificador, número público, status `OPEN`, prioridade `null`, `assignedTechnicianId: null`, itens com preços congelados e timestamps.

## Operação crítica de classificação e atribuição
- Classificar não popula `assignedTechnicianId` e não altera `OPEN`.
- `POST /tickets/:id/start` valida ticket classificado, ainda livre e OPEN; atualiza responsável e status em transação com controle concorrente; conflito deve retornar `409`.
- Comentário/anexo e retomada automática precisam ser transacionais no nível de estado da aplicação, evitando dois eventos de retomada pela mesma interação.

**Atenção:** endpoints e nomes são propostas de contrato. Formalizar com OpenAPI antes de codificar, especialmente autenticação, uploads, visibilidade de filas e retorno de erros.
