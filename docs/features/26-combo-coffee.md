# Spec 26 — Coffee break vinculado a combo (desconto multi-sala)

> Um combo `desconto_multi_sala` passa a poder exigir um **coffee break** como
> condição do desconto: **Sala X + Sala Y + Coffee Break Z = desconto nas salas**.

## Regra
- **Coffee obrigatório**: o desconto nas salas só se aplica se a reserva incluir exatamente o
  nível de coffee vinculado ao combo. Sem o coffee (ou com outro nível) → combo **não aplica**.
- O coffee é **cobrado normalmente** (faixas de preço do nível). O desconto incide **só nas
  salas** — nada muda no preço do coffee.
- **Escopo: só `desconto_multi_sala`** (assinatura/evento privativo não têm o campo).
- **Servidor é a autoridade**: `calcularValores` recalcula a elegibilidade a partir da
  definição do combo + do coffee da reserva; combo inelegível é rejeitado no submit (o client
  não injeta desconto).

## Modelo de dados
- Coluna `combos.coffee_nivel_id uuid references coffee_niveis(id)` (migration **0055**),
  nullable. Só o multi-sala usa (a action grava null nos demais tipos). Sem mudança de RLS.

## Fluxo
- **Cadastro** (`/admin/salas/combos/novo` e `/[id]`): no bloco multi-sala, select "Coffee
  break obrigatório (opcional)" com os níveis ativos (`listarNiveis(true)`).
- **Elegibilidade** ([combo-core.ts](../../src/lib/locacoes/combo-core.ts)): novo motivo
  `coffee_faltando`; checado **após** salas/período. Testado em `combo-core.test.ts`.
- **Cálculo** ([calcular.ts](../../src/lib/locacoes/calcular.ts) → `avaliarCombo`): passa
  `input.coffee?.nivelId` como coffee selecionado; `ComboInfo.coffeeNivelId` exposto à UX.
- **Formulários de locação** (portal + assistido): ao selecionar o combo, o coffee do nível Z
  é **incluído e travado** (o associado só informa quantidade/adicionais). Nota "Este combo
  inclui o coffee break Z". `?combo=` pré-seleciona tudo.
- **Disponibilidade**: o pop-up do combo e os cards mostram "Inclui o coffee break Z".
- **Reagendamento** ([reagendamento.ts](../../src/lib/locacoes/reagendamento.ts)): revalida o
  combo com o coffee atual da locação (não muda no reagendamento).

## Fora de escopo
- Não descontar/zerar o preço do coffee (desconto só nas salas).
- Não vincular coffee a `assinatura_mensal`/`evento_privativo`.
