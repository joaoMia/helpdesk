# HelpDesk — Frontend

React 19.3.1, Vite 8.3.5, TypeScript 5.9.3 e Tailwind CSS 4.3.3. A Prévia Visual 001 oferece telas navegáveis com dados fictícios para avaliação. Não implementa autenticação, persistência ou endpoints de negócio e não conclui tarefas funcionais do backlog.

## Prévia Visual 001

- Navegação por hash (`#/requester/painel`, `#/technician/painel`, `#/admin/painel`), com histórico do navegador e acesso direto às telas.
- Seletor de perfil exclusivamente para avaliação; não representa login ou autorização. Todos os dados do bundle são fictícios e acessíveis no cliente.
- Solicitante: painel, chamados com busca/filtros, abertura com serviço ativo único (fluxo revisado na VIS-003), detalhes e acompanhamento.
- Técnico: painel pessoal, filas separadas, atendimentos e simulação de classificação, assunção, pendência, retomada e encerramento. Triagem mantém descrição e histórico ocultos; regras definitivas de visibilidade aguardam ADR.
- Administrador: painel e listagens de chamados, usuários, técnicos, serviços, jornadas e motivos, somente para consulta.
- Estado somente em memória; recarregar descarta alterações. O botão de reinício restaura a amostra após confirmação. Anexos mostram apenas o nome; nenhum arquivo é enviado. Não informar dados reais.
- Mocks e simulação ficam em `src/mocks`, separados de tipos da prévia, navegação, layout, componentes e páginas. Não reutilizar a simulação como autorização ou regra da futura API.
- Indicadores são contagens da amostra, não KPIs de produção. Não há cálculo de tempo útil, SLA, poderes administrativos pendentes, reabertura ou transferência.
- O Figma documentado não pôde ser acessado nesta execução; o visual usa o inventário local e a paleta slate/teal já existente, sem alegação de fidelidade.

Tarefas relacionadas: HD-024 (gestão, sem login), HD-031, HD-037, HD-042, HD-048, HD-058 (gráficos ainda demonstrativos) e HD-060. O backlog permanece inalterado.

Para executar os testes isolados da simulação, na raiz do monorepositório, usando o `tsx` já instalado na fundação:

```text
node --import tsx --test apps/frontend/tests/simulation.test.ts
```

Esses testes verificam somente o protótipo local; não comprovam segurança, concorrência ou persistência da API futura.

## VIS-002 — Evolução demonstrativa

VIS-001 foi preservada em commit próprio antes desta evolução. A prévia atual acrescenta tema claro/escuro (preferência do sistema, escolha local persistida e fallback sem armazenamento), menu técnico Chamados com três abas, campos condicionais por serviço, revisão antes da abertura, referência externa TOTVS e projetos separados dos chamados.

Na VIS-002, definições visuais de formulários ficam em `src/forms`. Tipos, mocks e ciclo visual de projetos são separados. A VIS-003 amplia esse catálogo com edição demonstrativa em memória, descrita abaixo. Preços não são exibidos nesta prévia; a decisão funcional definitiva está pendente em `docs/16-decisoes-para-proximos-modulos.md`.

Nenhuma resposta ou anexo é persistido ou enviado. Somente a preferência de tema usa localStorage. Use exclusivamente informações fictícias, nunca senhas. Trocar de perfil continua sendo uma ferramenta de avaliação, não autenticação.

Testes isolados da prévia, na raiz:

```text
node --import tsx --test apps/frontend/tests/*.test.ts
```

## Execução local

Na raiz, após `npm ci`:

- `npm run dev:frontend`: [http://127.0.0.1:5173](http://127.0.0.1:5173), com porta estrita e bind em loopback.
- `npm run build --workspace @helpdesk/frontend`.
- `npm run typecheck --workspace @helpdesk/frontend`.
- `npm run lint --workspace @helpdesk/frontend`.
- `npm run preview --workspace @helpdesk/frontend`: preview local do build em 4173.

O endpoint `/api/health` é encaminhado pelo proxy Vite à API em 3001. Inicie o backend para ver seu estado real; uma falha não é apresentada como sucesso. O build/preview estático não incorpora esse proxy: na futura implantação, o proxy da TI deverá encaminhar `/api` à API, sem alterar o contrato do endpoint.

## Organização

`src/main.tsx` inicializa React; `src/app/app.tsx` conecta navegação, estado demonstrativo e páginas; `src/styles.css` importa Tailwind. Layouts, componentes, páginas, navegação e mocks ficam separados. `tsconfig.json` usa strict e resolução Bundler e inclui os testes da simulação. Não há diretórios vazios de módulos futuros nem suíte automatizada de testes de UI nesta fase; as interações foram verificadas em navegador.

O produto final será mobile first, com rotas e layouts por papel e consumo da API própria. O Figma e o design definitivo continuam sujeitos à validação. Tailwind 4 requer navegadores modernos; conferir a base corporativa antes da implantação.

Referências: [arquitetura](../../docs/04-arquitetura.md), [telas](../../docs/07-telas-e-design.md) e [ADR-10](../../docs/18-adr10-stack-e-fundacao.md).

## VIS-003 — Catálogo, projetos e análise visual

- Catálogo inicial com seis categorias e 16 serviços (um inativo). Abertura em quatro etapas: categoria → um serviço ativo → formulário integrado → revisão. Mudança de seleção exige confirmação de descarte; voltar preserva o rascunho. Chamados mantêm snapshots do serviço, categoria e campos.
- Administrador cria/edita/ativa/desativa categorias e serviços na sessão. Editor suporta texto curto/longo, seleção única/múltipla de valores, data/hora, anexo e checkbox, com opções, obrigatoriedade e condições simples baseadas em campo anterior. Prévia usa o mesmo renderizador do solicitante. Não é administração real nem segura.
- Projetos têm sete categorias, contexto, objetivos, impacto, benefícios, público, prazo de expectativa, anexos e campos complementares. Ciclo e permissões permanecem provisórios; nenhuma aprovação automática.
- Dashboards por perfil com ECharts 6.1.0 modular (linha, barra, rosca, SVG), carregamento separado, resize/dispose, tema, tooltip e tabela acessível de dados. Métricas A/B são valores fixos fictícios de encerrados, sem motor de calendário ou SLA.
- GSAP 3.15.0 e @gsap/react 2.1.2 para entradas discretas de páginas, cartões, etapas e painéis, com contexto e limpeza. Animações e smooth scroll respeitam movimento reduzido. ScrollSmoother global não foi adotado para preservar foco, campos longos, tabelas e elementos fixos.
- Configurações são arquivos comuns; nenhum serviço externo/CDN é necessário. Só o tema usa localStorage.

Componentes novos: ChartCard, MotionRegion, Stepper, FieldEditor, ConfirmChange. Catálogo e agregações fictícias ficam em src/mocks; definições de campos em src/forms; opções de gráficos em src/lib. Propostas e impactos funcionais: [decisões futuras](../../docs/16-decisoes-para-proximos-modulos.md). O backlog não foi marcado como concluído.

Referências técnicas: [ECharts modular](https://echarts.apache.org/handbook/en/basics/import/), [redimensionamento e descarte](https://echarts.apache.org/handbook/en/concepts/chart-size/), [GSAP com React](https://gsap.com/resources/React/), [matchMedia](<https://gsap.com/docs/v3/GSAP/gsap.matchMedia()/>).

## VIS-004 — Dashboards e interações avançadas

- Evolução em barras + linha com média móvel descritiva, período de 3/6/7/12 meses e modos de tabela/linha/barras. Status usa Rose por padrão, com rosca, barras e tabela sobre os mesmos valores. Não há atualização em tempo real simulada.
- ChartCard mantém a instância ECharts entre filtros e tipos; IDs de série/dados estáveis, universalTransition nos tipos compatíveis, tema/resize e descarte no desmontar. Gauge e barras representam apenas percentuais fictícios de projetos.
- Login isolado em [#/login](http://127.0.0.1:5173/#/login): vazio, formato inválido, erros escolhidos no laboratório, envio e sucesso visual. Senha somente fictícia, limpa após tentativa; nenhuma comparação, armazenamento, requisição de login, sessão ou token. Perfil de exploração não é autenticação.
- Usuários/técnicos têm cadastro, edição, detalhes, filtros e ativação em memória. Setores/jornadas são exemplos. Técnico novo apenas sinaliza o fluxo futuro de senha temporária e troca obrigatória, sem gerar credencial.
- Conclusão efetiva e registro original de encerramento são distintos. Retroatividade exige justificativa; correção após fechamento gera solicitação e preserva datas. Sem aprovação ou recálculo de métricas.
- Projetos têm percentual manual, barra/número animados e histórico. Atualização demonstrativa somente no administrador. A média simples no dashboard é estimativa, não prazo ou aprovação.
- GSAP anima páginas, cartões, valores, revelações, etapas, painéis e mensagens. ScrollTrigger é localizado; sem ScrollSmoother global. O botão Reduzir movimento acrescenta uma preferência em memória e nunca desativa a redução solicitada pelo SO. Somente o tema é persistido.
- Toasts de sucesso, erro, aviso e informação; confirmação padronizada, foco/Escape e animações de saída. Sucesso depende de mudança aplicada à amostra. Pesquisa tem foco suave visível e seletores continuam nativos.

Nenhuma biblioteca foi reinstalada ou acrescentada nesta revisão. Backlog e módulos reais permanecem pendentes. Consulte [propostas VIS-004](../../docs/16-decisoes-para-proximos-modulos.md) e [auditoria de UI](../../docs/19-vis004-auditoria-ui.md).

Referências oficiais avaliadas: [mix-line-bar](https://echarts.apache.org/examples/en/editor.html?c=mix-line-bar), [Rose](https://echarts.apache.org/examples/en/editor.html?c=pie-roseType-simple), [gauge](https://echarts.apache.org/examples/en/editor.html?c=gauge-progress), [dynamic-data](https://echarts.apache.org/examples/en/editor.html?c=dynamic-data) e [transições](https://echarts.apache.org/handbook/en/how-to/animation/transition/). O padrão de atualização foi adaptado sem temporizador de dados aleatórios.

## VIS-004.1 — Correção dos gráficos e rolagem

As opções completas dos gráficos substituem o modelo anterior com `notMerge: true`, preservando a instância. A troca de tipos usa saída/entrada GSAP e animação nativa de crescimento do ECharts; a transição morfológica foi desativada após reproduzir resíduos de setores sobre barras. Rose utiliza `roseType: radius`; tabela inclui percentuais para distribuições e limpa o gráfico anterior.

ScrollSmoother suaviza somente o conteúdo principal em desktop com ponteiro preciso e sem redução de movimento. Sidebar, cabeçalho fixo, notificações, retorno ao topo e diálogos em portal ficam fora da área transformada. Mobile, dispositivos de toque e movimento reduzido preservam a rolagem nativa. ScrollTrigger revela seções uma vez; ScrollToPlugin atende âncoras, formulários e navegação em áreas nativas, enquanto a navegação dentro do conteúdo suavizado usa a API do Smoother. CSS `scroll-behavior` permanece `auto` para evitar competição.

O controle Movimento/Reduzido foi removido. Animações seguem exclusivamente `prefers-reduced-motion` do sistema; antigos estados do aplicativo não as desativam. Não há configuração de movimento persistida no armazenamento local. Tema e demais funcionalidades demonstrativas permanecem preservados.
