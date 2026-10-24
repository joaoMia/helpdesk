# HelpDesk — Frontend

Fundação React 19.3.1, Vite 8.3.5, TypeScript 5.9.3 e Tailwind CSS 4.3.3. A tela atual é uma validação técnica responsiva e provisória, sem login, dashboards, chamados, usuários, GSAP ou ECharts.

## Execução

Na raiz, após `npm ci`:

- `npm run dev:frontend`: [http://127.0.0.1:5173](http://127.0.0.1:5173), com porta estrita e bind em loopback.
- `npm run build --workspace @helpdesk/frontend`.
- `npm run typecheck --workspace @helpdesk/frontend`.
- `npm run lint --workspace @helpdesk/frontend`.
- `npm run preview --workspace @helpdesk/frontend`: preview local do build em 4173.

O endpoint `/api/health` é encaminhado pelo proxy Vite à API em 3001. Inicie o backend para ver seu estado real; uma falha não é apresentada como sucesso. O build/preview estático não incorpora esse proxy: na futura implantação, o proxy da TI deverá encaminhar `/api` à API, sem alterar o contrato do endpoint.

## Organização

`src/main.tsx` inicializa React; `src/app/app.tsx` contém a tela técnica; `src/styles.css` importa Tailwind. `tsconfig.json` usa strict e resolução Bundler. Não há diretórios vazios de módulos futuros nem suíte de testes de UI nesta fase.

O produto final será mobile first, com rotas e layouts por papel e consumo da API própria. O Figma e o design definitivo continuam sujeitos à validação. Tailwind 4 requer navegadores modernos; conferir a base corporativa antes da implantação.

Referências: [arquitetura](../../docs/04-arquitetura.md), [telas](../../docs/07-telas-e-design.md) e [ADR-10](../../docs/18-adr10-stack-e-fundacao.md).
