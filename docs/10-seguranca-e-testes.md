# 10 — Segurança, qualidade e estratégia de testes

## DEV-003 — Autenticação implementada

Decisões autorizadas e políticas executadas estão na [ADR-12](20-adr12-autenticacao.md): Argon2id, senha 12–128 caracteres, JWT de 15 minutos, refresh de sete dias rotativo/revogável e persistido só como hash, cookies HttpOnly/Strict/Secure em HTTPS, CSRF assinado vinculado à sessão e CORS restrito. A exceção HTTP é exclusivamente local e explícita. Não guardar tokens no storage do navegador.

Cadastro só cria REQUESTER ativo; nenhum perfil extra é aceito. Login tem resposta genérica para senha errada, conta inexistente ou inativa e rate limiting. Middleware verifica assinatura/claims e consulta usuário/sessão; logout revoga no servidor, e troca de senha exige senha atual/revoga todas as sessões. mustChangePassword bloqueia funcionalidades comuns no backend, com fluxo específico de troca. Não há autenticação pelo seletor demonstrativo.

Testes HTTP/PostgreSQL cobrem cadastro, duplicidade, hash/política, login/atividade, limites, cookies, expiração/claims, rotação/replay/concorrência, logout, troca de senha, primeiro acesso, CSRF e CORS. Desenvolvimento é comparado por conexão somente leitura. Testes de auth usam namespace descartável próprio de helpdesk_test para conexões e locks reais; a limpeza valida nome/posse e remove apenas o namespace recém-criado, sem tocar public ou outros bancos.

Pendências antes de implantação: envio/verificação de e-mail, recuperação segura de acesso, provisionamento HD-019, RBAC/ownership HD-018, TLS/proxy confiável, store distribuído de rate limit e retenção de sessões. Nenhuma ADR restante foi aprovada automaticamente.

## Segurança obrigatória

- Senhas com hash robusto (`argon2id` preferencial; alternativa bcrypt parametrizado); nunca enviar hash na API ou log.
- Credenciais provisionadas por variáveis de ambiente no dev; sem senhas fixas commitadas e sem dados pessoais reais no seed.
- JWT com validade limitada; política segura de armazenamento/renovação/cookie + mitigação CSRF sob ADR explícita. Não guardar token de longo prazo em localStorage.
- Autorização em cada operação verificando papel **e titularidade**; filtro de dados também nas agregações.
- Zod nos limites da API, whitelist de campos editáveis, queries parametrizadas/ORM, rate-limit no login, CORS restrito, headers de segurança, requestId e logs sem segredos.
- Upload validando extensão, MIME e assinatura do arquivo, tamanho e limite por usuário; armazenamento não público em desenvolvimento e download autorizado.
- Garantir exclusão de blobs físicos ao apagar conta/chamados, considerando falhas e política futura de retenção.
- Controle de concorrência de `start`, classificação, mudança de status, fechamento e resposta automática.
- Cuidar de dados sensíveis de chamados/anexos e LGPD antes de uso empresarial.

## Estratégia de testes

**Unitários (Jest):** calendário, cálculo de minutos, elegibilidade de ações, prioridades, pendência com/sem auto-reabertura, snapshots de serviço.  
**Integração (Jest + Supertest + PostgreSQL isolado):** API JWT, RBAC, consultas por escopo, transações, cascata, soft delete, upload, logs e dashboards.  
**Frontend:** renderização de status/cards, formulários e estados vazios, responsividade, reduced motion e navegação acessível.  
**E2E:** ciclo abrir -> classificar -> assumir -> pendente -> usuário responde -> retomada -> encerrar, com métricas conhecidas.

## Casos críticos de autorização

- Solicitante A tentando GET/PATCH/DELETE de dados de B: negação.
- Técnico A tentando POST /tickets/:id/services do ticket de B: negação.
- Técnico listando tickets não atribuídos: somente dados de triagem permitidos.
- Usuário tentando criar serviço ou motivo: negação.
- Solicitante tentando alterar prioridade/status por API direta: negação.
- Comentário/anexo em ticket CLOSED: rejeitado conforme v1.

## Definition of Done por issue

1. Critério de aceite demonstrado.
2. API contratada e erros definidos.
3. Testes relevantes executados; correção de regressões.
4. Tipo/check/lint aprovados; não há segredos no diff.
5. Alterações revisadas e documentadas.
6. Interface testada mobile + desktop, quando aplicável.
7. PR vinculado a issue/requisito; branch isolada, sem merge automático.
