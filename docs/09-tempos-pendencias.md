# 09 — Calendários, pendências e cálculo de tempos úteis

## Glossário
- Tempo de relógio: diferença de instantes (inclui noites/pausas); **não é** indicador de solução.
- Janela útil: união de intervalos definidos no expediente aplicável, considerando exceções cadastradas.
- Pendência não contabilizável: trecho em que motivo configurado não conta tempo útil.

## Cálculo conceitual
Para cada trecho de calendário relevante entre o início `a` e fim `b`, usar interseção com janelas úteis `W` e retirar interseção com pendências não contabilizáveis `P0`:

`minutos_uteis(a,b) = duração([a,b] ∩ W) - duração([a,b] ∩ W ∩ P0)`.

- Métrica A: `minutos_uteis(ticket.created_at, ticket.closed_at ?? agora)`.
- Métrica B: `minutos_uteis(ticket.first_started_at, ticket.closed_at ?? agora)`; `null` antes do início.
- Duração de pendência com `counts=true` entra no tempo útil apenas quando há expediente ativo.
- Se não há expediente (almoço/noite/folga), não computar tempo mesmo em pendência contabilizável.

## Contexto de expediente
Antes do primeiro atendimento, calendário padrão da empresa. Do início em diante, versão do expediente do técnico responsável. Preservar o calendário em eventos/segmentos versionados. Em v1, transferência entre técnicos não é implementada sem decisão. Se houver alteração de jornada, vale para períodos futuros; passado permanece congelado.

## Estados/eventos
- Ao abrir: `created_at`, `status=OPEN`, `priority=NULL`, `owner=NULL`.
- Classificar: gravar prioridade + quem + quando. Não iniciar métrica B.
- Começar: atribuir + `first_started_at` + `status=IN_PROGRESS` (transação atômica).
- Pendente: adicionar `TicketPendingPeriod` com motivo e flags congeladas; mudar status.
- Solicitante interage: se flags autorizam, encerrar período e voltar IN_PROGRESS atomicamente.
- Retomada manual: registrar ator e encerramento de pendência.
- Encerrar: gravar `closed_at`, métricas finais, ator; estado imutável, salvo decisão de reabertura.

## Casos extremos obrigatórios
1. 11:00-14:00 com pausa 12:00-13:00: 2h úteis.
2. Chamado 18:00 terça a 08:30 quarta (jornada inicia às 08): 30 min úteis.
3. Pendente counts=false das 11:30 às 14:30, almoço 12-13: subtrair só 2h úteis (11:30-12 e 13-14:30).
4. Pendente counts=true em dia não trabalhado: 0 min.
5. Sexta com expediente curto e segunda feriado configurado: respeitar ambas as regras.
6. Técnico classifica às 09, inicia às 10: tempo A inclui 1h de fila, B não.
7. Técnico em jornada personalizada com almoço distinto: usar calendário atribuído.
8. Usuário responde pendência TOTVS sem auto-retomada: continua PENDING.
9. Usuário anexa log em pendência Solicitante com auto-retomada: retorna IN_PROGRESS uma vez.
10. Motivo/jornada editados depois do encerramento: não modificar indicadores históricos.
11. Dois técnicos iniciam mesmo chamado: um sucesso, outro HTTP 409.
12. Horário local/fuso: preservar offsets e converter intervalos sem comparar strings de horários diretamente.

## Decisões pendentes
Critério de calendário em exceções não cadastradas, mutabilidade de horário em jornadas em andamento, fechamento/admin e eventual reabertura ou transferência. Todas devem virar ADRs antes de implementação da métrica.
