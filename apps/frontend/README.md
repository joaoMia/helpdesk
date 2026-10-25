# HelpDesk — Frontend

React 19.3.1, Vite 8.3.5, TypeScript 5.9.3 e Tailwind CSS 4.3.3. A Prévia Visual 001 oferece telas navegáveis com dados fictícios para avaliação. Não implementa autenticação, persistência ou endpoints de negócio e não conclui tarefas funcionais do backlog.

## Prévia Visual 001

- Navegação por hash (`#/requester/painel`, `#/technician/painel`, `#/admin/painel`), com histórico do navegador e acesso direto às telas.
- Seletor de perfil exclusivamente para avaliação; não representa login ou autorização. Todos os dados do bundle são fictícios e acessíveis no cliente.
- Solicitante: painel, chamados com busca/filtros, abertura com múltiplos serviços ativos, detalhes e acompanhamento.
- Técnico: painel pessoal, filas separadas, atendimentos e simulação de classificação, assunção, pendência, retomada e encerramento. Triagem mantém descrição e histórico ocultos; regras definitivas de visibilidade aguardam ADR.
- Administrador: painel e listagens de chamados, usuários, técnicos, serviços, jornadas e motivos, somente para consulta.
- Estado somente em memória; recarregar descarta alterações. O botão de reinício restaura a amostra após confirmação. Anexos mostram apenas o nome; nenhum arquivo é enviado. Não informar dados reais.
- Mocks e simulação ficam em `src/mocks`, separados de tipos da prévia, navegação, layout, componentes e páginas. Não reutilizar a simulação como autorização ou regra da futura API.
- Indicadores são contagens da amostra, não KPIs de produção. Não há cálculo de tempo útil, SLA, poderes administrativos pendentes, reabertura ou transferência.
- O Figma documentado não pôde ser acessado nesta execução; o visual usa o inventário local e a paleta slate/teal já existente, sem alegação de fidelidade.

Tarefas relacionadas: HD-024 (gestão, sem login), HD-031, HD-037, HD-042, HD-048, HD-058 (prévia sem ECharts) e HD-060. O backlog permanece inalterado.

Para executar os testes isolados da simulação, na raiz do monorepositório, usando o `tsx` já instalado na fundação:

```text
node --import tsx --test apps/frontend/tests/simulation.test.ts
```

Esses testes verificam somente o protótipo local; não comprovam segurança, concorrência ou persistência da API futura.

## Execução

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
