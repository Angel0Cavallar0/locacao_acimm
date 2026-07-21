# Spec 23 — Dashboard Admin (Bloco F, parte 1)

> Depende: praticamente tudo (06, 08, 14, 15, 21 — é por isso que veio por último antes da entrega). Rota: `/admin` (o placeholder do Spec 03 finalmente vira tela real).
> Referência: CLAUDE.md §9.2. Filosofia: **dashboard operacional, não BI** — responde "o que precisa da minha atenção AGORA e como está o mês", em uma tela, sem navegação de períodos históricos (relatórios profundos são evolução futura fora deste escopo).

---

## 1. Objetivo

A primeira tela do dia da Yasmin: pendências acionáveis no topo, indicadores do mês corrente, e a semana à vista — tudo com link direto para agir.

## 2. Layout

```
[ Ação necessária (lista priorizada) ..................... ]
[ Pendentes ] [ Semana ] [ Receita mês ] [ Ocupação ] [ Comissões ]
[ Próximas locações da semana ] [ Ocupação por sala (mês) ]
```

## 3. "Ação necessária" — a lista que manda na tela

Itens agregados de todo o sistema, ordenados por urgência (mais antigo primeiro dentro de cada tipo), cada um com link direto ao alvo; some quando resolvido; máx. 15 exibidos ("+ n outros" expande):

| Item | Fonte | Link |
|---|---|---|
| Solicitação aguardando análise há {n} dias | `solicitada`/`em_analise` | detalhe da locação |
| Comprovante recebido aguardando baixa | pagamento `pendente` com `comprovante_url` (Spec 14) | detalhe → pagamentos |
| Contrato recusado na assinatura | contrato `recusado` (Spec 13B) | detalhe → contrato |
| Notificação em falha definitiva | `notificacoes.status = 'falha'` (Spec 15) | detalhe → notificações |
| Sobreposição pendente na agenda | mesmo cálculo do Spec 05 §5 (próximos 30 dias) | calendário focado |
| Vaga liberada com fila de espera | cancelamentos recentes (7 dias) com fila aguardando (Spec 19 §6) | lista de espera filtrada |
| Evento amanhã sem coffee definido? Não — fora de escopo (não é pendência do sistema) | — | — |

Vazio bem tratado: "Tudo em dia 🎉" (o único emoji permitido no painel).

## 4. Cards de indicadores (mês corrente, fórmulas explícitas)

- **Pendentes de aprovação:** count `solicitada` + `em_analise` (todas, não só do mês).
- **Locações da semana:** count com evento entre hoje e +7 dias, status ≥ `aprovada`.
- **Receita do mês:** Σ `valor_total_centavos` das locações com **data do evento no mês corrente** e status ∈ `confirmada`/`realizada`/`finalizada`. Subtexto: "+ R$ X em andamento" (status `aprovada` → `aguardando_pagamento` do mesmo mês — pipeline, não receita).
- **Ocupação do mês:** períodos bloqueados ÷ períodos disponíveis, onde disponíveis = salas ativas × dias do mês × 3 períodos (manhã/tarde/noite) e bloqueados = slots com ocupação bloqueante intersectando. **Aproximação honesta e documentada no tooltip do card** (dia inteiro conta 3; bloqueios manuais contam como ocupação).
- **Comissões do mês:** Σ não-estornadas com `competencia` = mês corrente; subtexto "R$ X a exportar".

## 5. Painéis inferiores

- **Próximas locações da semana:** lista compacta (até 8): data/hora, sala(s), locatário, badge de status — clique abre o detalhe. Mais que 8 → link "ver todas" (lista filtrada).
- **Ocupação por sala (mês):** barras horizontais (recharts, tokens do tema) — % de ocupação de cada sala ativa no mês corrente, mesma fórmula do card por sala. Sala com regra de período gratuito ativa ganha marcador discreto. É o gráfico que responde "qual sala está ociosa" — insumo direto para ação comercial (histórico por empresa/relatórios ficam para o futuro).

## 6. Técnica

- RSC única com **uma função agregadora** `carregarDashboard()` (server-only) — consultas agregadas count/sum com os índices existentes, nunca N+1; alvo < 500ms no P95 com os volumes reais da ACIMM (dezenas de locações/mês — folga enorme).
- Sem cache além do request (dashboard operacional precisa refletir a baixa que acabou de acontecer); revalidação no focus.
- Guard `requireColaborador()`; nenhum dado novo exposto (tudo já era visível nas telas de origem).
- Skeleton de carregamento por seção; mobile empilha na mesma ordem de prioridade (Ação necessária primeiro).

## 7. Critérios de aceite
- [ ] Cada tipo de item de "Ação necessária" aparece quando a condição existe, some quando resolvida, e o link leva ao lugar exato da ação (teste ponta-a-ponta por tipo).
- [ ] Fórmulas dos 5 cards batem com contagens manuais em cenário de teste montado (incluindo: locação de setembro não entra na receita de agosto; pipeline separado de receita).
- [ ] Ocupação: dia inteiro = 3 períodos, bloqueio manual conta, tooltip explica a fórmula; gráfico por sala soma com o card geral.
- [ ] Comissões do card = tela do Spec 21 no mesmo mês (conferência automática em teste).
- [ ] Tela completa em uma única agregação server-side (sem cascata de requests no client); P95 < 500ms com seed de 200 locações.
- [ ] Vazios tratados em todas as seções; mobile prioriza Ação necessária.
- [ ] Nenhuma informação visível que o role do usuário não veria nas telas de origem.
