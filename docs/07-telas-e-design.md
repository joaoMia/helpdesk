# 07 — Inventário de telas, UI e design system

## Layout e navegação
O Figma referenciado é **base visual**, mas os frames completos ainda não foram validados. Não afirmar equivalência visual até inspeção das telas e estilo: https://www.figma.com/pt-br/comunidade/file/1506654636739959765/plataforma-de-chamados

### Públicas
- Login, cadastro do solicitante, primeiro acesso e troca obrigatória de senha, mensagens de erro.

### Solicitante
- Dashboard com meus criados no mês, abertos, em atendimento, pendentes, encerrados e distribuição por status.
- Meus chamados (lista com filtros, busca e paginação).
- Abrir chamado (assunto, descrição, ≥1 serviço, preços, anexos opcionais). **Sem escolha de técnico**.
- Detalhe do chamado (timeline, status, prioridade, técnico, preço total, comentários/anexos, dois tempos).
- Meu perfil e avatar.

### Técnico
- Dashboard (meus atribuídos, meus pendentes, meus encerrados, tempo útil médio, fila a classificar).
- Filas Não classificados e Classificados, com busca, filtros e prioridade.
- Meus atendimentos (em andamento, pendentes e finalizados).
- Detalhe do chamado com ações: classificar, assumir, adicionar serviço, pendência, retomada, fechamento, mensagens.
- Meu perfil/alteração de senha/avatar.

### Admin
- Dashboard geral com períodos, indicadores de volume, status, prioridades, tempos, motivos, técnicos.
- Gestão de técnicos, solicitantes, serviços, expedientes, motivos de pendência.
- Consulta global de chamados, detalhes, histórico, status e eventuais ações de supervisão.

## Componentes comuns
`AppShell`, `Sidebar`, `Header`, `Breadcrumbs`, `KpiCard`, `StatusBadge`, `PriorityBadge`, `TicketTable`, `TicketFilters`, `TicketTimeline`, `TicketDetail`, `CommentComposer`, `AttachmentPicker`, `ScheduleEditor`, `ReasonForm`, `ChartPanel`, `ConfirmDialog`, `EmptyState`, `ErrorState`, `Skeleton`.

## Design tokens a extrair do Figma
Paleta, tipografia, densidade, espaçamento, radii, sombras, estados focus/hover/disabled, breakpoints e iconografia. Não inventar cores como se fossem oficiais do Figma.

## Boas práticas
- Mobile first; menu e filtros adaptativos; tabelas em celular com visualização em cards ou scroll consciente.
- Contraste, foco visível, labels, navegação por teclado, `prefers-reduced-motion` e anúncios acessíveis.
- GSAP para microinterações com `useGSAP`, ScrollTrigger em áreas informativas, ScrollSmoother **somente se agregar** e não interromper rolagem operacional.
- ECharts com importação modular e tabela/indicador textual equivalente; filtros por período.
- Estados vazios, loading, erros, confirmação destrutiva e feedback após ações.
