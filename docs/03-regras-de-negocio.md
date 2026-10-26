# 03 — Regras de negócio oficiais e propostas

**RN-DEV-001:** a raiz do projeto no computador do responsável é a pasta `helpdesk`, filha direta da pasta `dev` já existente. Ferramentas e agentes não podem alterar projetos irmãos. Esta regra é de organização, não de domínio de negócio.

## Contas e serviços

- **RN-001**: Todos os usuários se autenticam para acessar áreas protegidas; Solicitante pode registrar conta; admin inicial criado via seed seguro.
- **RN-002**: Admin cadastra técnico com senha provisória, armazenada somente como hash; técnico é obrigado a substituí-la após login inicial.
- **RN-003**: Na v1 não há exclusão de técnico; sua conta pode ser desativada caso aprovado. Técnico edita dados do próprio perfil e avatar.
- **RN-004**: Solicitante edita/exclui exclusivamente sua conta. Admin edita/exclui solicitante. Exclusão remove também chamados, itens, comentários, anexos e eventos do solicitante conforme obrigação original; arquivos físicos devem ser saneados.
- **RN-005**: Apenas admin cadastra/edita/desativa serviços. Serviço inativo não é selecionável em nova abertura e permanece histórico.
- **RN-006** (substituída por aprovação explícita na DEV-001, 26/10/2026): Serviços de TI não têm preço nem cobrança. Cada chamado preserva snapshots dos nomes, categoria e formulário do serviço no momento da abertura. Alterar o catálogo não modifica as informações históricas. A regra financeira anterior está revogada.

## Abertura, triagem e atendimento

- **RN-007**: Solicitante abre chamado com assunto, descrição e exatamente um serviço ativo, selecionado dentro de uma categoria (VIS-003; substitui a seleção múltipla anterior). Não seleciona técnico nem reserva horário.
- **RN-008**: Novo chamado recebe status `OPEN`, prioridade `NULL`, responsável `NULL`, e entra em **Não classificados**.
- **RN-009**: Técnico pode marcar prioridade `LOW`, `MEDIUM` ou `HIGH` sem se tornar responsável. Registrar ator/data e manter trilha de alterações.
- **RN-010**: **Classificados** é um agrupamento por prioridade definida, não um status. Pode incluir aberto/em atendimento/pendente/encerrado, segundo filtros. Visão operacional padrão: classificados abertos e ainda não atribuídos.
- **RN-011**: Iniciar atendimento exige classificação e estado `OPEN`, atribui o técnico à vaga livre e muda para `IN_PROGRESS` numa única transação, impedindo atribuição concorrente.
- **RN-012**: Técnico responsável vê e edita os chamados sob sua responsabilidade; não pode acrescentar outro serviço ao chamado, conforme a cardinalidade única aprovada na VIS-003. Necessidades de outro serviço exigem outro chamado. Solicitante não modifica dados estruturais de chamado criado.
- **RN-013**: Estados oficiais: `OPEN`, `IN_PROGRESS`, `PENDING`, `CLOSED`. Fluxo padrão OPEN->IN_PROGRESS->(PENDING<->IN_PROGRESS)->CLOSED. Admin pode alterar status com mesmas invariantes; exceções e reabertura dependem de decisão.
- **RN-014**: Encerrado bloqueia alterações em serviços, prioridade, comentários e anexos por padrão; apenas leitura.

## Pendência e interações

- **RN-015**: Motivo de pendência define `counts_toward_solution` e `auto_resume_on_requester_activity` e pode ser desativado sem alterar chamados anteriores.
- **RN-016**: Alterar de `IN_PROGRESS` para `PENDING` exige motivo ativo e justificativa. Só pode existir uma pendência ativa por chamado.
- **RN-017**: Registrar no período a configuração do motivo no início (snapshot). Mudanças do cadastro não alteram comportamento e métricas passados.
- **RN-018**: Se motivo permite retorno automático, comentário ou anexo **novo e confirmado pelo solicitante** encerra pendência e muda para `IN_PROGRESS`, atomicamente e com histórico.
- **RN-019**: Para motivos sem retorno automático, interação do solicitante não muda status. Comentário de técnico não provoca retomada automática.

## Expedientes e métricas

- **RN-020**: Admin configura jornadas padrão e personalizadas com intervalos por dia da semana, incluindo almoço, pausas e dias sem expediente. Intervalos não podem se sobrepor.
- **RN-021**: Antes da primeira atribuição, usar expediente padrão da empresa. Após início, usar jornada do técnico responsável, com versionamento histórico. Transferência está fora da v1 até decisão.
- **RN-022**: Contar apenas interseção do intervalo considerado com períodos de expediente; horário extra, almoço, pausas e dias não trabalhados não contam.
- **RN-023**: Se pendência tiver `counts_toward_solution=false`, subtrair período pendente **dentro** do expediente; se true, continuar contagem útil.
- **RN-024**: Métrica A: desde `ticket.created_at` até fechamento ou instante atual, apenas tempo útil. Inclui espera em filas.
- **RN-025**: Métrica B: desde `ticket.first_started_at` até fechamento ou instante atual, apenas tempo útil; `NULL` se jamais iniciado.
- **RN-026**: Encerramento congela totais e referências às jornadas e eventos que geraram cálculos. Datas/hora armazenadas em UTC; horários de calendário interpretados no fuso configurado (proposta `America/Sao_Paulo`).

## Dashboards

- **RN-027**: Indicadores de solicitante restritos aos chamados de sua autoria; técnico restrito aos atribuídos/historicamente encerrados por ele, com cartão separado da fila global para triagem; admin pode filtrar dados globais.
- **RN-028**: 'Criados no mês' = chamados com criação no período, independentemente do status atual. 'Encerrados no mês' = `closed_at` no período. 'Atendidos no mês' para técnico = encerrados por ele no período, salvo revisão.
- **RN-029**: Dashboard nunca decide privilégios: cálculos e agregações filtrados no backend pelo usuário autenticado.

## Sementes educacionais (seed)

- Uma conta admin inicial, com credencial segura parametrizada no ambiente de desenvolvimento.
- Três contas de técnicos com jornadas configuráveis. Para compatibilidade do desafio, seeds demonstrativas podem reproduzir: T1 08–12/14–18, T2 10–14/16–20, T3 12–16/18–22.
- Ao menos cinco serviços de exemplo, sem preço ou cobrança e sem dados sensíveis reais; somente quando a tarefa de seed for autorizada.
