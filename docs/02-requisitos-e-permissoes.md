# 02 — Requisitos e matriz de autorização

## Requisitos funcionais rastreáveis

| Código     | Requisito                                                                                                           | Papel                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| RF-AUTH-01 | Login JWT, logout, troca de senha e proteção de rotas                                                               | Todos                                 |
| RF-AUTH-02 | Senha provisória para técnico, troca obrigatória no primeiro acesso                                                 | Admin/Técnico                         |
| RF-USR-01  | Cadastro, listagem e edição de técnicos; sem exclusão na v1                                                         | Admin                                 |
| RF-USR-02  | Auto-cadastro e edição/exclusão da própria conta                                                                    | Solicitante                           |
| RF-USR-03  | Edição e exclusão de solicitantes com cascata de chamados                                                           | Admin                                 |
| RF-USR-04  | Avatar de técnico e solicitante; validação de upload                                                                | Próprio usuário                       |
| RF-SRV-01  | Criar, listar, editar, desativar serviços; preservar histórico de ticket                                            | Admin                                 |
| RF-TCK-01  | Abrir chamado com assunto, descrição e exatamente um serviço ativo selecionado dentro de uma categoria, sem técnico | Solicitante                           |
| RF-TCK-02  | Consultar histórico e detalhes de chamados próprios                                                                 | Solicitante                           |
| RF-TCK-03  | Visualizar filas de triagem por prioridade definida ou nula                                                         | Técnico/Admin                         |
| RF-TCK-04  | Classificar Baixa/Média/Alta sem assumir chamado                                                                    | Técnico (Admin como exceção proposta) |
| RF-TCK-05  | Assumir e iniciar atendimento em operação atômica                                                                   | Técnico                               |
| RF-TCK-06  | Substituído na VIS-003: não adicionar outros serviços; um chamado referencia exatamente um serviço                  | Não se aplica                         |
| RF-TCK-07  | Alterar status respeitando transições e autorização                                                                 | Técnico/Admin                         |
| RF-PEN-01  | CRUD e desativação de motivos de pendência                                                                          | Admin                                 |
| RF-PEN-02  | Pendência com política de contagem e retorno automático                                                             | Sistema/Técnico                       |
| RF-COM-01  | Comentários/anexos auditados, inclusive acionamento automático                                                      | Solicitante/Técnico/Admin             |
| RF-HOR-01  | Calendário padrão ou personalizado por técnico e por dia                                                            | Admin                                 |
| RF-MET-01  | Calcular tempo útil total e após início do atendimento                                                              | Sistema                               |
| RF-DASH-01 | Dashboard do solicitante com visão somente própria                                                                  | Solicitante                           |
| RF-DASH-02 | Dashboard do técnico com atribuições e fila de triagem                                                              | Técnico                               |
| RF-DASH-03 | Dashboard global e filtros gerenciais                                                                               | Admin                                 |
| RF-AUD-01  | Histórico de classificação, responsáveis, status, pendências e serviços                                             | Sistema                               |

## Matriz de acesso

| Ação                                   | Solicitante   | Técnico                               | Admin                        |
| -------------------------------------- | ------------- | ------------------------------------- | ---------------------------- |
| Criar chamado                          | Próprio       | Não                                   | Não previsto na v1           |
| Listar chamados                        | Próprios      | Atribuídos + filas de triagem         | Todos                        |
| Classificar prioridade                 | Não           | Sim, sem atribuir                     | Sim (proposta de supervisão) |
| Iniciar/assumir                        | Não           | Sim, chamado livre e classificado     | Sob decisão                  |
| Comentar/anexar                        | Próprio       | Atribuído                             | Todos                        |
| Criar/alterar pendência                | Não           | Chamado atribuído                     | Supervisão (proposta)        |
| Alterar status                         | Não           | Atribuído                             | Sim, respeitando regras      |
| Adicionar outro serviço a chamado      | Não           | Não (regra de serviço único, VIS-003) | Não                          |
| Cadastrar/editar técnicos              | Não           | Próprio perfil                        | Sim                          |
| Excluir técnico                        | Não           | Não                                   | Não na v1                    |
| Cadastrar/editar/desativar serviços    | Não           | Não                                   | Sim                          |
| Cadastrar/editar motivos e expedientes | Não           | Não                                   | Sim                          |
| Excluir cliente e seus chamados        | Próprio       | Não                                   | Sim                          |
| Dashboards                             | Seus chamados | Próprios + resumo da fila             | Organização inteira          |

**Regra de segurança:** validar papel **e vínculo com o recurso** na API. Exibir botão apenas na interface nunca concede permissão. Por decisão de privacidade, detalhes completos de chamados não atribuídos não ficam automaticamente acessíveis a todo técnico: permitir leitura mínima para triagem; ampliar conforme decisão explícita.

## Revisão aprovada na VIS-003

Categorias e serviços são conceitos distintos; cada serviço pertence a uma categoria. A cardinalidade de exatamente um serviço substitui a regra anterior de múltiplos serviços, inclusive adição durante atendimento. Duas necessidades de serviços distintos exigem dois chamados. Sistemas selecionados dentro de um formulário não representam serviços adicionais. A modelagem, versionamento de formulários e contratos definitivos permanecem nas HD-003/005/006/013; a interface administrativa é demonstrativa, sem ampliar permissões reais.
