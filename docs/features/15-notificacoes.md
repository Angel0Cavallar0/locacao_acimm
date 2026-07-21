# Spec 15 — Notificações WhatsApp + E-mail (Bloco D, parte 3)

> Depende: Spec 06 (hooks de efeitos). Preenche os no-ops registrados nos Specs 06/11/12/13/14.
> Referência: CLAUDE.md §8.10, §6.5. Tabela `notificacoes` (Spec 02 §5.7) já existe.
> O processamento periódico de retries é agendado no Spec 16 — aqui nasce a função que ele chama.

---

## 1. Objetivo

Toda mudança relevante de status fala com o locatário por **WhatsApp (Evolution) e e-mail (Resend) em par**, via fila com retry. Falha de um canal nunca bloqueia o outro nem a operação que a originou.

## 2. Arquitetura — fila, nunca envio inline

1. **Enfileirar:** hooks inserem linhas em `notificacoes` (uma por canal — par = 2 linhas), status `pendente`, `payload` com as variáveis do template. Inserção é parte do efeito pós-commit; jamais dentro da transação da transição.
2. **Processar:** `processarNotificacoes(limite)` (server-only) consome pendentes em ordem: monta o conteúdo do template, envia pelo canal, marca `enviada` + `enviada_em` ou incrementa `tentativas` + `ultimo_erro`.
3. **Disparo imediato best-effort:** após enfileirar, o hook chama o processamento via `after()` do Next (pós-resposta — não segura o usuário). O **retry** dos que falharem é o cron de 15min (Spec 16) chamando a mesma função.
4. **Backoff e desistência:** reprocessa se `tentativas < 5` respeitando espaçamento crescente (15min → 30 → 60 → 120 → 240, derivado de `tentativas` × última tentativa). Na 5ª falha: status `falha` definitivo → badge "falha de notificação" no detalhe da locação (admin) com **Reenviar** manual (zera tentativas).

## 3. Canais — `lib/notificacoes/canais/`

- **`whatsapp.ts`** (Evolution API v2): `sendText` para o número normalizado. Normalização BR em `lib/utils/telefone.ts`: só dígitos → prefixo 55 → validação de celular (DDD + 9 dígitos); número inválido = falha imediata com erro claro (sem retry inútil — status `falha` direto, motivo "telefone inválido").
- **`email.ts`** (Resend): HTML com identidade ACIMM (layout base único + conteúdo por template), remetente configurável, texto alternativo. 
- Envs via getters lazy (Spec 00 §5). **Canal não configurado**: a linha falha com "canal não configurado" e fica elegível a retry (quando a env entrar, o cron despacha o backlog) — o canal irmão segue normal.
- Nenhuma menção a ferramentas/stack em nenhum conteúdo (CLAUDE.md §1).

## 4. Templates — `lib/notificacoes/templates.ts`

Mapa `template → { whatsapp(payload), email(payload) }`, pt-BR, tom cordial-institucional. Variáveis: nome do locatário, LOC-nº, sala(s), data/horário (Sao_Paulo), valores, motivo, link do portal (**apenas** quando o locatário é associado com conta — não-associado nunca recebe link de login).

| Template | Disparo (hook) | Observações |
|---|---|---|
| `solicitacao_recebida` | `solicitada` | "Recebemos sua solicitação, em análise" |
| `aprovada` | `aprovada` | próximos passos (contrato) |
| `recusada` | `recusada` | **motivo incluso** |
| `contrato_enviado` | efeito do Spec 13 | **anti-duplicação:** no modo e-mail do 13B, o e-mail com o anexo JÁ é a comunicação desse evento — dispara **somente WhatsApp** ("enviamos o contrato no seu e-mail"); no modo Autentique, ambos os canais com o link de assinatura |
| `instrucoes_pagamento` | `aguardando_pagamento` (Spec 14) | instruções por forma, dados de `dados_pagamento` |
| `confirmada` | `confirmada` | confirmação final com todos os detalhes do evento |
| `cancelada` | `cancelada` | motivo; se cancelada pelo próprio associado, vira confirmação do cancelamento |
| `lembrete_pre_evento` | cron (Spec 16) | template definido aqui; disparo lá |

## 5. Notificações internas (para a ACIMM)

Dois eventos avisam a equipe por **e-mail** no endereço de `configuracoes.contato_acimm.email`:
- `interna_nova_solicitacao` (locação criada pelo portal) — "Nova solicitação LOC-nº aguardando análise";
- `interna_comprovante_recebido` (Spec 12) — "Comprovante recebido em LOC-nº".
E-mail da config vazio → skip silencioso (nem enfileira). Sem WhatsApp interno na v1.

## 6. Visibilidade no admin

Seção **Notificações** no detalhe da locação: linhas com canal (ícone), template, destinatário, status (badge), enviada em / tentativas / último erro, ação **Reenviar** por linha. Sem tela global na v1 (o dashboard do Spec 23 pode agregar contadores).

## 7. Regras finas
- Par independente por construção (linhas separadas): WhatsApp inválido não atrasa e-mail e vice-versa.
- `processarNotificacoes` usa `for update skip locked` no consumo — cron e disparo imediato podem coexistir sem processar a mesma linha duas vezes.
- Reenvio manual cria tentativa sobre a MESMA linha (histórico de tentativas preservado em `tentativas`/`ultimo_erro`).
- Conteúdo dos templates com testes de render (snapshot) — payload faltando variável quebra o teste, não a produção (fallbacks seguros).

## 8. Critérios de aceite
- [ ] Cada transição mapeada gera o par (ou só WhatsApp no caso do contrato modo e-mail); linhas corretas em `notificacoes` com payload completo.
- [ ] Falha de um canal não afeta o outro nem a transição (testar com Evolution derrubada: e-mail sai, WhatsApp acumula retry).
- [ ] Backoff respeitado; 5ª falha vira `falha` com badge e Reenviar funcional.
- [ ] Telefone inválido falha imediato com motivo claro, sem consumir 5 tentativas.
- [ ] Canal sem env: backlog acumula e é despachado quando a env entra (teste ligando a env depois).
- [ ] Não-associado jamais recebe link do portal; associado com conta recebe.
- [ ] Notificações internas disparam para o e-mail da config; config vazia não gera lixo na fila.
- [ ] `for update skip locked` comprovado: cron + disparo imediato simultâneos não duplicam envio.
- [ ] Nenhum template menciona ferramentas; visual do e-mail com identidade ACIMM.
