# 10 — Segurança, qualidade e estratégia de testes

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
