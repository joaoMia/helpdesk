# 16 — Pendências priorizadas para futuras sprints

A estrutura geral foi aprovada para início do M1. **Nenhuma destas pendências bloqueia o scaffold**, mas algumas bloqueiam o módulo indicado. Recomendações abaixo são propostas, não regras automaticamente aprovadas.

## Antes de M2 (contas e segurança)

- **D1 — Sessão JWT:** definir armazenamento, renovação e revogação; proposta: cookies HttpOnly/Secure e proteção CSRF adequada, token de curta duração; documentar fluxos e testes.
- **D2 — Credencial provisória:** exigir troca no primeiro login; determinar se Admin redefine senha e como recuperar contas sem e-mail.
- **D3 — Perfis e visibilidade:** o que cada técnico vê em chamados não atribuídos? Recomendação: ler descrição e anexos necessários à triagem, mas bloquear edição fora das ações de classificação/assunção.

## Antes de M3/M4 (catálogos e chamados)

- **D4 — Campos do chamado:** VIS-003 aprovou serviço único; assunto e descrição após seleção, anexos conforme formulário; conferir os frames reais do Figma antes de fixar formulários.
- **D5 — Serviço versus categoria:** VIS-003 aprovou categorias separadas e exatamente um serviço por chamado. Detalhamento relacional, versões e migração permanecem na HD-005/013.
- **D6 — Resolvida na DEV-001:** serviços sem preço ou cobrança. A RN-006 foi substituída por aprovação explícita; preservar snapshots de nomes, categoria e formulário. Não há adição de serviços pelo técnico, conforme VIS-003.

## Antes de M5/M6 (atendimento e pendências)

- **D7 — Admin e status:** Admin pode classificar e mudar estado, mas `IN_PROGRESS` exige técnico atribuído. Admin não se torna técnico. Definir regras para override com trilha de auditoria.
- **D8 — Reclassificação:** quem pode alterar prioridade depois de atribuída? Proposta: responsável e Admin; qualquer técnico antes da atribuição.
- **D9 — Transferência/reabertura:** recomenda-se deixar ambas fora de v1; arquitetura deve ser extensível, mas não criar telas/endpoints sem aprovação.
- **D10 — Comentário e anexos antes da atribuição:** propostas: solicitante pode enviar; técnicos podem ler para triagem; só responsável/Admin responde. Auto-retomada depende de nova interação confirmada pelo solicitante.

## Antes de M7 (jornadas e tempos)

- **D11 — Calendário:** expediente padrão da empresa antes do primeiro atendimento, jornada do responsável após assumir; revisões históricas via snapshots/segmentos; fuso configurável (primeira implantação: `America/Sao_Paulo`, sob confirmação).
- **D12 — Feriados, férias e exceções:** decidir se configurados na primeira versão; mínimo proposto: dias da semana, pausas e folgas; calendário não assume feriados sem cadastro.
- **D13 — Alterações em jornada:** alteração só afeta instantes futuros e nunca muda indicadores encerrados.
- **D14 — Horários fora da jornada:** ações podem ser registradas; contadores não avançam fora do expediente, conforme regra aprovada.

## Antes de M8 (interface)

- **D15 — Figma:** validar quadros desktop/mobile, tipografia, design tokens e estados dos formulários.
- **D16 — Métricas de produtividade:** técnico `atendidos no mês` deve contar chamados efetivamente encerrados por ele; variações em caso de transferências são projeto futuro.

## Escopo educacional versus empresa

- A Rocketseat pede escolha de técnico pelo cliente e 3 status; nossa personalização os substitui. Documentar a divergência e conferir critérios da entrega quando chegar a hora.
- Exceções empresariais como SLA, notificações e implantação real são melhorias futuras, não parte da etapa de fundação.

## VIS-002 — Propostas visuais em validação

Esta prévia antecipa experiência e navegação, sem homologar novos requisitos de produção, concluir tarefas funcionais ou encerrar a HD-003. Todos os dados são fictícios e permanecem em memória; somente a preferência de tema é armazenada localmente.

- **Catálogo e formulários:** criação de usuário (TOTVS, Spark e Portal Permetal), instalação Windows e problema TOTVS têm definições tipadas no frontend. A seleção de múltiplos sistemas, campos condicionais, obrigatoriedade de anexo TOTVS, formatos e validações ainda precisam de aprovação definitiva. Spark usa somente dados gerais. Não solicitar senhas. Anexos guardam apenas nomes, sem upload.
- **Preços — registro histórico:** a VIS-002 retirou cobrança apenas da prévia. A divergência foi posteriormente resolvida na DEV-001: RN-006 substituída, sem preço/cobrança no modelo real; snapshots de nomes, categoria e formulário preservados.
- **Referência TOTVS:** número externo opcional, distinto do identificador HelpDesk, demonstrativamente editável pelo técnico responsável e visível ao solicitante. Definir formato, possibilidade de alteração após encerramento, permissões e auditoria antes da API. Não há integração real nem mudança automática de status ou pendência.
- **Triagem:** abas Não classificados, Classificados e Todos reorganizam a navegação. Todos combina a fila livre com os próprios atendimentos do técnico, sem ampliar acesso a terceiros enquanto ADR-03/HD-004 estiverem pendentes. Não é autorização real aplicada no cliente.
- **Projetos:** tipos e dados separados de chamados; assunto e descrição obrigatórios na prévia. Estados visuais, visibilidade por perfil, aprovação, responsáveis, histórico e ciclo de vida são provisórios. Não herdar status, SLA, pendências ou transições de chamados por inferência. Ainda não há tarefa funcional específica de projetos no backlog; sua criação requer autorização.
- **Tema:** preferência inicial do sistema e escolha light/dark no localStorage. Avaliar armazenamento por usuário após autenticação real, com comportamento local de fallback.

| Frente                     | Impacto a aprovar posteriormente                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| HD-003                     | Formalização das decisões ainda pendentes de catálogo e projetos; categorias/serviço único e ausência de cobrança já aprovados |
| HD-004                     | Visibilidade, responsáveis e edição da referência externa; ações de projetos                                                   |
| HD-005                     | Respostas por serviço, versões/snapshots de formulários, anexos e entidade de projeto                                          |
| HD-006                     | Contratos e validações definitivas dos serviços, referência externa e projetos                                                 |
| HD-013                     | Configuração Prisma e migrations somente com requisitos/modelos aprovados                                                      |
| HD-025/031/032/037/042/048 | Evolução real de catálogo, formulários, chamados e acompanhamento, sem considerar a prévia como aceite funcional               |

## VIS-003 — Revisão aprovada e propostas em validação

**Aprovado expressamente:** categorias separadas de serviços, cada serviço em uma categoria e exatamente um serviço por chamado. Substitui a seleção múltipla anterior e a adição de outros serviços durante atendimento. Sistemas dentro de um campo (TOTVS/Spark/Portal) não são serviços adicionais; sua cardinalidade definitiva ainda precisa ser confirmada. A HD-003 não está concluída.

- **Catálogo demonstrativo:** seis categorias iniciais; exemplos de serviços não são catálogo homologado. Editor em memória de categorias, serviços e campos básicos, opções, obrigatoriedade e condição baseada em campo anterior. Sem exclusão de histórico: chamados guardam snapshots de categoria, serviço e formulário. Definir versionamento, migração de respostas, autorização na API e limites de anexos antes de produção.
- **Projetos:** sete categorias e propostas com contexto, objetivo, impacto, benefícios, setor, público, prazo de expectativa e campos complementares. Campos, acompanhamento, estados e acesso são provisórios. Não há aprovação automática, SLA ou equivalência com status de chamados. Não enviar credenciais.
- **Dashboards:** contagens derivadas da amostra fictícia da sessão. Tempos A (abertura–encerramento) e B (primeiro início–encerramento) são amostras fixas fictícias apenas de chamados encerrados, sem cálculo de calendário ou SLA. Jornadas, pausas e flags de pendência continuam requisitos da futura API.
- **Visualização:** ECharts modular local, temas, tabela alternativa de dados e limpeza de instâncias. GSAP local para entradas e trocas de contexto com limpeza e preferência de movimento reduzido. Rolagem CSS; ScrollSmoother global não adotado para preservar foco, formulários longos, sticky e tabelas.
- **Impactos:** HD-003/004 para ADRs e autorização; HD-005 para categorias, serviço único, snapshots e projetos; HD-006 para contratos; HD-013 para Prisma/migrations somente após aprovação. HD-025/031/032/037/042/048 permanecem funcionais futuras. HD-032 e HD-040 no backlog ainda descrevem a regra antiga e exigem conciliação específica; o CSV e seu estado não foram alterados nesta prévia.
- **Preço — resolvido na DEV-001:** a ausência de preço/cobrança foi aprovada para o sistema real. A RN-006 financeira foi substituída; não reabrir essa decisão.

Nenhuma simulação conclui HD-003, HD-004, HD-005, HD-006 ou HD-013. Configurações e respostas desaparecem ao recarregar; somente o tema usa localStorage.

## VIS-004 — Experiências demonstrativas e decisões pendentes

Esta revisão autoriza somente a interface e a simulação em memória. Não aprova novas permissões, autenticação, schemas ou regras de métricas. A regra de **um serviço por chamado** e os quatro estados oficiais continuam preservados.

| Proposta em validação             | Demonstração e decisão necessária antes da implementação real                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conclusão efetiva versus registro | A prévia distingue a data efetiva informada da data original de registro. Datas futuras e anteriores ao primeiro início são recusadas; registro retroativo exige justificativa. Definir quem pode informar, limites retroativos, fuso, precisão, exceções, evidências e aprovação. Impacta ADR-09, HD-003/004/005/006/013 e HD-041/053.                                                                                   |
| Solicitação de correção           | Técnico responsável pode demonstrativamente solicitar correção de chamado encerrado. A solicitação guarda datas original, efetiva e solicitada, ator, data da solicitação e justificativa. Não altera datas nem aprova a correção, reabre atendimento ou recalcula indicadores. Decidir aprovação administrativa, recusas, cancelamento, múltiplas solicitações e trilha auditável antes de produção.                     |
| Métricas e histórico              | Correções podem afetar A/B, relatórios e eventual SLA futuro. Definir política de revisão/versionamento dos snapshots e recálculo transacional no backend, preservando versões originais. Nenhum cálculo definitivo foi acrescentado ao frontend.                                                                                                                                                                         |
| Progresso de projetos             | Percentual manual de 0 a 100 com observação, data e responsável na amostra. Atualização aparece somente no contexto administrativo demonstrativo; autorização definitiva depende de HD-004. Percentual é independente do estado de aprovação. Definir se o cálculo virá de entregas/marcos ponderados, como tratar regressões e o que constitui conclusão.                                                                |
| Estimativa agregada de projetos   | Gauge usa média simples dos percentuais fictícios, explicitamente estimativa sem ponderação por porte. Projeto com 100% é contado como percentual completo na amostra; não significa aprovação, prazo ou aceite formal. Definir critérios de agregação e projetos elegíveis.                                                                                                                                              |
| Login e erros                     | Tela isolada em `#/login`, sem endpoint, sessão, token, comparação de credenciais ou armazenamento. Campo de senha fictícia é limpo após tentativa. Erros específicos são escolhidos manualmente no laboratório de estados e não consultam contas. Autenticação real deverá responder genericamente a usuário inexistente/senha inválida, além das medidas da ADR-12 e HD-017/018.                                        |
| Usuários e técnicos               | Listar/criar/editar/ativar em memória, com setores, perfil visual e jornada do técnico. Não cria conta real nem concede acesso. Técnico novo sinaliza troca obrigatória no primeiro acesso; nenhuma senha provisória é gerada. Homologar administração de perfis, desativação, impacto em atendimentos e provisionamento seguro nas HD-004/016/021/024.                                                                   |
| Dashboards e filtros              | Gráficos reutilizáveis mantêm a instância ao atualizar tipo/dados. Série temporal combina aberturas, encerramentos e média móvel descritiva, sem previsão ou atualização artificial. Períodos da amostra usam meses UTC, explicitamente demonstrativos; produção continua dependendo do fuso e agregações autorizadas da API. Status atual por coorte de abertura não se confunde com encerramentos por data de registro. |
| Movimento e feedback              | GSAP local para cartões, números, gráficos, etapas, painéis, toasts e diálogos; ScrollTrigger localizado, sem ScrollSmoother global. Preferência do SO e redução adicional em memória são respeitadas. Mensagem de sucesso exige mudança efetivamente aplicada à amostra. Isso não substitui confirmação, transação ou autorização no backend.                                                                            |

As tarefas funcionais HD-003/004/005/006/013/017/018/021/024/042/053/055–060 não foram marcadas como concluídas. Projetos continuam sem tarefa funcional definitiva no backlog. Auditoria de UI e propostas adicionais: [19-vis004-auditoria-ui.md](19-vis004-auditoria-ui.md).
