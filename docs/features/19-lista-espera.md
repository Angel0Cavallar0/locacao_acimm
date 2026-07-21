# Spec 19 — Lista de Espera (Bloco E, parte 3)

> Depende: Spec 07 (conversão via formulário assistido), Spec 10 (entradas do portal já existem), Spec 15 (template interno novo).
> Referência: CLAUDE.md §9.11, ata ("por data, ordem de chegada, com exibição e contato para fechamento"). Rota: `/admin/lista-espera` (o item da sidebar ganha destino).
> Filosofia: a fila é ferramenta da Yasmin — o sistema organiza e avisa, **quem contata e decide a ordem de fechamento é a equipe** (nenhum disparo automático ao associado).

---

## 1. Objetivo

Colaborador enxerga a fila por data/sala na ordem de chegada, entra em contato em um toque, converte interessado em locação com tudo pré-preenchido, e é avisado quando um horário com fila é liberado.

## 2. Migration `0024_lista_espera`

```sql
alter table lista_espera
  add column arquivado_em timestamptz,
  add column arquivado_por uuid references auth.users(id),
  add column arquivado_motivo text;
-- sem hard delete (padrão do projeto): saiu da fila = convertido OU arquivado
```

## 3. Tela `/admin/lista-espera`

- **Agrupamento por data** (próximas primeiro), dentro da data por sala ("Qualquer sala" em grupo próprio), ordenado por `criado_em` — a **posição na fila é explícita** (nº 1, 2, 3…).
- Cada entrada: nome (badge **associado** com link quando `associado_id`, senão "externo"), contato, observações, entrou em, origem (portal/manual).
- **Filtros:** visão padrão = **aguardando com data futura**; toggles "vencidas" (data passada, ainda aguardando) e "encerradas" (convertidas/arquivadas — com desfecho e autor). Filtro por sala e intervalo de datas.
- **Contato em um toque:** botão WhatsApp (`wa.me/{numero}?text=...` com mensagem pré-pronta: "Olá {nome}! Aqui é da ACIMM — surgiu disponibilidade para {sala} em {data}...") + `tel:`. Só abre o canal — nada é enviado pelo sistema.
- **Adicionar manualmente** (quem liga hoje): dialog com sala (ou "qualquer"), data, busca de associado (autocomplete do Spec 07) OU nome+contato livres, observações. Mesma validação anti-duplicata do portal.

## 4. Conversão em locação (um clique)

- Botão **"Converter em locação"** → `/admin/locacoes/nova?fila={id}` com prefill completo: associado (quando houver) ou nome/contato como externo, sala, data.
- **Ajuste no Spec 07:** a action `criarLocacaoAssistida` aceita `filaEsperaId` opcional — ao criar com sucesso, grava `convertido_locacao_id` na entrada da fila (transação junto) e a linha do tempo da locação registra "Originada da lista de espera".
- Abandonar o formulário não toca na fila (conversão só no submit).
- Entrada convertida exibe o link da locação no histórico da fila.

## 5. Arquivar (saiu da fila sem locar)

- Ação "Arquivar" com motivo opcional (desistiu / não respondeu / resolveu outra data) → `arquivado_em/por/motivo`. Reversível ("Restaurar") enquanto a data não passou.

## 6. Aviso de vaga liberada (o pulo do gato)

Hook nos efeitos de `recusada`/`cancelada` (locações que **eram bloqueantes**) e no remanejamento de sala (Spec 17 §7):
- Se existir fila **aguardando** para a sala liberada (ou "qualquer sala") na data → enfileira notificação interna `interna_vaga_liberada` (padrão do Spec 15 §5, e-mail da ACIMM): "Horário liberado em {sala} {data} — {n} interessado(s) na fila, primeiro: {nome}", com link direto para a tela filtrada.
- Complementa (não substitui) o aviso já existente no painel de remanejamento do Spec 17.

## 7. Critérios de aceite
- [ ] Fila agrupada e ordenada por chegada com posição visível; filtros e visões corretos (futuras/vencidas/encerradas).
- [ ] Link de WhatsApp abre com a mensagem pré-pronta e número normalizado; nada é enviado automaticamente ao interessado.
- [ ] Conversão pré-preenche o assistido, grava `convertido_locacao_id` na mesma transação do submit e registra a origem na linha do tempo; abandono não altera a fila.
- [ ] Arquivar/restaurar com autor e motivo; nada é deletado.
- [ ] Cancelar locação bloqueante com fila na sala/data dispara a notificação interna com contagem e primeiro da fila; sem fila, nenhum ruído.
- [ ] Entrada duplicada (mesmo interessado + sala + data aguardando) bloqueada também no fluxo manual.
- [ ] Portal (Spec 10) intocado e coerente: posição aproximada exibida lá bate com a ordem exibida aqui.
