# 13 — Registro de decisões a validar (ADRs em aberto)

As decisões abaixo permanecem propostas e devem ser confirmadas antes do módulo correspondente, exceto a ADR-10, aprovada especificamente para a fundação técnica, e a decisão de cardinalidade/categorias da ADR-01 explicitamente aprovada na VIS-003. Sua aprovação não encerra a HD-003 nem aprova os outros ADRs.

| ID     | Prioridade | Decisão                                                                    | Proposta padrão                                                                                                                                                       |
| ------ | ---------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-01 | Alta       | O solicitante escolhe serviço ou categoria separada?                       | VIS-003 aprovada: categorias separadas, cada serviço em uma categoria e exatamente um serviço por chamado; detalhamento de schema ainda pendente                      |
| ADR-02 | Alta       | Campos exatos da abertura                                                  | Assunto, descrição e serviço único; campos configuráveis e requisitos por serviço ainda em validação                                                                  |
| ADR-03 | Alta       | Visibilidade de chamados não atribuídos por técnicos                       | Metadados suficientes para triagem, detalhes completos apenas após atribuição                                                                                         |
| ADR-04 | Alta       | Reabertura de chamados encerrados                                          | Não permitir na v1                                                                                                                                                    |
| ADR-05 | Alta       | Transferência de técnico                                                   | Não implementar na v1, manter modelo extensível                                                                                                                       |
| ADR-06 | Alta       | Configuração do expediente antes de haver técnico e mudanças em tempo real | Padrão da empresa até 1ª atribuição; versão do técnico depois; snapshots                                                                                              |
| ADR-07 | Alta       | Admin pode classificar/iniciar/chamar pendência?                           | Classificar e editar status sob mesmas invariantes; 'assumir' somente técnico                                                                                         |
| ADR-08 | Alta       | Calendário de feriados e exceções                                          | Tabela prevista; considerar UI de exceções em M7, não presumir calendário de feriados                                                                                 |
| ADR-09 | Alta       | Momento e condição de encerramento                                         | Somente IN_PROGRESS -> CLOSED; exige responsável; sem reabertura                                                                                                      |
| ADR-10 | Alta       | Versão do Prisma/Node e forma dos migrations                               | Aprovada: Node 24 LTS, Prisma 7.10.1, ESM e stack detalhada em [18-adr10-stack-e-fundacao.md](18-adr10-stack-e-fundacao.md); sem migrations de domínio nesta fundação |
| ADR-11 | Média      | Monorepo ou dois repositórios                                              | Monorepo com dois READMEs e GitHub Project; split se necessário na entrega                                                                                            |
| ADR-12 | Média      | Política de token JWT                                                      | JWT curto e sessão renovável protegida; decidir mecanismo contra CSRF e XSS                                                                                           |
| ADR-13 | Média      | Motivos de pendência são editáveis enquanto ativos?                        | Alterações só valem em períodos futuros via snapshot                                                                                                                  |
| ADR-14 | Média      | Quem pode comentar e anexar antes da atribuição?                           | Solicitante a qualquer momento antes de fechar; técnicos só após assumir; admin supervisiona                                                                          |
| ADR-15 | Média      | Técnico encerrador para KPI mensal                                         | atribuir ao técnico que executou o fechamento (`closed_by`)                                                                                                           |
| ADR-16 | Média      | Serviços podem ser adicionados quando PENDING?                             | Superada pela VIS-003: não adicionar outros serviços em nenhum estado                                                                                                 |
| ADR-17 | Média      | Avatar/anexos                                                              | FS local privado com abstração de provider; limites configuráveis e download autenticado                                                                              |
| ADR-18 | Média      | Expediência do cliente quando técnico fecha fora do horário                | Contagem já respeita intervalo; permitir ações fora de turno, mas minutos não contam                                                                                  |
| ADR-19 | Baixa      | Filtro de Classificados inclui encerrados por padrão?                      | visão geral pode incluir; fila operacional destaca OPEN não atribuídos                                                                                                |
| ADR-20 | Baixa      | Notificações, SLA e exportação                                             | pós-v1                                                                                                                                                                |

## Decisões já consolidadas

- Cliente **não** escolhe técnico; chamado começa sem atribuição.
- Técnico classifica prioridade sem assumir.
- Quatro status: OPEN, IN_PROGRESS, PENDING, CLOSED.
- Motivo de pendência tem flags de contagem e auto-retomada por interação do solicitante.
- Expediente padrão ou personalizado e não contabilização de pausas/fora do turno.
- Dois indicadores de solução: desde criação e desde início de atendimento.
- Três dashboards por papel; Apache ECharts e GSAP no frontend.

A aprovação parcial da ADR-01 na VIS-003 não encerra a HD-003 nem aprova automaticamente campos, permissões administrativas, preço ou modelagem de projetos.
