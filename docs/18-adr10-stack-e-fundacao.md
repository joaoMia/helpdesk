# ADR-10 — Stack e fundação técnica local

**Estado:** aprovada pelo responsável em 24/10/2026 para a fundação HD-008/HD-010/HD-011/HD-012. Não aprova os outros ADRs da HD-003.

## Contexto e decisão

Manter o monorepositório existente com npm workspaces (`apps/*` e `packages/*`), frontend e backend no host Windows e PostgreSQL em Linux container. O destino corporativo futuro é o Server 10 Linux, com acesso interno e DNS, certificados e backups sob responsabilidade da TI. Esta etapa não realiza deploy.

| Componente                               | Versão de dependência fixada / decisão  |
| ---------------------------------------- | --------------------------------------- |
| Node.js                                  | 24 LTS; reaproveitado 24.21.0 instalado |
| npm                                      | 11; reaproveitado 11.19.0 instalado     |
| TypeScript                               | 5.9.3, strict nos dois aplicativos      |
| React / React DOM                        | 19.3.1 / 19.3.1                         |
| Vite / plugin React                      | 8.3.5 / 6.1.2                           |
| Tailwind / plugin Vite                   | 4.3.3 / 4.3.3                           |
| Express / Zod                            | 5.3.0 / 4.6.7                           |
| Prisma CLI / Client / adapter PostgreSQL | 7.10.1 / 7.10.1 / 7.10.1                |
| Driver `pg`                              | 8.23.1                                  |
| Jest / ts-jest / Supertest               | 30.5.2 / 29.4.15 / 7.3.1                |
| ESLint / typescript-eslint               | 10.13.0 / 8.72.0                        |
| Prettier / tsx                           | 3.9.10 / 4.23.15                        |
| PostgreSQL                               | imagem `postgres:18.6-bookworm`         |

As versões exatas foram verificadas nos manifests do registro npm antes da instalação. Plugins e tipos de apoio também ficam fixados nos manifests e no lockfile. Nenhuma instalação global de TypeScript, Prisma ou ferramentas de qualidade é necessária. GSAP, ECharts, roteamento, autenticação e bibliotecas de módulos futuros não são instalados nesta fundação.

## Auditoria antes da instalação

- Repositório em `C:\dev\helpdesk`, branch `main`, árvore limpa e HEAD local/remoto `a4cf0ab`.
- Identidade efetiva: João Pedro Miá; configuração Git preservada durante a tarefa.
- Node 24.21.0 e npm 11.19.0 ativos em `%LOCALAPPDATA%\Programs\NodeJS\node-v24.21.0-win-x64`. Pacotes globais: npm 11.19.0 e corepack 0.36.0.
- Node 24.22.1 e outro Git disponíveis no runtime interno do Codex. São ferramentas empacotadas do agente; não substituir o PATH das aplicações por esse runtime.
- Git ativo 2.55.0.windows.5 em `C:\Program Files\Git\cmd`.
- Windows 11 Pro x64 e WSL 3.0.3. Docker Desktop 4.93.0 instalado em `%LOCALAPPDATA%\Programs\DockerDesktop`, Engine 29.8.1, Compose 5.5.1 e contexto `desktop-linux` funcionando.
- Docker com 8 CPUs e aproximadamente 3,73 GiB disponíveis na VM. Recursos existentes de outro projeto foram apenas inventariados e não devem ser alterados.
- Sem executáveis PostgreSQL, TypeScript ou Prisma no PATH; nenhuma instalação PostgreSQL identificada nos serviços/programas consultados do Windows. Isso não exclui instalações não registradas fora do PATH.
- Nenhum container, volume, rede ou imagem PostgreSQL do HelpDesk existente. Portas 5173, 3001 e 5432 sem listeners na auditoria.
- O projeto tinha somente o manifest raiz de workspaces e READMEs nas aplicações; sem dependências, lockfile, node_modules, configurações TS/lint ou arquivos de ambiente.

Node 24.21.0 é compatível com os engines das dependências. Recomenda-se à TI avaliar os patches de segurança Node 24.22.1, Engine 29.9.0 e Compose 5.6.1, mas esta tarefa não atualiza instalações globais nem reinicia o Docker Desktop.

## Dependências e TypeScript

Um único `package-lock.json` na raiz registra a resolução do monorepositório. Após checkout, usar `npm ci` na raiz, sem instalações globais e sem lockfiles por aplicação. Instalar ou atualizar dependências diretas com versão exata, revisão de peer dependencies, testes e lockfile. Majors exigem decisão técnica; não executar atualizações forçadas automáticas.

O frontend usa ESM, JSX React e `moduleResolution: Bundler`, com verificação `tsc --noEmit` separada do bundling. O backend usa `type: module`, `module: NodeNext`, `moduleResolution: NodeNext` e imports relativos com extensão `.js`, resolvidos para o TypeScript no desenvolvimento e JavaScript no build. `tsx` serve ao desenvolvimento; produção futura executará o JavaScript compilado, não o watcher.

TypeScript e ferramentas de qualidade comuns ficam na raiz; bibliotecas de execução ficam na aplicação que as utiliza. `packages/contracts` continua reservado, com README preservado, sem contratos de negócio artificiais nem pacote vazio. Sua estratégia de build/exports será concretizada na tarefa que introduzir os primeiros contratos, alinhada à HD-006.

## Backend, testes e Prisma

O endpoint `GET /health` responde `200` com `{"status":"ok","service":"helpdesk-api"}`. É um teste de vida do processo, não de disponibilidade do banco. O frontend consulta esse endpoint pelo proxy de desenvolvimento `/api/health`. Erros básicos são JSON e não expõem stack ou dados de configuração.

Jest é mantido conforme a autorização, sem substituição por Vitest. A execução usa `--experimental-vm-modules`, transformação ESM pelo ts-jest e mapeamento dos imports `.js` para os fontes nos testes. Essa integração ainda é classificada como experimental na documentação do Jest; suas limitações de mocking e futuras atualizações devem ser reavaliadas. Os testes da fundação cobrem HTTP real via Supertest, erros e validação de ambiente. Build/typecheck continuam independentes do Jest.

As dependências Prisma 7 e o driver foram instalados como preparação técnica. O Client não é importado pela API nem gerado nesta fase: não há modelos ou schema de domínio. A geração automática no postinstall da instalação inicial é desabilitada explicitamente.

Na HD-013, preparar `prisma.config.ts`, `schema.prisma`, gerador `prisma-client` com output explícito e conexão por `PrismaPg`; carregar variáveis explicitamente. A geração deve ocorrer somente com os pré-requisitos aprovados. Migrations de domínio e seeds não fazem parte desta fundação. Futuramente, usar `migrate dev` apenas em desenvolvimento e migrations revisadas com `migrate deploy` no destino de implantação; nunca usar `db push` como substituto de histórico de migrations em produção. Manter CLI, Client e adapter na mesma versão.

## PostgreSQL e isolamento

O projeto Compose chama-se `helpdesk`; cria somente `helpdesk-postgres`, o volume `helpdesk_postgres-data` e a rede `helpdesk_database`. Não usa redes, bancos ou volumes de outros projetos. Limite local de 512 MiB e 1 CPU por container para coexistir com os serviços já existentes; não é dimensionamento de produção.

O PostgreSQL 18 persiste em volume nomeado montado em `/var/lib/postgresql`, com PGDATA versionado da imagem oficial. A porta é publicada apenas em `127.0.0.1:5432`. O healthcheck usa `pg_isready`.

O script de inicialização de volume novo cria somente o banco técnico `helpdesk_test`, separado de `helpdesk_dev`, sem tabelas ou dados de negócio. Compartilham o cluster local, mas usam URLs distintas. Testes HTTP mínimos não dependem de nenhum deles. No futuro, as suítes com persistência deverão recusar o banco de desenvolvimento e utilizar exclusivamente o banco de testes.

`npm run env:setup` cria `.env` apenas se ausente e gera credencial local aleatória sem exibi-la. Não altera um `.env` preexistente. O arquivo é ignorado pelo Git; `.env.example` contém somente nomes e valores não sensíveis. O usuário do entrypoint é administrativo para o cluster local; produção futura exige papéis de migração e aplicação apropriados, administrados pela TI.

Não executar `down -v`, prune ou exclusão de volumes. Reiniciar/recriar um container não é necessário para comprovar persistência nesta tarefa: conferir o mount nomeado e sua associação ao container. Alterações de nome de banco ou usuário não reexecutam o init script em um volume já inicializado.

## Preparação para Linux e limites

Scripts npm evitam sintaxe específica de shell Windows. Segredos são lidos do ambiente e do arquivo local explicitamente; não entram no frontend. Caminhos de módulos e nomes de arquivo devem respeitar capitalização em Linux. Os builds e testes precisam ser repetidos em Linux na homologação futura.

Frontend de produção será estático, atrás do proxy da TI; não usar o servidor Vite de desenvolvimento como servidor corporativo. API e PostgreSQL estarão em containers Linux, com volume de dados, rede privada e HTTPS no proxy. DNS, certificados, backups, restauração, anexos e recursos do Server 10 serão detalhados posteriormente, sem configuração remota agora.

Tailwind 4 pressupõe navegadores corporativos modernos (Chrome 111+, Safari 16.4+, Firefox 128+). A interface atual é provisória e técnica; não aprova design definitivo ou funcionalidades.

HD-003, ADRs funcionais, autenticação, chamados, dashboards, CI remoto e implantação continuam pendentes. Esta decisão não os libera.

## Validação desta implementação

- Instalação local pelo npm concluída; `npm ls --depth=0` sem inconsistências e auditoria da instalação com zero vulnerabilidades reportadas naquele momento.
- Typecheck, lint, build e verificação de formatação aprovados. Jest/Supertest executados com uma suíte e cinco testes aprovados; permanece o aviso experimental de VM Modules.
- API em desenvolvimento e JavaScript compilado responderam ao `/health`; o proxy do Vite também respondeu corretamente. Interface React carregada em navegador real, com Tailwind aplicado e sem overflow horizontal na largura de 419 px verificada.
- Compose validado, PostgreSQL saudável, volume nomeado e publicação somente em loopback conferidos. Conexões aos bancos de desenvolvimento e testes confirmadas, ambos sem tabelas públicas.
- Lockfile único e versões diretas exatas conferidos. `npm ci` é o procedimento documentado para reprodução, mas não foi executado nesta instalação inicial.
- Testes em Linux e homologação nos navegadores corporativos continuam pendentes. A instalação não validou deploy, migrações, geração do Prisma Client ou funcionalidades de negócio.
- Backlog preservado; a atualização de seus estados fica para a revisão da entrega. HD-003 e as demais decisões pendentes continuam sem aprovação implícita.

## Fontes técnicas

- [Vite 8](https://v8.vite.dev/guide/)
- [Tailwind com Vite](https://tailwindcss.com/docs/installation/using-vite)
- [Prisma 7: requisitos](https://www.prisma.io/docs/orm/v7/reference/system-requirements)
- [Prisma 7: alterações de configuração](https://www.prisma.io/docs/orm/v6/more/upgrades/to-v7)
- [Jest e ESM](https://jestjs.io/docs/ecmascript-modules)
- [Imagem oficial PostgreSQL](https://github.com/docker-library/docs/blob/master/postgres/content.md)
