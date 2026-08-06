# Spec 29 — Comissões (nova regra) + "Pendentes" (Ciclo 2, Fase 1)

> Revisa o **Spec 21** (comissões) e o **Spec 19** (lista de espera). Depende: Spec 06 (hooks/máquina de estados), Spec 14 (pagamentos/quitação), Spec 23 (dashboard).
> Fonte: [docs/alteracao/plano_alteracoes_acimm_ciclo2.md](../alteracao/plano_alteracoes_acimm_ciclo2.md) §5, §3.5, §1.2 — regra de comissões detalhada pela Iasmin.
> Estado do banco: tabelas transacionais **vazias** (0 comissões/pagamentos/locações) → **sem backfill**. `configuracoes.comissoes` **já está `{locacao:5%, coffee:3%}` e LIGADO**.

---

## 1. Objetivo

Mudar o **fato gerador** e a **régua temporal** das comissões: a comissão nasce no **recebimento do pagamento** pela ACIMM (não na contratação), com competência = **mês da quitação total**, e é paga **no mês seguinte**. Cálculo **por componente** (sala 5%, coffee 3%, adicionais 0%). A tela passa a ter **três visões** (a pagar / duas previsões) e controle **pago/não-pago** por linha. As comissões **saem do dashboard** (§1.2). A lista de espera é reenquadrada como **"Pendentes"** (§3.5).

Ordem do fluxo: **Contratação → Pagamento → Comissão**. A data de contratação é só registro.

---

## 2. O que muda em relação ao Spec 21

| Aspecto | Spec 21 (hoje) | Spec 29 (novo) |
|---|---|---|
| Fato gerador | transição `confirmada` | idem (é o momento da quitação — ver §3) |
| Competência | mês do **evento** (`inicio`) | mês da **quitação** (`max(baixa_em)`), fallback `now` |
| Base sala | salas − descontos **+ adicionais** | salas − descontos (**sem** adicionais) |
| Adicionais | entravam na base da sala | **0% — fora da base** |
| Percentuais | 0/0 desligado | **5% / 3% ligado** (já na config) |
| Controle na tela | `exportada` / `estornada` | **pago / não-pago** + 3 visões |
| Vínculo | locação + origem | locação + origem (mantido) + snapshot do recebimento |

**Não** mover a geração para `darBaixaPagamento`/`confirmarSeQuitada`: `confirmada` só é alcançável de `aguardando_pagamento` e já é disparada exatamente na quitação total; a isenção total chama `aplicarTransicao(→confirmada)` direto. Manter a geração como efeito pós-commit de `confirmada` preserva idempotência e o isolamento de falhas.

---

## 3. Migrations (0058+)

### 3.1 `comissoes` — snapshot do recebimento + controle pago
```sql
alter table comissoes
  add column pago boolean not null default false,
  add column pago_em timestamptz,
  add column pago_por uuid references auth.users(id),
  add column recebido_em timestamptz,               -- = max(baixa_em) dos pagamentos quitados
  add column forma_pagamento text,                  -- snapshot; 'multiplas' na divisão híbrida
  add column pagamento_id uuid references pagamentos(id);  -- NULLABLE — só no pagamento único
```
- **Manter** `estornada_em`, `base_centavos`, `percentual` e o índice único parcial `(locacao_id, origem) where estornada_em is null`. `competencia` **passa a significar mês da quitação** (índice `comissoes_competencia_idx` segue válido).
- `exportada` é **congelada** (não removida agora, para não recriar dependências à toa; o app deixa de usá-la).
- `pagamento_id` **não** é NOT NULL: na divisão híbrida não existe "o pagamento da sala".

### 3.2 `pagamentos` — previsão de recebimento
```sql
alter table pagamentos add column previsao_recebimento date;  -- nullable
```
Alimenta as visões de previsão (§5). Para `boleto_mensalidade`, derivar do ciclo da mensalidade; demais formas ficam nulas (previsão vira heurística rotulada como estimativa).

### 3.3 `forma_pagamento` enum — novas formas (migration ISOLADA)
```sql
alter type forma_pagamento add value if not exists 'cartao';
alter type forma_pagamento add value if not exists 'dinheiro';
```
`ALTER TYPE ADD VALUE` não pode ser usado na mesma transação em que o valor é referenciado → migration própria, antes das que usam as formas.

### 3.4 Config — já aplicada
`configuracoes.comissoes` já está `{locacao:{ativo:true,percentual:5}, coffee:{ativo:true,percentual:3}}`. Nenhuma migration de config necessária; o código novo sobe antes que isso importe (0 dados).

---

## 4. Geração (hook `confirmada`) e estorno

### 4.1 Geração — `src/lib/comissoes/`
- **Base por componente** (`comissoes-core.ts::baseLocacao`): remover o termo de adicionais → `sala = valorSalas − valorDescontos` (nunca < 0). Coffee = `valorCoffee` a 3%. Adicionais **não geram linha**.
- **Competência** (`geracao.ts::gerarComissoesConfirmada`): `max(baixa_em)` dos pagamentos `pago` da locação; **fallback = `now` em SP** quando não há baixa (confirmação manual com pendente / isenção parcial). **Nunca** competência nula.
- **Snapshots**: gravar `recebido_em = max(baixa_em)`; `forma_pagamento` = a forma quando há 1 pagamento pago, `'multiplas'` quando há 2+; `pagamento_id` só quando há exatamente 1.
- **Isenção total** (todos os itens `isento`, sem recebimento): `max(baixa_em)` nulo e sem `pago` → **não gera comissão** (fato gerador é o recebimento). Documentado e intencional.
- **Misto isento+pago**: gera comissão sobre a base do snapshot **e marca para revisão** (parte foi dispensada; a base ainda reflete o valor cheio — a equipe confere). Sinalizar na linha (ex.: flag/observação).
- Idempotência mantida pelo índice único parcial (23505 ignorado).

### 4.2 Estorno — `estornarComissoesLocacao` (efeito `cancelada`)
- "Não existe estorno após pagamento" refere-se à comissão **já paga ao colaborador** (`pago=true`), não à sua existência.
- Reverter (carimbar `estornada_em`) **somente linhas `pago=false`**.
- Linhas `pago=true` **permanecem** + disparam aviso interno (mesmo padrão atual do `exportada` → `notificarComissaoEstornada`), como ajuste manual.
- Cancelamento antes de qualquer quitação: não há comissão (geração é na quitação) → no-op.

### 4.3 Reconciliação (novo — obrigatório)
Como as comissões agora estão **ligadas** e os efeitos são best-effort/silenciosos (`dispararEfeitos` engole exceções), uma falha transitória vira comissão faltante sem retry. Adicionar:
- **Leitura** "locações confirmadas com recebimento real (≥1 pagamento pago) **sem** comissão viva para uma origem ativa" — exibida na tela de comissões (aviso/contador).
- **Ação de reparo** (idempotente): reexecuta `gerarComissoesConfirmada` para as locações listadas.

---

## 5. Tela `/admin/comissoes` — três visões

Substitui o modelo `exportado/estornado` por **3 visões** + **pago/não-pago** por linha.

1. **Mês Atual — a pagar** (dado real, das linhas gravadas): `competencia ≤ mês anterior AND estornada_em is null AND pago=false`. Inclui atrasadas/retroativas (não usar `= mês anterior` estrito). Ex.: em julho aparecem as comissões de pagamentos quitados em junho (ou antes, se ainda não pagas).
2. **Próximo Mês — previsão** (calculada **on the fly**, não grava linha): comissões dos pagamentos previstos para quitar no **mês atual** (via `pagamentos.previsao_recebimento` para boleto de mensalidade; heurística rotulada como estimativa para as demais formas).
3. **Daqui a Dois Meses — previsão** (on the fly): locações fechadas agora cujo pagamento cai no **boleto de mensalidade do próximo mês** (`previsao_recebimento` no mês seguinte).

- **Controle por linha:** `pago` / `não pago` (ação "marcar paga" → grava `pago/pago_em/pago_por`). As previsões (2 e 3) são projeções — deixam claro que são estimativas e **nunca** gravam em `comissoes`.
- **Tabela:** LOC-nº (link), locatário, origem (badge sala/coffee), base, percentual, valor, `recebido_em`, `forma_pagamento`, competência, pago.
- **Totais do filtro:** por origem + geral.
- **Config (admin only)** na própria tela: percentuais e toggles (já ligados 5/3), aviso "vale para novas confirmações".
- **CSV** (`csv-core.ts` / `gestao.ts`): reflete a **visão selecionada**; colunas passam a incluir `recebido_em`/`forma_pagamento`/`pago` no lugar de `exportada`. BOM UTF-8 + `;` mantidos.

---

## 6. Dashboard (§1.2) — remover comissões

- Remover o card "Comissões do mês" de `src/app/admin/(painel)/page.tsx` e as agregações `comissoesMes*`/`comissoesAExportar*` de `src/lib/dashboard/dados.ts` (o descasamento de datas do boleto da mensalidade tornava o card enganoso). Comissões passam a viver **só** no módulo próprio.

---

## 7. "Pendentes" (§3.5) — reenquadrar a lista de espera

- A lista de espera passa a operar como **reservas pendentes de confirmação do interessado**: **sem** substituição automática de locação; apenas **mudança de status** quando confirmada (a conversão atual já não substitui — cria via assistida mantendo o vínculo). Mantém a notificação interna quando a vaga abre.
- Escopo majoritariamente de **rótulo/cópia**: label na sidebar, título da tela, textos em `src/lib/lista-espera/tipos.ts`. **Sem migration.**

---

## 8. Critérios de aceite

- [ ] Locação com 1 pagamento PIX baixado hoje → 1 linha sala (base = salas−descontos, **sem** adicionais) + 1 coffee (se houver), competência = mês corrente.
- [ ] Adicionais presentes → **nenhuma** comissão de adicional; base da sala não os inclui.
- [ ] Baixa retroativa (`baixa_em` 2 meses atrás) → competência naquele mês passado; aparece na visão "a pagar" como devida.
- [ ] Divisão híbrida (2 pagamentos, formas/datas diferentes) → linhas sala+coffee únicas, `recebido_em = max(baixa_em)`, `forma_pagamento = 'multiplas'`, sem duplicar.
- [ ] Isenção total → **sem** comissão. Misto isento+pago → gera + marcada para revisão.
- [ ] Confirmação manual com pagamento pendente → competência = `now` (fallback), nunca nula.
- [ ] Estorno de um pagamento (status segue `confirmada`) → nova baixa **não** duplica comissão (idempotência).
- [ ] Cancelar antes do pagamento da comissão (`pago=false`) → estornada. Cancelar depois (`pago=true`) → mantida + aviso interno.
- [ ] Mudar percentual após gerar → linhas gravadas inalteradas (snapshot); só as previsões refletem a nova config.
- [ ] Falha simulada do efeito → a reconciliação lista a confirmada-sem-comissão; reparo gera sem duplicar.
- [ ] Três visões batem com a régra (a pagar = quitados até mês anterior não pagos; previsões rotuladas como estimativa e sem gravar).
- [ ] CSV reflete a visão selecionada; BOM/acentuação ok no Excel.
- [ ] Dashboard sem card de comissões; nenhuma referência quebrada.
- [ ] Lista de espera exibida como "Pendentes"; fluxo de conversão e aviso de vaga preservados.
