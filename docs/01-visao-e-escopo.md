# 01 — Visão, objetivos e escopo

## Produto
Aplicação web responsiva HelpDesk para gerenciamento de solicitações de suporte de TI. Três papéis: **ADMIN**, **TECHNICIAN** e **REQUESTER** (Solicitante, originalmente chamado Cliente). O sistema permite abertura, triagem, atendimento, pendência configurável, conclusão, controle de serviços e painéis por perfil.

## Objetivos da versão local
- Funcionar integralmente no computador de desenvolvimento (frontend, API, PostgreSQL em Docker).
- Ser rastreável: requisito -> issue -> branch -> PR -> testes -> evidências.
- Ter regras explícitas, API própria, segurança por papel, histórico auditável.
- Medir dois tempos úteis com jornada e pendências configuráveis.
- Ter 3 dashboards específicos, acessíveis e responsivos.

## Funcionalidades da versão personalizada
1. Cadastro e login, JWT, autorização e perfis.
2. Gestão de técnicos e clientes, inclusive exclusão em cascata de cliente conforme desafio.
3. Catálogo de serviços com preço histórico e desativação.
4. Abertura sem escolher técnico; fila de **Não classificados** (priority=NULL) e fila de **Classificados** (priority definida).
5. Técnico classifica sem assumir; atribuição atômica ao iniciar atendimento.
6. Quatro status: OPEN, IN_PROGRESS, PENDING, CLOSED.
7. Administração de motivos de pendência com duas regras: conta tempo? retoma por interação do solicitante?
8. Comentários e anexos com autoria, validação e histórico.
9. Calendário padrão da empresa e personalizado do técnico, por dia da semana, com múltiplos intervalos.
10. Dois tempos úteis: abertura->encerramento e primeira atribuição/início->encerramento.
11. Dashboard individual do solicitante, operacional do técnico e global do administrador.

## Fora do escopo inicial
- Integração com TOTVS (motivo de pendência não implica integração real).
- SLA com metas/prazos, alertas de vencimento e escalonamento automático.
- Email/WhatsApp, LDAP/AD, SSO, multiempresa, faturamento/pagamento.
- Aplicativo mobile nativo, notificações em tempo real, relatórios exportáveis e IA no atendimento.
- Reabertura, transferência de responsável e atribuição manual arbitrária: exigem decisão e regras próprias.

## Entrega educacional x versão customizada
O produto personalizado **diverge** da solicitação original de seleção de técnico na abertura e do conjunto original de status. Para eventual avaliação estrita na Rocketseat, considerar modo compatível ou versão/branch da especificação original. Não prometer equivalência automática.
