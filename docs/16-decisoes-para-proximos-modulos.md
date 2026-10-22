# 16 — Pendências priorizadas para futuras sprints

A estrutura geral foi aprovada para início do M1. **Nenhuma destas pendências bloqueia o scaffold**, mas algumas bloqueiam o módulo indicado. Recomendações abaixo são propostas, não regras automaticamente aprovadas.

## Antes de M2 (contas e segurança)
- **D1 — Sessão JWT:** definir armazenamento, renovação e revogação; proposta: cookies HttpOnly/Secure e proteção CSRF adequada, token de curta duração; documentar fluxos e testes.
- **D2 — Credencial provisória:** exigir troca no primeiro login; determinar se Admin redefine senha e como recuperar contas sem e-mail.
- **D3 — Perfis e visibilidade:** o que cada técnico vê em chamados não atribuídos? Recomendação: ler descrição e anexos necessários à triagem, mas bloquear edição fora das ações de classificação/assunção.

## Antes de M3/M4 (catálogos e chamados)
- **D4 — Campos do chamado:** assunto, descrição, serviço inicial único ou múltiplo, anexos opcionais; conferir os frames reais do Figma antes de fixar formulários.
- **D5 — Serviço versus categoria:** uma tabela de serviços (cada serviço é categoria) para v1, ou categoria e serviço separados? Proposta: serviço é a unidade de seleção/cobrança; não criar tabela `Category` sem aprovação.
- **D6 — Preço:** manter preço histórico em centavos, inclusive para itens adicionados pelo técnico, segundo especificação já aprovada.

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
