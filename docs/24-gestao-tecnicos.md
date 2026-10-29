# DEV-007 / HD-021 — Gestão real de técnicos

Implementação autorizada em 28/10/2026. Reutiliza autenticação, autorização e tabela users existentes. Não há migration, seed, alteração de credenciais existentes nem novos poderes operacionais para ADMIN.

## API e autorização

- GET /technicians: somente ADMIN, paginação page (padrão 1), pageSize (padrão 10, máximo 50) e search por nome/e-mail. Somente TECHNICIAN, ordenação estável e projeção pública explícita.
- GET /technicians/:id: somente ADMIN; UUID inexistente ou de outro perfil retorna o mesmo NOT_FOUND/404.
- POST /technicians: JSON estrito name/email. Normaliza e-mail; cria exclusivamente TECHNICIAN ativo com mustChangePassword=true. Senha provisória individual gerada com randomBytes(24), protegida pelo Argon2id existente. Retorna technician e temporaryPassword somente nesta resposta, com Cache-Control: no-store.
- PATCH /technicians/:id: JSON estrito, não vazio, somente name/email. Não aceita papel, atividade, flags, senha, identificador ou hash. Mudança efetiva de e-mail revoga todas as sessões do técnico na mesma transação; exige novo login.

Reutiliza cookies HttpOnly, CSRF, origem/CORS e guard de sessão vigente, usuário ativo e troca inicial concluída. technicians.read/create/update são exclusivos de ADMIN. Mutações revalidam o administrador e sua sessão sob locks e bloqueiam a conta de destino ao editar. Unicidade concorrente é resolvida pelo PostgreSQL; erro sanitizado TECHNICIAN_CONFLICT/409. Mutações possuem limite compartilhado de 20 tentativas/IP/15 minutos, sem substituir proteção distribuída futura. Não há rota de exclusão, ativação/desativação ou redefinição de senha.

## Interface real

ADMIN acessa **Gestão de usuários** em #/admin/usuarios. A página consulta a API real, permite buscar, paginar, visualizar, cadastrar e editar técnicos. Situação e troca inicial são somente leitura. Não utiliza contas do laboratório.

Após criar, diálogo nativo apresenta a senha uma única vez, com ação de copiar. Fechar, pressionar Escape ou desmontar a página elimina a referência no estado React; não há persistência no navegador nem consulta posterior. Falhas de transporte não repetem automaticamente a criação. Strings JavaScript não oferecem apagamento físico garantido. O responsável entrega a credencial por canal seguro e separado e limpa a área de transferência após uso. HTTPS e homologação corporativa da entrega são necessários antes de produção. Fechar sem entregar a senha não permite recuperá-la nesta tarefa.

Primeiro login reutiliza a troca obrigatória existente: nova senha diferente da provisória, revogação das sessões e novo login. Não há outro mecanismo de autenticação.

## Perfil próprio

GET /users/me mantém a consulta própria para os perfis autenticados. PATCH /users/me passa a aceitar REQUESTER e TECHNICIAN, exclusivamente o ID da sessão, com revalidação do mesmo papel no banco. ADMIN não recebe edição própria nem de terceiros por essa rota. Nome é editável; mudança de e-mail exige senha atual e revoga sessões. TECHNICIAN acessa **Meu perfil** em #/technician/perfil, reutilizando o formulário do solicitante. Permanece pendente comprovação de propriedade do e-mail antes de implantação corporativa.

## Validação e limites

Integração usa namespace descartável exclusivo em helpdesk_test, autenticação/cookies/CSRF reais e contas de teste aleatórias. Não altera usuários de helpdesk_dev. Testes cobrem cadastro, hash, primeiro acesso, senha não reexposta, edição e revogação, duplicidade, papéis, payload privilegiado, origem/CSRF e perfil próprio do técnico. O laboratório visual continua separado. Jornadas, desativação, exclusão, redefinição administrativa e gestão de solicitantes permanecem fora do escopo.

Referências: [requisitos](02-requisitos-e-permissoes.md), [regras](03-regras-de-negocio.md), [autorização](21-autorizacao-backend.md), [ADR-12](20-adr12-autenticacao.md), [perfil próprio](23-perfil-solicitante.md).
