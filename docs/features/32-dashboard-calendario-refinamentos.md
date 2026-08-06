# Spec 32 — Dashboard, calendário e refinamentos de UI (Ciclo 2, Fase 4)

> Revisa o Spec 23 (dashboard), Spec 05 (calendário), Spec 12/13 (timeline/checklist) e a lista de locações (Spec 08).
> Fonte: [docs/alteracao/plano_alteracoes_acimm_ciclo2.md](../alteracao/plano_alteracoes_acimm_ciclo2.md) §1, §2, §3.1, §3.3, §3.4.
> Última fase do Ciclo 2 — refinamentos de leitura/relatório. Sem mudança estrutural de regra de negócio.

---

## 1. Objetivo

Sete refinamentos de UI/leitura pedidos após o uso: (1.1) receita com filtro de período e **salas × coffee separados**; (1.3) acesso ao **histórico** de locações; (1.4) **exportar o mês em PDF**; (2.1) **coffee com horário** no calendário; (2.2) ocupação mais visual no seletor de datas; (3.1) **busca por código do associado**; (3.3) timeline vira **checklist** (pendente/concluída); (3.4) **observações internas** na locação.

---

## 2. Migration 0064 (`dashboard_refinamentos`)

- `locacoes.observacoes_internas text` (nullable) — §3.4.
- `buscar_associados` (drop+create+regrant — muda `RETURNS TABLE`): retorna `codigo_sophus integer` e passa a casar também por **código** (prefixo, quando o termo é numérico), além de nome/razão (full-text) e documento (prefixo). §3.1. `associados.codigo_sophus` **já existe** (integer, espelho Sophus).
- `agenda_no_intervalo` (drop+create+regrant — muda `RETURNS TABLE`): `left join coffee_breaks` e devolve `coffee_horario_servir timestamptz`. §2.1.

> `associados` não precisa de DDL (coluna já existe). Nenhuma mudança em RLS.

---

## 3. Itens

### 3.1 Receita com período + salas × coffee (§1.1)
- `src/lib/dashboard/dados.ts`: a query do mês passa a puxar `valor_salas_centavos`/`valor_coffee_centavos` (hoje só `valor_total_centavos`) e agregar em **dois baldes** (`receitaSalasCentavos`, `receitaCoffeeCentavos`) sobre os status de `RECEITA`. Aceitar um **range `{de, ate}`** (default = mês corrente) em vez do mês fixo.
- `src/lib/dashboard/tipos.ts`: `CardsIndicadores` += `receitaSalasCentavos`/`receitaCoffeeCentavos`.
- `src/app/admin/(painel)/page.tsx`: card "Receita" mostra salas e coffee discriminados + total; seletor de período (date-range) que recarrega o dashboard (via searchParams `?de=&ate=`, revalidação server-side). Finalidade: relatório à diretoria.

### 3.2 Histórico de locações (§1.3)
- A lista `/admin/locacoes` (vista `todas`) **já inclui** concluídas/canceladas/retroativas e **já tem** range de datas (`de`/`ate`). Ajustes: (a) **filtro por associado** (id) além da busca textual; (b) corrigir a lista de formas do filtro (`FORMAS_VALIDAS`) para incluir `transferencia`/`cartao`/`dinheiro` (hoje desatualizada); (c) atalho "Ver histórico" no dashboard apontando para `/admin/locacoes?vista=todas`.
- Cada item já abre o detalhe com a timeline/checklist (3.3).

### 3.3 Exportar mês em PDF (§1.4)
- Novo `src/lib/relatorios/pdf-mes.tsx` no padrão `@react-pdf` (igual a `coffee/pdf-compras.tsx`: `renderToBuffer`, `StyleSheet`, logo do disco, paleta azul ACIMM). Conteúdo: relação do período (data, sala, associado, evento, forma, valor), **subtotais salas/coffee**, total geral, contagem. Respeita o período do filtro ativo (3.1).
- Entrega via server action retornando `{ base64, nome }` + download client-side (padrão de `coffee/actions.ts` → `coffee-client.tsx`). Botão "Exportar mês em PDF" no dashboard.

### 3.4 Coffee no calendário com horário (§2.1)
- Cadeia: RPC `agenda_no_intervalo` (§2) → `LinhaRpc` (`calendario/dados.ts`) += `coffee_horario_servir` → `AgendaItem` (bloco `origem='locacao'`) += `coffeeHorarioServirUtc` → render em `ResumoHover` (`evento-conteudo.tsx`) e `DetalheSheet` (`detalhe-sheet.tsx`) com `horaSP(...)` ("Coffee às HH:mm").

### 3.5 Ocupação mais visual (§2.2)
- `src/components/ui/date-picker.tsx`: trocar o `modifiersClassNames.ocupado` (hoje um dot `after:*` âmbar) por **fundo do dia inteiro** (ex.: `bg-amber-500/15 text-amber-700 rounded-md`, preservando o estado selecionado). Ponto único de mudança; `modifiers` inalterado.

### 3.6 Busca por código do associado (§3.1)
- RPC em §2. `AssociadoBusca` (`admin/.../locacoes/nova/tipos.ts`) += `codigoSophus`; `buscarAssociadosAction` mapeia o campo; `AssociadoAutocomplete` exibe o código na linha e no placeholder ("nome, razão social, documento ou código").

### 3.7 Timeline vira checklist (§3.3)
- Núcleo puro novo `src/lib/locacoes/checklist-core.ts` (+ teste): dado `status` + presença de `contrato`/`pagamentos` + flags de adicionais (`aprovacao_status`/`disponibilidade_status` da Fase 2), projeta as etapas do fluxo ideal com estado `pendente|concluida`. Etapas: contrato enviado, contrato assinado, pagamento recebido, e — quando houver adicional com flag — arte de divulgação aprovada / cozinha confirmada.
- Admin: componente ao lado de `linha-do-tempo.tsx` (que continua sendo a auditoria append-only). Pendente em vermelho / concluída em azul.
- Portal: evolui o `stepper-status.tsx` para o mesmo checklist (derivado de `LocacaoPortalDetalhe`), sem expor dados internos.

### 3.8 Observações internas (§3.4)
- Coluna em §2. `carregarLocacao` (`lib/locacoes/dados.ts`) expõe `observacoesInternas`; `LocacaoDetalhe` += campo. Editor no detalhe admin (textarea + server action `salvarObservacoesInternas`, `requireColaborador`), **visível só à equipe** (nunca no portal). Auditoria opcional em `locacao_eventos`.

---

## 4. Critérios de aceite
- [ ] Dashboard: receita separada salas × coffee, com seletor de período; total confere.
- [ ] "Exportar mês em PDF" gera o relatório do período com subtotais e identidade ACIMM.
- [ ] Histórico acessível pelo dashboard; filtro por associado e por período; formas completas.
- [ ] Coffee aparece no calendário com o horário de servir (hover + detalhe).
- [ ] Seletor de datas destaca o dia inteiro ocupado (sem o pontinho).
- [ ] Busca de associado encontra por código (além de nome/razão/documento); código visível.
- [ ] Timeline mostra etapas pendentes (vermelho) × concluídas (azul), incl. flags de adicionais.
- [ ] Observações internas salvam e aparecem só no admin.
- [ ] `npm run build` + testes passam (incl. teste puro do checklist).
