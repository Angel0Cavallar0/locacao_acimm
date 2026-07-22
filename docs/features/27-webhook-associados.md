# Spec 27 — Sincronizar associados via webhook (sob demanda)

> Botão em `/admin/associados` que aciona o workflow externo de sincronização
> (Sophus → associados), com URL configurável em Configurações › Webhooks e um
> cooldown de 10s no botão.

## Contexto
A sincronização Sophus → `associados` roda por agendamento no serviço de automação; não havia
gatilho manual. Agora o colaborador pode acionar sob demanda. A aplicação **nunca fala com o
Sophus direto** — só dispara o webhook (fire-and-forget); a base é atualizada em background.

## Como funciona
- **Config** (`configuracoes.webhook_associados = {"url": "..."}`, migration **0057**): editável
  em **Configurações › Webhooks** (`/admin/configuracoes/webhooks`, admin only). URL em branco =
  botão de sincronizar indisponível.
- **Disparo** ([lib/associados/webhook.ts](../../src/lib/associados/webhook.ts)):
  `dispararWebhookAssociados()` lê a URL e faz `POST` (JSON `{origem, solicitadoEm}`) com
  `AbortSignal.timeout(15000)`. Erros de rede/status viram mensagem amigável.
- **Botão** (`/admin/associados`, `requireColaborador`): action
  `sincronizarAssociadosAction()` → toast "Sincronização iniciada" + **cooldown de 10s**
  (contagem 10→0, botão desabilitado). Em erro, não entra em cooldown (permite corrigir/retentar).

## Segurança
- **Configurar** a URL: admin (`/admin/configuracoes` é `requireAdmin`).
- **Disparar**: colaborador (`/admin/associados` é `requireColaborador`).
- URL guardada em `configuracoes` (service role); nenhuma tabela/RLS nova.

## Fora de escopo
- Header de autenticação extra no webhook (a URL do n8n já é o segredo) — extensível depois.
- Ler status/progresso da sincronização (o disparo é fire-and-forget).
