# 06 — Contratos REST preliminares

## DEV-003 — Autenticação real disponível

As rotas abaixo estão implementadas em `/auth`, sem o prefixo preliminar `/api/v1`. O frontend local usa `/api/auth` pelo proxy Vite. Corpos/saídas são contratos Zod em packages/contracts; nada autoriza endpoints dos módulos de negócio seguintes.

| Método/rota                 | Entrada e comportamento                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| GET /auth/csrf              | Fornece token anti-CSRF e contexto em cookie; não é credencial de sessão                                            |
| POST /auth/register         | name, email, password; somente REQUESTER; 201 com user público, 400 inválido, 409 conflito genérico                 |
| POST /auth/login            | email/password reais; 200 com user público e cookies; 401 genérico para credenciais/conta indisponíveis             |
| POST /auth/refresh          | Cookies + CSRF; rotação, mesmo prazo absoluto da sessão; 401 para token inválido/expirado/reutilizado               |
| POST /auth/logout           | Revoga sessão e limpa cookies; 204; não apenas remoção visual                                                       |
| GET /auth/me                | JWT e sessão/usuário vigentes; user público ou 401                                                                  |
| PATCH /auth/change-password | currentPassword/newPassword; senha atual obrigatória, revoga todas as sessões e responde 204; novo login necessário |

User público: id, name, email, role e mustChangePassword. Não retorna hash, JWT ou refresh em JSON. POST/PATCH exigem Origin permitida, cookies e X-CSRF-Token; 403 em violação e 429 em excesso. Login não cria permissões de negócio; middleware padrão bloqueia uso comum até troca de senha inicial. Detalhes em [ADR-12](20-adr12-autenticacao.md). Sem verificação ou recuperação por e-mail implementadas.

## Contratos preliminares dos demais módulos

DEV-006: `GET /users/me` e `PATCH /users/me` estão implementados sem `/api/v1`, com proxy frontend `/api/users/me`. GET retorna apenas a identidade pública própria. PATCH aceita REQUESTER e TECHNICIAN (extensão DEV-007 / HD-021) e aceita somente name/email/currentPassword; mudança efetiva do e-mail exige senha e revoga todas as sessões. Detalhes, erros e limites no [perfil real](23-perfil-solicitante.md). A alteração não comprova propriedade do endereço.

Prefixo sugerido `/api/v1`. JSON com paginação, filtros, erros padronizados (`code`, `message`, `details`, `requestId`); timestamps ISO-8601 UTC e enums públicos documentados. Sem campos de preço/cobrança (RN-006 revisada na DEV-001).

| Método       | Rota                       | Quem pode                             | Observações                                                       |
| ------------ | -------------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| POST         | `/auth/register`           | Público                               | somente novo solicitante                                          |
| POST         | `/auth/login`              | Público                               | JWT; política de sessão segura a definir                          |
| POST         | `/auth/logout`             | Autenticado                           | conforme mecanismo de sessão                                      |
| PATCH        | `/auth/change-password`    | Autenticado                           | primeiro login e alterações                                       |
| GET/PATCH    | `/users/me`                | Autenticado                           | próprios dados; validação por papel                               |
| POST         | `/users/me/avatar`         | Técnico/Solicitante                   | upload validado                                                   |
| GET/POST     | `/technicians`             | Admin                                 | lista e criação                                                   |
| GET/PATCH    | `/technicians/:id`         | Admin                                 | incluir associação à jornada                                      |
| GET          | `/requesters`              | Admin                                 | clientes                                                          |
| PATCH/DELETE | `/requesters/:id`          | Admin                                 | exclusão cascata                                                  |
| DELETE       | `/users/me`                | Solicitante                           | remove própria conta e dados conforme RN                          |
| GET/POST     | `/services`                | GET autenticado; POST Admin           | catálogo filtrável                                                |
| PATCH        | `/services/:id`            | Admin                                 | descrição/ativo/formulário                                        |
| GET/POST     | `/pending-reasons`         | GET autenticado; POST Admin           | motivos                                                           |
| PATCH        | `/pending-reasons/:id`     | Admin                                 | regras, ativo/inativo                                             |
| GET/POST     | `/schedules`               | Admin                                 | empresa e personalizado                                           |
| GET/PATCH    | `/schedules/:id`           | Admin                                 | versionar alteração                                               |
| GET/POST     | `/tickets`                 | Papel conforme escopo                 | abrir sem técnico; GET com filtros                                |
| GET          | `/tickets/:id`             | Autorizado por objeto                 | limitar dados de triagem geral                                    |
| PATCH        | `/tickets/:id/priority`    | Técnico/Admin                         | classificação sem assumir                                         |
| POST         | `/tickets/:id/start`       | Técnico                               | atribuição atômica + mudança de status                            |
| —            | `/tickets/:id/services`    | Não se aplica                         | proposta de adição retirada pela regra de serviço único (VIS-003) |
| POST         | `/tickets/:id/pending`     | Técnico responsável (Admin sob regra) | exige motivo e justificativa                                      |
| POST         | `/tickets/:id/resume`      | Técnico responsável/Admin             | pendente -> em atendimento                                        |
| POST         | `/tickets/:id/close`       | Técnico responsável/Admin             | finaliza tempos                                                   |
| GET/POST     | `/tickets/:id/comments`    | Autorizado por objeto                 | atividade do solicitante pode retomar                             |
| POST         | `/tickets/:id/attachments` | Autorizado por objeto                 | upload confirmado pode retomar                                    |
| GET          | `/tickets/:id/history`     | Autorizado por objeto                 | histórico de eventos                                              |
| GET          | `/tickets/:id/metrics`     | Autorizado por objeto                 | tempos úteis atuais/finais                                        |
| GET          | `/dashboards/requester`    | Solicitante                           | somente próprios chamados                                         |
| GET          | `/dashboards/technician`   | Técnico                               | desempenho individual + visão fila                                |
| GET          | `/dashboards/admin`        | Admin                                 | agregações gerais com filtros                                     |

## Abertura de chamado — exemplo de formato, não implementação

```json
{
  "subject": "Falha de impressão",
  "description": "A impressora não responde ao enviar documentos.",
  "serviceId": "<uuid-do-servico>"
}
```

Retorno esperado: identificador, número público, status `OPEN`, prioridade `null`, `assignedTechnicianId: null`, snapshot do serviço (nomes, categoria e formulário; sem cobrança) e timestamps.

A revisão VIS-003 substitui `serviceIds[]` por uma referência única no exemplo preliminar. Categoria é usada para navegar no catálogo; o serviço determina a categoria. Contratos de campos, categorias e versões ainda serão formalizados na HD-006; nenhum endpoint foi criado nesta prévia.

## Operação crítica de classificação e atribuição

- Classificar não popula `assignedTechnicianId` e não altera `OPEN`.
- `POST /tickets/:id/start` valida ticket classificado, ainda livre e OPEN; atualiza responsável e status em transação com controle concorrente; conflito deve retornar `409`.
- Comentário/anexo e retomada automática precisam ser transacionais no nível de estado da aplicação, evitando dois eventos de retomada pela mesma interação.

**Atenção:** endpoints e nomes são propostas de contrato. Formalizar com OpenAPI antes de codificar, especialmente autenticação, uploads, visibilidade de filas e retorno de erros.

## DEV-001 — Contratos internos, sem rotas funcionais expostas

packages/contracts é workspace ESM compilado com Zod 4 e tipos derivados. Contém papéis/status/prioridades oficiais, UUIDs, definições técnicas de campos, entrada interna de abertura e snapshot/saída. Não depende de Prisma, não exporta hashes/credenciais e não foi conectado ao frontend demonstrativo.

Formato interno em revisão da HD-006, **não uma rota HTTP liberada**:

```json
{
  "subject": "Solicitação",
  "description": "Contexto da necessidade",
  "serviceId": "<uuid-do-servico>",
  "answers": { "<chave-do-campo>": "<resposta>" }
}
```

- serviceId é escalar. serviceIds, estado, prioridade, técnico, solicitante, perfil e snapshot enviados pelo cliente são recusados. Identidade deverá vir da autenticação real futura.
- Backend confere solicitante ativo, categoria/serviço ativos, versão/definição dos campos e respostas. Snapshot é construído no servidor, sem importar regras dos mocks.
- Condições pendentes resultam em FORM_RULES_PENDING; respostas de arquivo dependem do upload autenticado (UPLOAD_PENDING). Não ignorar regras ou emitir falso sucesso.
- Sem supervisão administrativa, classificação, assumir, pendência, encerramento ou recálculo implementados. Não criar routes/controllers vazios nem liberar escrita sem autenticação.
- API continua com /health e 404 para rotas ausentes, inclusive login e escrita de chamados. O seletor demonstrativo não é autenticação.

Erros HTTP existentes recebem error.code, error.message, error.requestId e header X-Request-Id gerado no servidor. JSON inválido: 400; corpo acima do limite existente: 413; rota ausente: 404; falhas internas: mensagem genérica. Erros de persistência são mapeados sem expor SQL, parâmetros ou mensagens do driver. Códigos das futuras rotas e OpenAPI definitivo ainda dependem da HD-006.

A [modelagem](05-modelagem-de-dados.md) registra a primeira migration mínima autorizada na DEV-002 e os pontos ainda pendentes. A criação das tabelas não libera estes endpoints. HD-003/004/006 permanecem pendentes de aprovação; telas demonstrativas não são aceite funcional.

DEV-007 / HD-021: GET /technicians, GET /technicians/:id, POST /technicians e PATCH /technicians/:id implementados, exclusivos de ADMIN. Contratos estritos, paginação, credencial provisória única e limites no [procedimento de gestão de técnicos](24-gestao-tecnicos.md).
