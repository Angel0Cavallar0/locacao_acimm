# Spec 26 — Coffee break vinculado a combo (desconto multi-sala)

> Um combo `desconto_multi_sala` passa a poder exigir um **coffee break** como
> condição do desconto: **Sala X + Sala Y + Coffee Break Z = desconto nas salas**.

## Regra — 3 modos de exigência de coffee
1. **Nenhum**: o combo não exige coffee (comportamento padrão).
2. **Nível específico** (Coffee Break Z): o desconto só se aplica se a reserva incluir
   exatamente esse nível.
3. **Qualquer coffee**: o desconto só se aplica se a reserva incluir **algum** coffee break — o
   associado escolhe o nível livremente.

Em todos os casos: o coffee é **cobrado normalmente** (faixas do nível); o desconto incide
**só nas salas**. **Escopo: só `desconto_multi_sala`**. **Servidor é a autoridade**:
`calcularValores` recalcula a elegibilidade (motivo `coffee_faltando`); combo inelegível é
rejeitado no submit (o client não injeta desconto).

## Modelo de dados
- `combos.coffee_nivel_id uuid references coffee_niveis(id)` (migration **0055**, nullable) —
  nível específico.
- `combos.coffee_qualquer boolean not null default false` (migration **0056**) — exige qualquer
  coffee. Mutuamente exclusivos (nível específico vence). Só o multi-sala usa (a action grava
  null/false nos demais tipos). Sem mudança de RLS.

## Fluxo
- **Cadastro** (`/admin/salas/combos/novo` e `/[id]`): no bloco multi-sala, select "Coffee
  break obrigatório (opcional)" com **Nenhum / Qualquer coffee break / {níveis ativos}**
  (`listarNiveis(true)`).
- **Elegibilidade** ([combo-core.ts](../../src/lib/locacoes/combo-core.ts)): novo motivo
  `coffee_faltando`; checado **após** salas/período. Testado em `combo-core.test.ts`.
- **Cálculo** ([calcular.ts](../../src/lib/locacoes/calcular.ts) → `avaliarCombo`): passa
  `input.coffee?.nivelId` como coffee selecionado; `ComboInfo.coffeeNivelId` exposto à UX.
- **Formulários de locação** (portal + assistido): ao selecionar o combo, o coffee é
  **incluído** (toggle "incluir coffee" travado ligado). Se o combo fixa um nível, o `<select>`
  de nível também é travado; se for "qualquer", o associado escolhe o nível. Notas: "Este combo
  inclui o coffee break Z — nível fixado." / "Este combo exige um coffee break — escolha um
  nível." `?combo=` pré-seleciona tudo.
- **Disponibilidade**: o pop-up do combo e os cards mostram "Inclui o coffee break Z" ou
  "Exige um coffee break (qualquer nível)".
- **Reagendamento** ([reagendamento.ts](../../src/lib/locacoes/reagendamento.ts)): revalida o
  combo com o coffee atual da locação (não muda no reagendamento).

## Fora de escopo
- Não descontar/zerar o preço do coffee (desconto só nas salas).
- Não vincular coffee a `assinatura_mensal`/`evento_privativo`.
