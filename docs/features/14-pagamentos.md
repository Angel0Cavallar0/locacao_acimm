# Spec 14 — Pagamentos (Bloco D, parte 2)

> Depende: Spec 06 (máquina de estados/hooks) e Spec 12 (comprovante do associado — o circuito fecha aqui).
> **Independente do Spec 13** (que pode vir depois): a migration abaixo faz seed idempotente de `dados_pagamento` — quem rodar primeiro cria, o outro ignora.
> Referência: CLAUDE.md §8.9/§8.12, planilha atual (pagamentos híbridos são comuns).
> Baixa é MANUAL na v1 — detecção automática segue fora de escopo (CLAUDE.md §12).

---

## 1. Objetivo

Ao chegar em `aguardando_pagamento`, a locação ganha registros de pagamento (um ou vários — híbrido), o locatário recebe as instruções, envia comprovante (Spec 12), o colaborador dá baixa e, quitado tudo, a locação vira `confirmada` sozinha. Isenção flui sem fricção.

## 2. Migration `0020_pagamentos`

```sql
alter table pagamentos add column observacao text;  -- ex.: "boleto enviado em 10/08", nº do boleto

insert into configuracoes (chave, valor, descricao) values
('dados_pagamento', '{"banco":"SICREDI","codigo_banco":"748","agencia":"0718","conta":"91717-2","pix":""}',
 'Dados bancários exibidos no contrato e nas instruções de pagamento')
on conflict (chave) do nothing;  -- idempotente com a 0019 (Spec 13)
```

**Decisão (v1):** boleto NÃO é anexado no sistema — a emissão é externa (Sicredi) e a instrução ao locatário informa que o boleto será enviado pela ACIMM (mensalidade entra na cobrança mensal). O campo `observacao` registra referências. Anexo de boleto pode virar melhoria futura se a ACIMM pedir.

## 3. Criação dos pagamentos — hook `aguardando_pagamento`

Registrado em `lib/locacoes/efeitos.ts`:
- **Padrão:** um único `pagamentos` com `valor_centavos = valor_total_centavos` e `forma = forma_pagamento_preferida`, descrição "Locação completa", status `pendente`.
- **Isenção:** `forma_pagamento_preferida = 'isento'` OU `valor_total = 0` → pagamento único status **`isento`** e, na sequência, **auto-transição → `confirmada` (autor Sistema)** — isenção não espera baixa de R$ 0.
- Idempotente: se a locação já tem pagamentos (reentrada no estado após estorno), não duplica.
- Hook de notificação das instruções (no-op até o Spec 15).

## 4. Gestão no detalhe da locação (seção Pagamentos acende — admin)

Disponível a partir de `aguardando_pagamento`:
- **Lista**: descrição, forma, valor, status (badge), comprovante (miniatura/ícone → URL assinada), observação, baixa (quem/quando).
- **Dividir/editar** (enquanto TODOS pendentes): recompor os registros — ex. híbrido clássico da planilha: "Coffee — R$ 350 — Boleto Mensalidade" + "Locação — R$ 800 — Pix". Validação dura: **Σ valores = `valor_total_centavos`** (nem mais, nem menos); formas do enum (com `transferencia`; `isento` aqui só via recomposição consciente com confirmação). Após a primeira baixa, estrutura congela (só estorno reabre).
- **Dar baixa** (`darBaixaPagamento`): dialog com confirmação, data efetiva opcional (default agora; não-futura), observação; grava `status = 'pago'`, `baixa_por`, `baixa_em`; linha do tempo ("Pagamento X baixado — {colaborador}").
- **Estornar** (`estornarPagamento`): motivo obrigatório → `status = 'estornado'` + cria novo registro `pendente` equivalente (histórico preservado; nunca reescreve o pago). Linha do tempo registra.
- **Quitação total:** quando todos os pagamentos da locação estão `pago`/`isento` E o status é `aguardando_pagamento` → **auto-transição → `confirmada` (Sistema)**. Estorno depois disso NÃO regride o status sozinho (alerta no detalhe; regressão é decisão humana via cancelamento se preciso).

## 5. Portal do associado (seção do Spec 12 acende)

Por pagamento `pendente`, instruções conforme a forma (dados de `configuracoes.dados_pagamento`):
- **Pix:** chave em destaque + copiar (chave vazia na config → orientação de contato);
- **Transferência:** banco/agência/conta formatados;
- **Boleto avulso / Mensalidade:** "O boleto será enviado/lançado pela ACIMM" + contato;
- Envio de comprovante (já implementado no Spec 12) e status em tempo real; pagamento `pago` mostra confirmação e data.

## 6. Casos de borda
- **Cancelar locação com pagamento `pago`:** permitido (motivo obrigatório) com alerta explícito "há pagamento baixado — trate reembolso/crédito fora do sistema"; linha do tempo registra o aviso aceito.
- **Comprovante enviado ≠ baixa:** comprovante nunca muda status sozinho — apenas sinaliza (badge "comprovante recebido" na lista de locações/pendências do dashboard futuro).
- Locação que regride por estorno + recomposição mantém trilha completa em `locacao_eventos`.

## 7. Critérios de aceite
- [ ] `aguardando_pagamento` cria o pagamento padrão; reentrada não duplica.
- [ ] Isenção: pagamento `isento` + `confirmada` automática, sem ação do colaborador.
- [ ] Divisão híbrida: soma validada ao centavo; estrutura congela após primeira baixa; recomposição só via estorno.
- [ ] Baixa e estorno com autor/data/motivo na linha do tempo; estorno preserva o registro pago e cria pendente novo.
- [ ] Quitação total transiciona para `confirmada` (Sistema) exatamente uma vez (teste com 2 baixas simultâneas — lock da máquina segura).
- [ ] Portal mostra instruções corretas por forma a partir da config; comprovante não altera status.
- [ ] Cancelamento com pago exige aceite do alerta e registra.
- [ ] Migration 0020 idempotente com a 0019 (aplicável em qualquer ordem).
