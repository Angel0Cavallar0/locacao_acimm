# Spec 31 — Sobreposição de eventos + locações retroativas (Ciclo 2, Fase 3)

> Revisa o Spec 02/05/06 (agenda, constraint de exclusão, máquina de estados), o Spec 07/11 (criação assistida/portal) e o Spec 19 (lista de espera).
> Fonte: [docs/alteracao/plano_alteracoes_acimm_ciclo2.md](../alteracao/plano_alteracoes_acimm_ciclo2.md) §7 (sobreposição) e §6 (retroativas).
> Decisão travada: sobreposição autorizável por **qualquer colaborador** (registra quem/quando).

---

## 1. Objetivo

Duas mudanças que se apoiam na mesma camada de agenda:

1. **Sobreposição de eventos (§7):** hoje a disponibilidade é garantida por uma **exclusion constraint** no Postgres (bloqueio absoluto por sala × período). O cliente precisa poder, **só pela via assistida (colaborador)**, colocar duas locações na mesma sala/horário, com pop-up de confirmação e registro de quem autorizou. O associado **nunca** sobrepõe.
2. **Locações retroativas (§6):** o colaborador lança uma locação em **data passada** (evento que já aconteceu) para registro/histórico e régua de comissões, **sem** disparar contrato, cobrança, notificações ao associado ou Google Calendar.

A Fase 3 é a mais sensível porque mexe na **constraint que é a última linha de defesa da disponibilidade**. O ponto central de risco: **uma linha `sobreposicao_autorizada = true` sai inteira do índice GiST parcial** — não conflita com ninguém no banco. Logo a checagem de conflito deixa de poder confiar 100% no banco e precisa subir para o servidor (server actions/RPCs com service role), na **mesma release** da troca da constraint.

---

## 2. Sobreposição — modelo de dados (§7.1)

### 2.1 Colunas novas (migration 0062)
- `locacoes`:
  - `sobreposicao_autorizada boolean not null default false`
  - `sobreposicao_autorizada_por uuid references auth.users(id)`
  - `sobreposicao_autorizada_em timestamptz`
- `agenda_ocupacoes`:
  - `sobreposicao_autorizada boolean not null default false`

Defaults `false` ⇒ **todo o comportamento atual permanece idêntico** (nenhuma locação existente sai da proteção). Eventos internos e bloqueios sempre `false` (não sobrepõem).

### 2.2 Constraint parcial (migration 0062)
A constraint atual (recriada na 0026) é:
```sql
exclude using gist (sala_id with =, periodo with &&) where (bloqueante)
deferrable initially immediate
```
Passa a:
```sql
exclude using gist (sala_id with =, periodo with &&)
  where (bloqueante and not sobreposicao_autorizada)
deferrable initially immediate
```
- **Mesmo nome** `agenda_sem_sobreposicao` (referenciado por `set constraints ... deferred` em `reagendar_locacao` e `transicionar_locacao`) e **mesmo `deferrable initially immediate`** — obrigatório, senão o `set constraints` quebra.
- Recriação por `drop constraint` + `add constraint` (padrão da 0026).
- Rodar `rebuild_agenda_locacao` de todas as locações **antes** do swap não é necessário (base transacional vazia), mas o `rebuild` já popula a coluna nova (item 2.3), então a ordem é: colunas → atualizar `rebuild`/trigger → swap da constraint.
- **Efeito:** o banco continua barrando `comum × comum` (ambas bloqueantes e não autorizadas) — o backstop contra race das locações normais **fica**. O que sai do banco é só o par que envolve uma linha autorizada.

### 2.3 `rebuild_agenda_locacao` + trigger (migration 0062)
- `rebuild_agenda_locacao`: além do que já faz, **grava `sobreposicao_autorizada = v_loc.sobreposicao_autorizada`** na linha da agenda (a flag da locação espelha na ocupação).
- Trigger `locacoes_agenda_sync`: hoje dispara em `after insert or update of status, inicio, fim`. **Adicionar `sobreposicao_autorizada` à lista `OF`** — senão autorizar/desautorizar uma locação já materializada não re-espelharia na agenda.

### 2.4 `agenda_no_intervalo` (migration 0062)
- Adicionar `o.sobreposicao_autorizada` ao retorno da RPC (usada por `descreverConflitoAgenda`, calendário e detecção de sobreposição). `create or replace` mantém grants; retorno muda de forma → o app tipa a coluna nova.

---

## 3. Sobreposição — checagem no servidor (§7.1.3)

Como a linha autorizada some do índice, **o app é a autoridade de conflito**. Padrão em todos os caminhos de escrita: **`pg_advisory_xact_lock(sala)` + checagem de overlap dentro da transação da RPC** (reusa o padrão de `periodo_gratuito_disponivel`, mig 0048), fechando o TOCTOU que o banco não cobre mais para linhas autorizadas.

### 3.1 RPCs recriadas (migration 0063 — `drop + create`, refazendo `revoke/grant`)
Todas ganham, no topo, `perform pg_advisory_xact_lock(hashtext('agenda:'||sala_id))` por sala e uma checagem explícita de overlap bloqueante (via `agenda_ocupacoes`), retornando um sentinela (`'conflito_agenda'`) quando barrado:

- **`criar_solicitacao_portal`** (associado): overlap bloqueante **qualquer** (inclusive autorizado) ⇒ retorna conflito e a solicitação **não** é criada. O portal cria status `solicitada` (não-bloqueante), que **nunca** aciona a constraint — por isso a checagem tem de ser explícita aqui. Sem parâmetro de autorização: **associado nunca sobrepõe**.
- **`criar_locacao_assistida`** (colaborador): ganha `p_sobreposicao_autorizada boolean default false` + `p_autor` (já existe). Se há overlap bloqueante e `p_sobreposicao_autorizada = false` ⇒ retorna conflito (o app abre o pop-up). Se `true` ⇒ grava `sobreposicao_autorizada = true`, `sobreposicao_autorizada_por`, `..._em`, e prossegue (a linha da agenda herda a flag via `rebuild`).
- **`reagendar_locacao`** (colaborador): mesma checagem + advisory lock. **Reagendar sempre limpa a autorização** (`sobreposicao_autorizada = false` no novo slot) — novo horário é nova decisão; se o novo slot também colidir, exige nova confirmação. Mantém `set constraints ... deferred` (troca de salas/horário num só commit).

> A checagem de overlap dentro da RPC ignora a própria locação (`locacao_id <> p_locacao_id`) e considera bloqueante `= true`. `sob_consulta`/status não-bloqueantes não entram.

### 3.2 Aprovação (transição → `aprovada`)
A constraint parcial **não pega** `comum × autorizada` no flip para bloqueante. Então a aprovação precisa de guarda **antes** do flip:
- O caminho de aprovação (server action → `aplicarTransicao`) passa a fazer, na mesma transação do flip, **advisory lock da sala + checagem de overlap contra linhas autorizadas**. Implementação: uma RPC fina de aprovação-guardada (ou estender o caminho de transição da aprovação) que trava a sala, checa overlap e só então faz o CAS de status.
- Se houver overlap com ocupante autorizado e a locação sendo aprovada **não** for ela mesma autorizada ⇒ bloquear com mensagem clara (reagende / trate a sobreposição), reusando `descreverConflitoAgenda`.
- `comum × comum` continua protegido pela constraint (23P01) como hoje — a guarda nova cobre só o buraco das autorizadas.

### 3.3 Detector de conflito compartilhado (app)
Generalizar `descreverConflitoAgenda` ([src/lib/locacoes/dados.ts](../../src/lib/locacoes/dados.ts)) num utilitário que, dado sala(s) + período, retorna os ocupantes bloqueantes **incluindo os autorizados** (com código/associado/evento). Usado em: (a) pop-up da assistida; (b) mensagem de conflito da aprovação; (c) reagendamento; (d) conversão da fila. A fonte é sempre `agenda_no_intervalo` (agora com `sobreposicao_autorizada`).

### 3.4 Correções de invariante quebrada
- **`detectarSobreposicoes`** ([src/lib/calendario/sobreposicoes.ts](../../src/lib/calendario/sobreposicoes.ts)): o código pula pares `bloqueante × bloqueante` assumindo que a constraint os torna impossíveis (`if (!ehPendente(a) && !ehPendente(b)) continue;`). **Essa invariante deixa de valer** — duas bloqueantes podem coexistir quando uma é autorizada. Remover o `continue` para esse caso e emitir a sobreposição com uma categoria "autorizada" (para o realce visual). Pendente × qualquer segue como hoje.
- **`liberarVaga`** ([src/lib/locacoes/efeitos.ts](../../src/lib/locacoes/efeitos.ts)): ao recusar/cancelar uma locação, hoje avisa a fila de espera assim que sai de status bloqueante. Com sobreposição, o slot pode **continuar ocupado** por uma locação autorizada — passar a **checar que o slot ficou realmente livre** (sem outra bloqueante no período) antes de notificar vaga, evitando aviso de vaga falsa.

### 3.5 Efeitos colaterais (§7.3)
- **Calendário / dashboard:** locações sobrepostas renderizam **lado a lado** no mesmo slot com indicador de "sobreposição autorizada" (usa `idsEmConflito` + a categoria nova). Sem colapsar/esconder nenhuma.
- **Ocupação (2.2 / dashboard `ocupacao-core`):** **sem mudança** — o dia conta como ocupado uma vez (`.some`), não dobra por causa da segunda locação.
- **Remanejamento Sympla:** o remanejamento por prioridade **exclui** locações `sobreposicao_autorizada = true` (conflito já aceito — não force-remaneja). Ajustar a leitura em [src/lib/eventos/](../../src/lib/eventos/) que monta os candidatos a remanejamento.

### 3.6 UI da assistida (§7.2)
- No formulário assistido ([/admin/locacoes/nova](../../src/app/admin/(painel)/locacoes/nova/) e reagendamento), ao detectar conflito no submit, abrir **pop-up** com: sala, período e a(s) locação(ões) existentes no horário (código, associado, evento). Ações **"Cancelar"** e **"Confirmar sobreposição"**. Confirmar reenvia o submit com `sobreposicao_autorizada = true` (qualquer colaborador autoriza) → grava flag + por/em.
- **Portal:** conflito = indisponível, **sem** pop-up e **sem** caminho de exceção (§7.2). A `disponibilidade` já lê `bloqueante` (independente da flag) → slot autorizado continua aparecendo como ocupado; a checagem no submit da RPC é o backstop.

---

## 4. Locações retroativas (§6)

### 4.1 Coluna (migration 0062)
- `locacoes.retroativa boolean not null default false`.
- **Sem enum novo:** a locação retroativa entra e é levada a `confirmada` → `realizada`/`finalizada`, exibida com o rótulo **"Concluída"** na UI (mapeamento de rótulo, não status novo). Antecedência mínima já é ignorada para a equipe (mig 0053).

### 4.2 Fluxo de criação (só colaborador, assistida)
1. O formulário assistido permite **data passada** quando o colaborador marca "lançamento retroativo" (o portal continua bloqueando datas passadas).
2. `criar_locacao_assistida` ganha `p_retroativa boolean default false` (mesma recriação da 0063) → grava `retroativa = true` e registra em `locacao_eventos` a origem **"lançamento retroativo"** (quem/quando).
3. O caminho de criação registra o **pagamento retroativo** como `pago`, com `baixa_em` na data passada informada, e roda a transição `→ confirmada`. Opcional: auto-avançar para `realizada/finalizada` para já exibir "Concluída".

### 4.3 Efeitos suprimidos, comissão mantida (§6.3/§6.4)
`dispararEfeitos` passa a consultar `locacoes.retroativa`:
- **Suprime** `notif.*` (aprovação/confirmação/cobrança) e `marcarGoogle` (sem espelho no Calendar para data passada) — viram no-op quando `retroativa = true`.
- **Mantém** `gerarComissoes`: a comissão nasce normalmente (Fase 1) com **competência = mês da quitação = `baixa_em` retroativo**. É o objetivo do lançamento (alimentar a régua de comissões pela data real de recebimento).
- Contrato: não gera/envia (retroativo não tem contrato a assinar).

### 4.4 Overlap e auditoria
- Retroativa **ainda materializa agenda** e usa o **mesmo caminho de sobreposição** da §3 (a data passada pode colidir com um registro — trata igual). Ordem: §3 (sobreposição) sobe antes/junto de §4.
- Auditoria completa em `locacao_eventos` (origem "lançamento retroativo" + autor + timestamp), como exige o §6.5.

---

## 5. Migrations (resumo)

- **0062 — sobreposição + flags (DDL puro):** colunas em `locacoes` e `agenda_ocupacoes`; `retroativa`; atualização de `rebuild_agenda_locacao` (grava flag) + lista `OF` do trigger; swap da constraint parcial (mesmo nome, `deferrable initially immediate`); `agenda_no_intervalo` += `sobreposicao_autorizada`.
- **0063 — RPCs (drop+create, refaz revoke/grant service_role):** `criar_locacao_assistida` (+`p_sobreposicao_autorizada`, +`p_retroativa`, advisory lock, overlap check), `criar_solicitacao_portal` (advisory lock, overlap check, sem autorização), `reagendar_locacao` (advisory lock, overlap check, limpa autorização), + guarda de overlap na aprovação. Todas com `pg_advisory_xact_lock` por sala antes da checagem.

> Migrations aplicadas via MCP `apply_migration`. RPCs grandes: pegar o corpo exato com `pg_get_functiondef` e editar cirurgicamente; `drop+create` na mudança de assinatura refaz `revoke public/anon/authenticated` + `grant service_role`.

---

## 6. Ordem obrigatória / risco

- As checagens no app (§3.1–3.4) sobem **na mesma release** do swap da constraint (§2.2): no instante em que o predicado vira `... and not sobreposicao_autorizada`, o banco para de proteger o par que envolve autorizada — o servidor tem de já estar cobrindo.
- Base transacional vazia hoje ⇒ sem risco de dado legado; ainda assim as migrations são idempotentes/seguras e os defaults `false` preservam o comportamento atual bit a bit.

---

## 7. Critérios de aceite

**Sobreposição**
- [ ] Migration com defaults `false` não muda nada para o dado/fluxo atual (comum × comum ainda estoura 23P01).
- [ ] Assistida: conflito abre pop-up com sala/período/locações; "Confirmar sobreposição" grava `sobreposicao_autorizada` + por/em; a segunda locação coexiste no slot.
- [ ] Portal: conflito = indisponível, sem pop-up; submit sobre slot ocupado (mesmo autorizado) é rejeitado no servidor.
- [ ] Aprovar uma pendente que colide com uma locação **autorizada** é bloqueado (constraint não pegaria) com mensagem clara.
- [ ] Reagendar limpa a autorização; novo slot em conflito exige nova confirmação.
- [ ] Race (duas criações simultâneas na mesma sala) serializada pelo advisory lock.
- [ ] Calendário/dashboard mostram as duas lado a lado com indicador; ocupação conta o dia uma vez.
- [ ] Remanejamento Sympla ignora locações autorizadas.
- [ ] `liberarVaga` não avisa vaga quando o slot segue ocupado por autorizada.

**Retroativas**
- [ ] Data passada só na assistida (portal segue bloqueando); marca "lançamento retroativo" na auditoria (quem/quando).
- [ ] Sem notificação ao associado e sem Google Calendar; **com** comissão na competência da `baixa_em` retroativa.
- [ ] Entra como "Concluída" (sem enum novo), com pagamento retroativo `pago`.

- [ ] `npm run build` + testes passam (incl. novos testes puros de `detectarSobreposicoes` com par bloqueante×autorizada e do detector de conflito).
