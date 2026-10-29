# DEV-008 / HD-025 — Catálogo real

Implementação autorizada em 28/10/2026, usando ServiceCategory e Service existentes, sem migration ou seed. Catálogo de TI sem preços/cobrança; cada chamado referencia exatamente um serviço. Não há API HTTP de abertura nesta entrega.

## Endpoints e contratos

| Método | Categorias      | Serviços      | Acesso                                                 |
| ------ | --------------- | ------------- | ------------------------------------------------------ |
| GET    | /categories     | /services     | Sessão válida; escopo no PostgreSQL                    |
| GET    | /categories/:id | /services/:id | Mesmo escopo; inexistente/oculto retorna NOT_FOUND/404 |
| POST   | /categories     | /services     | ADMIN                                                  |
| PATCH  | /categories/:id | /services/:id | ADMIN                                                  |

Listas retornam items/total/page/pageSize. Filtros: page (1–100000), pageSize (1–50, padrão 10), search (até 120 caracteres), status (all/active/inactive); serviços também aceitam categoryId. Ordenação displayOrder/name/id e contagem no mesmo snapshot de leitura. Não há DELETE.

Corpos Zod estritos: name (2–120), description (até 2000), isActive e displayOrder (inteiro 0–100000). Serviço exige categoryId UUID. POST tem defaults description vazia, isActive=true e displayOrder=0. PATCH exige ao menos um campo e não aplica defaults aos campos omitidos. Não aceita preços, cobrança, IDs, papéis, formulários ou campos adicionais. Retorno individual usa item. Datas UTC e flags administrativas são retornadas somente a ADMIN; leitores recebem identificação, nome, descrição, ordem e categoria do serviço.

## Segurança e disponibilidade

categories.read e services.read autorizam os três perfis; categories.create/update e services.create/update autorizam somente ADMIN. Reutiliza sessão, atividade, troca inicial, RBAC, CSRF, CORS/origem e Cache-Control no-store. Mutações possuem limite de 60 tentativas/IP/15 minutos por recurso; não é proteção distribuída de produção. Revalida ADMIN e sessão sob locks dentro da transação. Operações administrativas não concedem poderes de técnico.

REQUESTER/TECHNICIAN recebem somente categorias ativas e serviços ativos em categorias ativas, inclusive em detalhes, filtros e totais. Consultar status=inactive não contorna o escopo: retorna lista vazia. ADMIN consulta ambos os estados. Nenhum dado do laboratório é importado.

Desativar categoria não altera as flags individuais dos serviços, não os exclui e não altera chamados. Todos ficam indisponíveis enquanto a categoria estiver inativa. Reativar a categoria volta a disponibilizar somente serviços individualmente ativos. Salvar serviço ativo exige categoria ativa, inclusive na edição; se a categoria estiver inativa, desative o serviço ou reative a categoria antes de salvar. Serviços inativos podem ser cadastrados em categoria inativa, sem disponibilidade para novas solicitações.

Transferência de serviço para categoria existente é permitida somente sem chamados vinculados. Não altera versões de formulário. Edição/desativação não atualiza snapshots de chamados, respostas ou eventos. Transações serializáveis, locks de categorias antes de serviços e locks compartilhados na abertura interna protegem as validações concorrentes; conflito resulta em CATALOG_CONFLICT/409 para atualizar e repetir a operação, sem commit parcial. O caso de uso interno de abertura continua verificando atividade do serviço/categoria e capturando snapshots; ainda não é endpoint autorizado.

## Formulário inicial e limites

POST /services cria serviço e ServiceFormVersion(version=1) na mesma transação, sem ServiceFormField. Abertura interna interpreta fields=[] e answers={} como formulário básico de assunto/descrição, preservando OPEN, prioridade nula e ausência de técnico. Atualizações não recriam a versão nem alteram versões anteriores.

Serviços antigos sem versão válida continuam recusados pela abertura interna; esta entrega não os corrige ou migra automaticamente. Editor de campos, condições, anexos, rascunhos, publicação e migração de respostas permanecem pendentes de aprovação. Formulários personalizados do laboratório não equivalem a configuração persistida. HD-003/005/006/013 não são concluídas por esta entrega.

## Uso e validação

ADMIN acessa **Catálogo de serviços**, #/admin/catalogo. Pode buscar/paginar categorias, criar/editar nome, descrição, ordem e checkbox Ativo; filtrar serviços por categoria, buscar/paginar e criar/editar serviços. Salvar é a confirmação da ativação/desativação. Para escolher categorias em outras páginas no formulário de serviço, localize-as pela busca/paginação de categorias; opções já consultadas permanecem na sessão da página. Não há editor persistente de campos adicionais.

DEV-008.1: a página independente do catálogo é exclusiva de ADMIN. REQUESTER e TECHNICIAN não possuem item no menu ou dashboard; as rotas antigas #/requester/catalogo e #/technician/catalogo redirecionam para o início do perfil autenticado. Os GETs e seus filtros de disponibilidade permanecem inalterados para reutilização futura na seleção de categoria/serviço durante a abertura, ainda não implementada. #/demo/ permanece separado. O catálogo de desenvolvimento não recebe dados iniciais automaticamente: o responsável cadastra pela interface.

Testes usam namespace descartável de helpdesk_test, com identidade/cookies/CSRF reais. Verificam formulário vazio, abertura interna, disponibilidade, autorização, histórico, filtros, transferências e concorrência. Comparação somente leitura dos registros de helpdesk_dev antes/depois protege os dados existentes.

Referências: [requisitos](02-requisitos-e-permissoes.md), [RN-005/006/007](03-regras-de-negocio.md), [autorização](21-autorizacao-backend.md), [ADR-12](20-adr12-autenticacao.md), [modelagem](05-modelagem-de-dados.md). HD-032/033 deverão integrar contratos/autorização da abertura HTTP na sua autorização própria.
