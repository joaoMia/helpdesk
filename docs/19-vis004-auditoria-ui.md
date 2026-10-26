# VIS-004 — Auditoria de UI/UX e limites da prévia

Revisão limitada ao frontend demonstrativo. Não é homologação de autenticação, autorização, banco, jornadas, SLA ou regras pendentes. As mudanças locais da VIS-002/003 foram preservadas; sua base de revisão está registrada em `.local/vis004-base/`, ignorada pelo Git.

## Problemas priorizados e tratamento

| Prioridade | Impacto observado                                                                            | Tratamento no escopo visual                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| P1         | Mensagens genéricas de sucesso mesmo quando a simulação não mudava o chamado                 | Comparar o resultado e notificar sucesso apenas quando a ação é aplicada; falhas mantêm a tela e exibem erro.                                  |
| P1         | Datas de encerramento sem distinção entre fato e registro                                    | Interface separa os instantes; solicitações de correção mantêm os originais e não aprovam alterações. Limites e histórico são demonstrativos.  |
| P1         | Campos nativos de data podiam perder edição ao atualizar outro campo no navegador disponível | Capturar também o evento `input` em data/data-hora; revalidar após editar outro campo.                                                         |
| P1         | Percentual poderia ser confundido com aprovação ou garantia de entrega                       | Rótulos explícitos, histórico e contexto administrativo; estado provisório independente do percentual.                                         |
| P2         | Instância de gráfico recriada ao mudar modelo                                                | Referência persistente, atualização por `setOption`, IDs estáveis e `universalTransition` para distribuição compatível; descarte no desmontar. |
| P2         | Animações pouco perceptíveis e ausência de saída                                             | GSAP com escalonamento, números, revelação localizada, painéis, toasts e diálogos com entrada/saída; limpeza e redução de movimento.           |
| P2         | Dashboard longo e difícil de percorrer                                                       | Navegação por seções e retorno ao topo; painéis recolhíveis; filtros preservados entre tipos. Rolagem nativa e tabelas mantidas.               |
| P2         | Contorno duro no foco da pesquisa                                                            | Foco no grupo com borda e sombra teal; indicação de teclado continua visível. Seletores nativos preservam compatibilidade.                     |
| P2         | Ações importantes sem confirmação consistente                                                | Diálogo comum com foco, Escape e restauração; resultado inválido mantém o diálogo aberto. Reinício ocorre após a saída do diálogo.             |
| P2         | Informações de erro longe de formulários extensos                                            | Direcionamento ao primeiro campo inválido, sem ignorar movimento reduzido; mensagens no próprio formulário.                                    |
| P2         | Cabeçalhos de gráficos e cores inconsistentes                                                | Espaçamento padronizado, ações alinhadas, legenda mais curta; cores de status e prioridade coerentes com badges, com texto/tabela além da cor. |
| P2         | Leitura limitada de valores e rótulos longos                                                 | Alternativa de tabela, tooltips, legendas e truncamento apenas visual; nomes completos continuam disponíveis nos dados.                        |
| P3         | Administração apenas estática                                                                | Cadastros tipados em memória e confirmação de ativação/desativação, sem senha real ou efeito sobre contas.                                     |

## Decisões e melhorias que permanecem propostas

- Permissões reais para administrar perfis, desativar contas, corrigir datas e atualizar projetos; não inferir autoridade do seletor de perfil.
- Motor de tempo útil, fuso organizacional e política de recálculo/versionamento após correções.
- Autenticação real, proteção contra enumeração, rate limit e gestão de sessões nas tarefas de segurança.
- Critério ponderado de progresso e agregação; percentual não significa aprovação ou compromisso de prazo.
- Persistência de filtros por usuário, histórico central de notificações, preferências no servidor e monitoramento de performance exigem escopo próprio.
- Otimização adicional do bundle dos gráficos deve partir de medição no hardware corporativo, sem introduzir dependências ou mascarar avisos de build.

## Verificação e evidências

Executar typecheck, lint, formatação, build, testes existentes e cenários novos de modelos demonstrativos. Conferir navegador em 1440, 1366 e 390 px, nos dois temas, com teclado, console, filtros, diálogos, login, datas e progresso. Registrar separadamente testes executados e limitações no relatório local `.local/vis004/relatorio.md`; esta lista de verificações não declara resultados por antecipação.

Não houve auditoria formal completa com leitor de tela, WCAG ou todos os navegadores corporativos; isso exige homologação específica. Para requisitos e propostas, consultar [regras](03-regras-de-negocio.md), [dashboards](08-dashboards.md), [tempos](09-tempos-pendencias.md) e [decisões futuras](16-decisoes-para-proximos-modulos.md).
