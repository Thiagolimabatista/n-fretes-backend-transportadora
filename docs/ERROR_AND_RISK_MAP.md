# Mapa de erros e riscos — Portal Transportadora

Última revisão: 2026-08-19

Escopo auditado:

- `n-fretes-backend-transportadora`
- `n-fretes-v2-front-end-transportadora`
- fluxo local Docker entre frontend, APIs e PostgreSQL compartilhado

Este documento separa duas coisas diferentes:

1. **Contrato de erro para o usuário:** já existe uma barreira central para não
   exibir SQL, stack trace, nomes de constraints, tokens ou mensagens cruas de
   provedores.
2. **Riscos funcionais e de segurança:** continuam sendo defeitos reais mesmo
   quando a mensagem apresentada ao usuário é amigável. Os itens P0 abaixo são
   bloqueadores de produção.

## Contrato HTTP seguro

Toda falha da API deve seguir este formato:

```json
{
  "code": 409,
  "statusCode": 409,
  "errorCode": "COMPANY_ALREADY_EXISTS",
  "error": "Este CNPJ já possui cadastro.",
  "message": "Este CNPJ já possui cadastro.",
  "requestId": "6aa7f8f3-...",
  "timestamp": "2026-08-19T17:00:00.000Z",
  "path": "/auth/register"
}
```

- `code` numérico foi mantido temporariamente por compatibilidade.
- `errorCode` é o identificador estável que o frontend deve mapear.
- `error` é um alias amigável para clientes antigos.
- `details` pode existir somente para validação e nunca deve conter detalhes
  técnicos.
- `requestId` deve ser informado ao suporte; detalhes internos ficam apenas no
  log redigido do servidor.

Implementação:

- Backend: `src/filters/http-exception.filter.ts`
- Frontend: `src/lib/api/errors.ts`
- Cliente principal: `src/lib/api/base.ts`
- Barreiras finais: `src/lib/toast.ts`, `src/components/Alert.tsx`,
  `src/components/modules/common/error-message.tsx`, `src/app/error.tsx` e
  `src/app/global-error.tsx`

## Mapeamento de apresentação

| Condição | HTTP | `errorCode` | Mensagem ao usuário |
|---|---:|---|---|
| Dados inválidos | 400/422 | `VALIDATION_ERROR` | Revise os dados informados e tente novamente. |
| Login inválido | 401 | `INVALID_CREDENTIALS` | CNPJ, e-mail ou senha inválidos. |
| Sessão ausente/expirada | 401 | `AUTHENTICATION_REQUIRED` | Sua sessão expirou. Entre novamente. |
| Sem permissão | 403 | `ACCESS_DENIED` | Você não tem permissão para esta ação. |
| Registro não encontrado | 404 | `RESOURCE_NOT_FOUND` | Não encontramos o registro solicitado. |
| Registro duplicado | 409 | `RESOURCE_ALREADY_EXISTS` | Já existe um registro com estes dados. |
| Registro relacionado | 409 | `RESOURCE_IN_USE` | O registro está relacionado a outros dados. |
| Arquivo grande | 413 | `PAYLOAD_TOO_LARGE` | O arquivo excede o tamanho permitido. |
| Tipo de arquivo inválido | 415 | `UNSUPPORTED_MEDIA_TYPE` | Este tipo de arquivo não é permitido. |
| Muitas tentativas | 429 | `RATE_LIMITED` | Aguarde um instante e tente novamente. |
| Erro inesperado | 500 | `INTERNAL_ERROR` | Não foi possível concluir agora. |
| Dependência indisponível | 502/503 | `EXTERNAL_SERVICE_ERROR` | Um serviço parceiro está indisponível. |
| Timeout externo | 504 | `EXTERNAL_SERVICE_TIMEOUT` | O serviço parceiro demorou para responder. |
| Banco sem migration/coluna | 503 | `SERVICE_NOT_READY` | O serviço está sendo preparado. |
| Banco indisponível | 503 | `DATABASE_UNAVAILABLE` | O serviço está temporariamente indisponível. |

Mensagens que nunca podem aparecer na UI:

- `relation "..." does not exist`
- `duplicate key value violates unique constraint`
- `QueryFailedError`, `SQLSTATE` ou SQL
- `ECONNREFUSED`, `ENOTFOUND`, `AxiosError`
- stack trace, caminho de arquivo ou conteúdo HTML de proxy
- objeto AWS/Asaas/Google/QUALP, headers, bearer token, API key ou senha

## P0 — bloqueadores de produção

| Risco | Evidência principal | Impacto | Correção necessária |
|---|---|---|---|
| Reset de senha alterava a senha antes de validar o código | `src/components/auth/auth.service.ts`, `changePasswordByRecoveryCode` | Takeover de empresa | **Corrigido nesta revisão:** código válido, telefone e expiração são verificados sob lock; senha e consumo do código usam a mesma transação. Ainda falta rate limit. |
| Ativação pública de contato | `auth.controller.ts`, `POST /auth/update-company-login` | Definição arbitrária de e-mail/CPF/senha por `contactId` | Exigir convite assinado, expiração, uso único e prova de posse. |
| JWT de integração aceito como JWT da empresa | `integrations.service.ts`, `jwt-auth-guard.ts` | Escalada para rotas protegidas | Secrets/audience/issuer/tipo separados; validar empresa, tenant e token type. |
| API SDR sem guard aplicado | `sdr.controller.ts`; fallback em `api-key.guard.ts` | Exposição de CPF, telefone, e-mail e métricas | Aplicar guard global ao controller, remover fallback e rotacionar chave. |
| Webhook Asaas sem autenticação/idempotência | `webhook.assas.controller.ts`, `webhook.assas.service.ts` | Evento financeiro forjado ou repetido | Validar token/assinatura e gravar `eventId UNIQUE` antes de processar. |
| Cartão excluído sem autenticação e token serializado | `assas.controller.ts`, `assas.service.ts`, `credit-card.entity.ts` | Exclusão de cartão de outra empresa e vazamento de token | Guard + consulta por `id/companyId`; DTO de saída sem token. |
| Password/hash e PII em entidades/respostas | `company.entity.ts`, `contact-company.entity.ts`, `users-drive.entity.ts` | Vazamento de credencial e dados pessoais | `select:false`, DTOs explícitos de resposta e testes de serialização. |
| Segredos hardcoded | `WHATSCODE`, `fretebras.service.ts`, `sapiens.service.ts` | Uso indevido de contas externas | Revogar/rotacionar, secret manager e limpeza do histórico Git. |
| Endpoints administrativos públicos | `seed`, `sqs`, `fretebras`, `route-cache`, `ui-features` | Custo, fraude, alteração de dados e fila | Autenticação administrativa, RBAC, rate limit e trilha de auditoria. |
| Consumer SQS apaga notificação sem processá-la | `sqs-consumer.service.ts` | Perda silenciosa de notificações | Definir ownership exclusivo da fila ou remover este consumer. |

## P1 — riscos altos

### Autorização e isolamento de empresa

- Fretes são editados/ativados/excluídos por ID sem sempre restringir por
  `companyId` do token.
- Contatos aceitam `companyId` vindo do cliente.
- Mutações de solicitação e rotas consultam apenas o ID.
- Cancelamento Asaas usa `merchantOrderId` sem ownership.
- Reviews podem perder o filtro da empresa por um segundo `.where()`.

Regra obrigatória: toda consulta de recurso privado deve usar, no mesmo `where`,
`{ id, companyId: request.user.sub }`. Para evitar enumeração, recurso inexistente
e recurso de outro tenant devem responder o mesmo `404 RESOURCE_NOT_FOUND`.

### Pagamentos e efeitos externos

- Há transação PostgreSQL aberta durante chamadas Asaas. Rollback local não
  desfaz cliente, cartão, assinatura ou cobrança criada no provedor.
- Não há chave de idempotência nem saga/outbox.
- Webhook registra payload financeiro completo.

Necessário: máquina de estados, idempotency key, inbox/outbox e logs com campos
sensíveis redigidos.

### Serviços externos

ReceitaWS, Asaas, WhatsApp, placas, Sapiens, Z-API, QUALP e partes do Google não
possuem política uniforme de timeout, retry e circuit breaker. Falha de
dependência deve ser 503/504, nunca 400 e nunca mensagem crua do provedor.

Retentativa automática só é segura em leitura idempotente. Cadastro, pagamento,
publicação, upload e criação de frete exigem idempotency key antes de retry.

### Consistência de dados

- Criação/atualização de rota altera rota, motorista e frete sem transação única.
- Solicitação de frete mistura banco, notificação e SQS sem outbox.
- Compartilhamento publica na fila antes de concluir baixa de quota/log.
- Upload S3 seguido de falha no banco deixa arquivo órfão.
- Cache QUALP usa apenas origem/destino, embora o resultado varie por eixos,
  combustível, consumo e tipo de rota.
- Cache Sapiens ignora usuário, data e tipo de cotação.

### Frontend

- Token em `localStorage` aumenta o impacto de XSS; migrar para cookie
  `HttpOnly`, `Secure`, `SameSite` com proteção CSRF.
- Permissão visual com fallback `*` não pode substituir autorização do backend.
- Tela de assinatura e relatórios contêm fluxos mockados apresentados como
  reais; devem ficar claramente marcados ou indisponíveis fora de demo.
- Hooks que convertem falha em `0`/lista vazia escondem indisponibilidade.
- Ações de aceitar/rejeitar solicitação precisam aguardar a Promise e mostrar
  sucesso somente após confirmação.
- Chave e dados enviados ao Gemini não devem sair diretamente do browser.

## P2 — confiabilidade e operação

- `/healthcheck` não consulta banco nem confirma versão das migrations.
- CORS e Swagger estão abertos.
- JSON global aceita 50 MB.
- Não há schema fail-fast para variáveis de ambiente.
- Cron executa em toda réplica sem lock distribuído.
- Paginação não limita `take` e pode calcular offset negativo.
- TypeScript não está em modo estrito.
- Local pode atingir AWS/S3/WhatsApp/Google reais mesmo com jobs de background
  desativados; falta `EXTERNAL_INTEGRATIONS_ENABLED=false` por padrão.
- Redis não é usado em runtime. A dependência `ioredis` sozinha não justifica um
  container Redis.

## Checklist de aceite

Antes de produção:

1. Todos os P0 fechados e segredos rotacionados.
2. Teste de contrato garante que cada endpoint retorna `errorCode` estável.
3. Teste negativo garante ausência de SQL, stack, hash, token e PII.
4. Testes de tenant tentam acessar cada recurso com empresa diferente.
5. Webhook duplicado é aceito sem repetir efeito.
6. Operações externas possuem timeout e idempotência.
7. Readiness falha quando migration mínima ou banco não estão disponíveis.
8. Frontend diferencia erro, vazio real e carregamento.
9. Logs usam `requestId` e redigem payloads sensíveis.
10. Ambiente local não chama integrações reais sem opt-in explícito.
