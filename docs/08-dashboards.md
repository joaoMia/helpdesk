# 08 — Dashboards por persona e contratos de métricas

> Registro de desenvolvimento. Para regras e escopo atuais, consulte o [contrato vigente da v1.0](v1-contrato.md).

## Solicitante

- KPIs: criados no mês, status OPEN, IN_PROGRESS, PENDING, CLOSED no mês, chamados históricos totais.
- Gráficos: distribuição por status, abertura por mês, prioridades dos próprios chamados.
- Tabela: últimos chamados e pendências que exigem resposta.
- Escopo **somente tickets.requester_id = usuário atual**.

## Técnico

- KPIs: atribuídos ativos, em atendimento, pendentes, encerrados por ele no período, fila global não classificada.
- Gráficos: seus atendimentos por status, prioridade, encerramentos no tempo, média dos dois indicadores de solução dos seus chamados encerrados.
- Fila operacional: classificados aguardando técnico, não classificados, seus atendimentos, pendências.
- Dividir claramente **fila global** de **meus indicadores**, não misturar contagens.

## Admin

- KPIs: criados/encerrados no período, abertos, pendentes, em atendimento, não classificados, alta prioridade, tempo médio total de solução e desde início.
- Gráficos: criados vs encerrados por mês, prioridade, serviços demandados, motivos de pendência, produtividade por técnico, distribuição do tempo.
- Filtros: data, responsável, status, prioridade, serviço; respeitar conceito de período e autorização.

## Definições de métricas

- `createdInPeriod`: created_at pertence ao intervalo local selecionado; qualquer estado atual.
- `closedInPeriod`: closed_at pertence ao intervalo selecionado.
- `openNow`: status atual OPEN (não confundir com criados no mês).
- `unclassifiedNow`: prioridade atual NULL.
- `classifiedAvailableNow`: prioridade não NULL, status OPEN e sem técnico atribuído.
- `assignedActiveNow`: assigned_technician_id = técnico e status != CLOSED.
- `technicianClosedInPeriod`: closed_at no intervalo E closed_by = técnico (decisão proposta; revisar se transferência for permitida).
- `avgTotalSolutionMinutes`: média `total_work_minutes` de encerrados elegíveis no período (denominador documentado).
- `avgAttendanceMinutes`: média `attendance_work_minutes` de encerrados com início registrado; `NULL` sem amostra, nunca 0 enganoso.
- `pausedMinutes`: minutos úteis em períodos de pendência `counts=false` e/ou não úteis, discriminados corretamente para evitar dupla contagem. Exibir categoria claramente.

## Contrato de filtros

Todos os agregados usam fuso da organização para definir fronteiras do mês/dia. Retornar `{period:{from,to,timezone}, filters, metrics, charts}`. API valida escopo e filtros; cliente somente renderiza. Dashboard usa `echarts/core` com imports sob demanda.

## Proposta anterior e decisão vigente

A proposta inicial não incluía metas. A v1 tem SLA de solução por prioridade, políticas versionadas e dashboard ADMIN. Soluções são medidas pela data efetiva e as médias finais A/B vêm de encerramentos completos. Consulte o contrato vigente para o escopo de cada papel.
