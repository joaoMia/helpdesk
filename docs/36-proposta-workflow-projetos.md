# Projetos — proposta de contrato funcional para aprovação

**Registro histórico da proposta, aprovada expressamente em 06/11/2026 com refinamentos técnicos.** A implementação vigente e as distinções plano/execução estão no [doc37](37-workflow-projetos.md).

O texto abaixo preserva a proposta apresentada para aprovação. A autorização posterior D1–D8 substituiu a limitação a solicitar/consultar; consulte o doc37 para os contratos efetivamente implementados.

## 1. Base verificada

- Implementado: POST /projects e GET /projects, /projects/:id, /projects/:id/history; título, objetivo e necessidade; identidade da sessão; consulta própria do solicitante e global do ADMIN; paginação/busca PostgreSQL e evento transacional REQUESTED.
- Persistência: ProjectRequest e ProjectRequestEvent; registros imutáveis e referências RESTRICT. REQUESTED hoje é tipo de evento, não estado de um workflow persistido.
- Referências: [contrato vigente](v1-contrato.md), [evolução](35-evolucao-dashboards-projetos.md), decisões de Projetos e progresso em [doc16](16-decisoes-para-proximos-modulos.md), HD-065/066 no [backlog](../planning/backlog.csv).
- O laboratório usa estados e percentuais provisórios. Não é fonte de autorização. A decisão posterior manteve somente solicitação/consulta. Esta proposta substitui aquelas sugestões apenas se aprovada.

## 2. Estados e transições propostos — D1

Estados próprios de Projetos: REQUESTED (Solicitado), PLANNING (Em planejamento), IN_PROGRESS (Em andamento), COMPLETED (Concluído), CANCELED (Cancelado). Não reutilizar o enum dos chamados.

| Origem → destino                | Quem                       | Precondições                                                                                                   |
| ------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| criação → REQUESTED             | Solicitante                | Conta ativa, sessão válida e troca inicial concluída; título, objetivo e necessidade válidos                   |
| REQUESTED → PLANNING            | ADMIN                      | Responsável técnico elegível atribuído; justificativa/resumo de planejamento                                   |
| PLANNING → IN_PROGRESS          | Responsável ou ADMIN       | Plano publicado com ao menos uma etapa e uma atividade em cada etapa; responsável elegível                     |
| IN_PROGRESS → COMPLETED         | Responsável ou ADMIN       | Todas as atividades do plano vigente concluídas, resumo obrigatório da entrega; servidor revalida atomicamente |
| REQUESTED → CANCELED            | Solicitante autor ou ADMIN | Justificativa obrigatória; nenhuma operação de planejamento pode ter vencido a concorrência                    |
| PLANNING/IN_PROGRESS → CANCELED | ADMIN                      | Justificativa obrigatória, auditoria e preservação do progresso anterior                                       |

Não há retorno de estados, reabertura, exclusão física ou conclusão automática por percentual. COMPLETED e CANCELED são terminais. Não exigir aprovação financeira nem validação posterior do solicitante para concluir; essa ausência também precisa de aceite.

## 3. Criação e dados — D2

Preservar os dados atuais: título de 3–160 caracteres; objetivo e necessidade de 10–4000 caracteres. Identificador PR, autor e datas vêm do servidor. Não permitir escolher responsável, estado, percentual ou datas históricas na abertura. Não acrescentar categoria, orçamento, prazo obrigatório, cobrança ou formulário de projeto sem nova decisão.

A solicitação original permanece imutável. Complementos entram como atualizações identificadas, sem sobrescrever o pedido inicial. Criação não gera chamado nem herda SLA, pendência, calendário ou status HD.

## 4. Responsável e visibilidade — D3

Um único responsável por projeto, sempre TECHNICIAN ativo e com troca inicial concluída. ADMIN atribui; ADMIN não vira técnico automaticamente. Atribuir não inicia execução. É possível substituir responsável em estados não terminais, somente por ADMIN, com motivo e auditoria do anterior/novo. A troca preserva o plano e não cria início retroativo. Após substituir, o antigo responsável perde acesso operacional, salvo outro grant explicitamente aprovado no futuro.

| Papel      | Leitura                                                                                      | Escrita proposta                                                                                |
| ---------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| REQUESTER  | Somente solicitações próprias, plano publicado, atividades, progresso e histórico autorizado | Solicitar; cancelar somente próprio REQUESTED; nenhuma edição do plano ou progresso             |
| TECHNICIAN | Somente projetos em que é responsável, incluindo seus terminais para consulta                | Preparar plano, registrar atualização, mudar atividade e iniciar/concluir conforme precondições |
| ADMIN      | Visão global, solicitante e responsável necessários à gestão                                 | Distribuir, gerenciar plano, iniciar/concluir e cancelar; sem herdar função de técnico          |

Plano em rascunho não aparece ao solicitante. Publicação passa a ser visível ao autor. Atualizações publicadas são comuns aos três perfis autorizados; notas privadas internas não fazem parte desta proposta. Não acrescentar e-mails, credenciais ou dados pessoais desnecessários às projeções.

## 5. Plano, etapas e atividades — D4

Plano possui versões. Limites propostos: até 25 etapas e 200 atividades por projeto; títulos de 3–160 caracteres, descrições opcionais de até 2000 caracteres e ordem contígua a partir de 1, única no respectivo nível. Rascunho pode ficar incompleto; publicação exige ao menos uma etapa e uma atividade por etapa. IDs novos são gerados pelo servidor; IDs existentes devem pertencer ao projeto e à versão em edição. A responsabilidade é herdada do responsável único do projeto; múltiplos técnicos/participantes ficam fora deste contrato.

Atividades: TODO, IN_PROGRESS e DONE. Em projeto IN_PROGRESS, responsável ou ADMIN pode avançar ou devolver atividade para retrabalho; sair de DONE exige motivo. Nenhuma alteração é permitida em projeto terminal. As etapas têm situação derivada das atividades, sem status manual contraditório.

Em PLANNING, rascunho permite inserir, remover e reordenar. Ao publicar, validar títulos, ordens únicas, etapa existente, limites de contrato e ausência de referências cruzadas. A versão publicada é imutável. Mudanças posteriores geram nova versão, preservando IDs lógicos e histórico. Após o início, apenas ADMIN publica revisão de escopo, com justificativa; o responsável pode preparar o rascunho. Atividades retiradas permanecem no plano anterior e não são apagadas. Nova publicação deve explicitar eventual redução do percentual; não simular regressão como alteração silenciosa.

## 6. Progresso — D5

Proposta: atividades têm peso igual. Progresso do projeto = floor(100 × atividades DONE / total de atividades do plano publicado vigente). Não calcular média das etapas, pois isso daria peso maior a etapas menores. Progresso da etapa usa a mesma fórmula em seu subconjunto.

Sem plano publicado/atividades, apresentar “Ainda sem plano” e valor nulo, não percentual fictício. Exibir versão do plano e contagens concluídas/total. 100% permite concluir, mas não altera automaticamente o estado. COMPLETED exige todas DONE e resumo de entrega. CANCELED exibe cancelamento; o último percentual fica no histórico e não entra na taxa de conclusão.

Não permitir percentual manual. Não apresentar progresso como produtividade, prazo cumprido, SLA ou aceite do solicitante.

## 7. Atualizações e histórico — D6

Responsável ou ADMIN publica texto de até 4000 caracteres, com ator e instante do servidor. Texto não vazio, tratado como texto, sem HTML executável. Atualização confirmada aparece somente após persistência; falha mantém o rascunho, sem sucesso antecipado. Não permitir edição/exclusão silenciosa: correções são novas entradas referenciando a original.

Auditar criação, atribuição/troca, planejamento, versões publicadas, início, mudanças de atividade, retrabalho, conclusão e cancelamento. Registrar identidade, instante real, estado/valor anterior e novo, revisão e justificativa quando exigida. Eventos e mudanças de estado são atômicos; falha de auditoria implica rollback. Histórico do solicitante não expõe JSON arbitrário ou dados internos.

Não criar chat de projetos, uploads, comentários de múltiplos participantes ou anexos neste workflow mínimo. Essas extensões exigem contrato próprio; não reutilizar anexos de chamados por simples troca de ID.

## 8. Indicadores por perfil — D7

REQUESTER: próprios por estado, últimos pedidos e progresso dos próprios planos publicados. TECHNICIAN: carteira atual atribuída por estado, atividades pendentes e projetos recentes autorizados. ADMIN: solicitações, distribuição por estado/responsável, projetos sem responsável e evolução de criação/conclusão/cancelamento.

Separar projetos e chamados. As consultas aplicam RBAC/ownership no PostgreSQL. Cada indicador declara população e período: contagem por estado atual não equivale a total de conclusões no período. Taxa de conclusão, se exibida, usa COMPLETED / (COMPLETED + CANCELED) com mesma janela de término; mostrar denominador e ausência de amostra, sem trocar divisão por zero por 0%. Não agregar percentuais entre projetos de portes diferentes neste primeiro contrato. Mostrar cada projeto e suas atividades concluídas/total.

Não calcular SLA, custos, horas produtivas ou prazo cumprido de projetos sem regras próprias.

## 9. Concorrência, segurança e contratos — D8

Cada mutação recebe expectedRevision (inteiro positivo) e clientOperationId (UUID). A criação recebe somente clientOperationId, pois ainda não possui revisão. Justificativas têm 3–2000 caracteres. Salvar rascunho também verifica/incrementa a revisão do workflow. A revisão vem da leitura autorizada. Serviço revalida sessão, conta, papel, ownership, estado, responsável e versão do plano dentro da transação. Bloquear a linha do workflow e atualizar condicionalmente pela revisão; incrementar revisão e gravar evento no mesmo commit.

Uma operação concorrente incompatível retorna409, sem retry de escrita automático. Repetição com o mesmo clientOperationId e payload retorna o resultado confirmado; mesmo ID com payload diferente retorna409. Um avanço sem mudança efetiva não duplica eventos. Consulta fora do escopo retorna404; papel sem permissão retorna403; sessão inválida401; payload inválido400.

Payload Zod estrito; timestamps do servidor; CSRF nas escritas; cookies HttpOnly, CORS, rate limits e revogação existentes. A UI apenas apresenta as ações concedidas e não define autoridade. Seleção de responsável não oferece ADMIN, REQUESTER ou técnico inelegível. Revalidar também na conclusão e na publicação de plano.

## 10. Impacto técnico proposto, sem implementação nesta execução

Manter routes → controller → service → repository e contratos compartilhados. Preservar APIs atuais e ampliar suas projeções de maneira explícita. As APIs atuais de solicitação e o histórico REQUESTED permanecem compatíveis. Leitura de workflow e histórico ampliado usa GET /projects/:id/workflow e GET /projects/:id/workflow/history, com projeções tipadas e histórico paginado; campos novos não são injetados silenciosamente em contratos estritos antigos. Novas capacidades propostas: projects.assign (ADMIN), projects.plan (ADMIN/responsável), projects.update (ADMIN/responsável), projects.transition (por transição/ownership), projects.cancel (autor REQUESTED ou ADMIN). Nenhum grant passa a existir pela aprovação de um mock.

Rotas candidatas: POST /projects/:id/assignment, /planning, /start, /complete, /cancel, /updates; GET/PUT /projects/:id/plan-draft; POST /projects/:id/plan-publication; PATCH /projects/:id/activities/:activityId. Confirmar revisão e idempotência nos contratos de escrita. Paginação e filtros em todas as listas; não carregar todos os projetos no cliente.

Banco: migration nova e aditiva para workflow 1:1 com ProjectRequest (estado, responsável, revisão, datas confiáveis), versões/rascunhos de planos, etapas, atividades, atualizações e auditoria do workflow. Restrição única por solicitação, FKs RESTRICT, índices por responsável/estado/data, eventos/versionamentos imutáveis. Definir constraints das transições e limites nos serviços e SQL. Não modificar migrations antigas nem remover o trigger de imutabilidade da solicitação atual.

Pedidos existentes continuam legíveis como REQUESTED sem responsável/plano; criar workflow na primeira ação de gestão, em transação, sem inventar início ou entrega. Histórico unifica o REQUESTED antigo com novos eventos, preservando códigos, datas e autoria. Não regravar o evento inicial nem criar eventos financeiros/sistêmicos fictícios.

Frontend: manter tela de solicitação e consulta; acrescentar estado e progresso rotulados, painel de responsável, plano publicado, editor autorizado de rascunho e histórico. Diálogos para transições, justificativas, conflito e cancelamento; conservar filtros e scroll. Dashboards usam agregações próprias. Preservar componentes, GSAP, ECharts, acessibilidade e reduced motion, sem redesign.

## 11. Critérios de aceite da implementação futura

- Cadeia proposta completa e todos os caminhos proibidos testados, sem status de chamados reutilizados.
- Owner/role verificados em leitura, escrita e agregações; solicitante alheio e técnico não responsável sem acesso.
- Atribuição sem início; troca de responsável auditada e retirada do acesso anterior.
- Plano publicado imutável, rascunho concorrente, revisão de escopo explícita e progresso derivado sem falso100%.
- Conclusão apenas com todas as atividades; cancelamento com motivo e terminais protegidos.
- Idempotência, duas escritas concorrentes,409, evento único e rollback quando auditoria falhar.
- Migration ensaiada em banco isolado, backup verificável e integridade dos registros existentes.
- Interfaces persistidas após F5, estados vazio/erro/carregamento, desktop/mobile, temas e teclado homologados.

## 12. Decisão solicitada

Aprovar, rejeitar ou ajustar D1–D8: estados/transições e conclusão sem validação posterior; campos originais imutáveis; responsável único e matriz de acesso; versionamento do plano/revisão após início; progresso automático por atividades iguais; atualizações públicas aos participantes sem chat/anexos; populações dos indicadores; concorrência/idempotência e evolução aditiva.

A aprovação foi recebida na tarefa de implementação do workflow. Ela não autoriza commit, push, release, deploy ou novas funcionalidades fora do contrato.
