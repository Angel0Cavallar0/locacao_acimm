# Spec 33 — Comissões por metas (Ciclo 3)

> Revisa o **Spec 29** (comissões do Ciclo 2), que por sua vez revisou o **Spec 21**.
> Depende: Spec 06 (hooks/máquina de estados), Spec 14 (pagamentos/quitação), Spec 30 (serviços adicionais).
> Origem: reforma interna da ACIMM (ago/2026) — novos critérios de comissionamento.
> **Estado do banco: 0 locações, 0 pagamentos, 0 comissões, 0 adicionais → SEM backfill.** `configuracoes.comissoes` está hoje no formato antigo: `{locacao:{ativo:true,percentual:5}, coffee:{ativo:true,percentual:3}}`.

---

## 1. Objetivo

Três mudanças de regra:

1. **Serviços adicionais passam a comissionar**, tratados como locação de sala (revertendo o "adicionais = 0%" do Spec 29).
2. **O percentual deixa de ser fixo por linha** e passa a depender do **total recebido no mês**, em dois grupos independentes com faixas por meta.
3. **Regra de bônus habilitável**: batidas as duas metas, ambas as comissões sobem para um percentual único.

Consequência estrutural: **a comissão deixa de ser propriedade da locação e passa a ser propriedade do mês.** Hoje `gerarComissoesConfirmada` decide tudo com informação local (bases da locação + config); com faixa por total mensal, o percentual de uma linha depende de todas as outras linhas da mesma competência. Isso quebra o modelo "snapshot imutável na confirmação" que a migration 0051 documenta. O `insert` da geração passa a ser **provisório**, e a autoridade passa a ser a rotina de apuração.

Valores iniciais (todos configuráveis, nada hardcoded):

| Grupo | Faixa 1 | Faixa 2 |
|---|---|---|
| Locação + Serviços adicionais | até R$ 10.000,00 → **5%** | acima de R$ 10.000,00 → **6%** |
| Coffee | até R$ 12.000,00 → **3%** | acima de R$ 12.000,00 → **5%** |
| **Bônus** (opt-in) | acima de R$ 10.000,00 **E** acima de R$ 12.000,00 → **7% nos dois grupos** | |

---

## 2. Decisões travadas (Angelo, 09/08/2026)

| # | Decisão | Efeito |
|---|---|---|
| A | **Alíquota única sobre o total** (não progressiva) | Mês com R$ 12.000 de locação+adicionais → **todo** o valor a 6% (R$ 720), não 10k a 5% + 2k a 6% |
| B | **Bônus = 7% sobre as duas bases cheias** | Substitui o 6% e o 5%; não incide só sobre o excedente |
| C | **Recalcula durante o mês, congela no fechamento** | A competência fica *em apuração* e reajusta a cada recebimento; botão **Fechar competência** congela % e valores |
| D | **`mes_recebimento` sugerido pela baixa, editável** | O valor informado na locação **manda** na competência da comissão |

**Semântica de borda, fixada em teste:** limites de faixa são **inclusivos** (`até R$ 10.000` ⇒ base de exatamente R$ 10.000,00 sai a 5%) e metas do bônus são **estritas** (`acima de R$ 10.000` ⇒ R$ 10.000,00 cravados **não** batem a meta). É uma diferença de 1 centavo que vai gerar dúvida na operação — a tela precisa dizer "acima de R$ 10.000,00".

**As metas são campos próprios, não derivadas da última faixa.** Se amanhã entrar uma 3ª faixa (ex.: 20k → 8%), a meta do bônus não pode se mover sozinha. Mitigação do risco de divergência: botão "usar os limites das faixas" no editor de config.

---

## 3. O que muda em relação ao Spec 29

| Aspecto | Spec 29 (hoje) | Spec 33 (novo) |
|---|---|---|
| Base locação | salas − descontos (**sem** adicionais) | salas **+ adicionais** − descontos |
| Percentual | fixo por origem, snapshot na geração | **derivado do total do mês**, recalculado até o fechamento |
| Bônus | não existe | duas metas batidas → percentual único nos dois grupos |
| Competência | mês de `max(baixa_em)`, fallback `now` | `locacoes.mes_recebimento` **se informado**, senão a regra atual |
| Estado do mês | não existe | `em apuração` / `fechada` (congela % e valores) |
| "Marcar paga" | livre a qualquer momento | **só em competência fechada** |
| Config | `{ativo, percentual}` por origem | `{ativo, faixas[]}` por origem + `bonus` |
| Salvar config | não recalcula nada | recalcula **as competências abertas** |

Permanecem inalterados: fato gerador (recebimento/quitação), geração como efeito pós-commit de `confirmada`, idempotência pelo índice único parcial, isenção total não gera comissão, estorno sem hard delete, `comissoes.exportada` congelada.

---

## 4. Config v2 e compatibilidade

### 4.1 Formato

Chaves em snake_case dentro do jsonb (convenção das seeds existentes), camelCase no TS.

```json
{
  "versao": 2,
  "locacao": {
    "ativo": true,
    "faixas": [
      { "ate_centavos": 1000000, "percentual": 5 },
      { "ate_centavos": null,    "percentual": 6 }
    ]
  },
  "coffee": {
    "ativo": true,
    "faixas": [
      { "ate_centavos": 1200000, "percentual": 3 },
      { "ate_centavos": null,    "percentual": 5 }
    ]
  },
  "bonus": {
    "ativo": true,
    "percentual": 7,
    "meta_locacao_centavos": 1000000,
    "meta_coffee_centavos": 1200000
  }
}
```

`ate_centavos: null` = faixa sem teto (sempre a última).

### 4.2 Compatibilidade retroativa — obrigatória, não cortesia

`parsearConfigComissoes` ganha detecção por forma, em ordem:

1. `Array.isArray(v.faixas)` → v2. Normaliza: descarta itens não-objeto, `percentual` via `numeroSeguro(0..100)`, ordena ascendente com `null` por último, deduplica limites, mantém um único `null`. Lista vazia → `{ativo:false, faixas:[]}`.
2. `v.percentual` presente → **legado**: `faixas = [{ ateCentavos: null, percentual }]`. Faixa única aberta é matematicamente idêntica ao comportamento atual.
3. Senão → `{ativo:false, faixas:[]}`.

`bonus` ausente/lixo → `{ativo:false, percentual:0, metas:0}`. **Nunca** herdar bônus de config legada.

Novo `serializarConfigComissoes` (espelho do parse) para `salvarConfigComissoes` gravar snake_case — hoje ele grava o objeto camelCase do Zod direto, o que com faixas viraria gambiarra.

### 4.3 ⚠ Ordem de deploy: **código primeiro, migration depois**

- Código novo + config legada → fallback da §4.2 → roda 5%/3% flat. **Seguro.**
- Código antigo + config v2 → o parse velho procura `percentual`, não acha, devolve 0% → **zera todas as comissões**. **Quebra.**

Portanto a migration 0065 é o **último** passo do deploy, e o código não pode depender dela para funcionar.

---

## 5. Migration 0065

`supabase/migrations/20260809120065_comissoes_metas.sql`, cabeçalho no padrão do repo.

### 5.1 `comissao_competencias`

```sql
create table comissao_competencias (
  competencia date primary key check (extract(day from competencia) = 1),
  base_locacao_centavos  integer not null default 0 check (base_locacao_centavos  >= 0),
  base_coffee_centavos   integer not null default 0 check (base_coffee_centavos   >= 0),
  percentual_locacao     numeric not null default 0 check (percentual_locacao between 0 and 100),
  percentual_coffee      numeric not null default 0 check (percentual_coffee      between 0 and 100),
  bonus_aplicado         boolean not null default false,
  total_locacao_centavos integer not null default 0,
  total_coffee_centavos  integer not null default 0,
  qtd_linhas             integer not null default 0,
  config_snapshot        jsonb,
  historico              jsonb   not null default '[]',
  apurada_em  timestamptz not null default now(),
  fechada_em  timestamptz,
  fechada_por uuid references auth.users(id),
  criado_em   timestamptz not null default now()
);

alter table comissao_competencias enable row level security;
create policy comissao_competencias_colaborador_select
  on comissao_competencias for select to authenticated using (eh_colaborador());
```

**Por que tabela e não cálculo on-the-fly:** (a) não há onde guardar `fechada_em/por`; (b) sem `config_snapshot`, auditar agosto em dezembro recomputaria a faixa com a config **atual** — valores certos, faixa errada, que é exatamente o que o congelamento deve evitar; (c) dá uma linha para travar (advisory lock por competência).

**Sem coluna `status`:** fechada ⇔ `fechada_em is not null`. Duas fontes de verdade para o mesmo fato é o defeito que mais custa manutenção, e um enum exigiria migration isolada para ganhar valores (o repo já bateu nisso na 0058). O `historico` é append-only: `[{acao:"fechada"|"reaberta", em, por, percentuais, totais}]`, mesmo espírito de `locacao_eventos.dados`.

**Risco assumido:** é dado derivado, sujeito a divergir de `comissoes`. Três mitigações: escrita num único ponto (a RPC, que atualiza linhas + cabeçalho na mesma transação), detector de divergência na tela (`Σ linhas ≠ totais do cabeçalho` → banner "Recalcular", mesmo padrão do `reconciliacao-banner.tsx`), e `apurada_em` visível.

### 5.2 Colunas novas

```sql
alter table comissoes add column competencia_original date;   -- mês real quando deslocada por fechamento
alter table locacoes  add column mes_recebimento date
  check (mes_recebimento is null or extract(day from mes_recebimento) = 1);
create index locacoes_mes_recebimento_idx on locacoes (mes_recebimento) where mes_recebimento is not null;
```

`pagamentos.previsao_recebimento` fica **congelada** via `comment on column` (nunca foi escrita por código algum; as previsões passam a sair de `locacoes.mes_recebimento`). Mesmo tratamento dado a `comissoes.exportada`.

Não criar índice novo em `comissoes` — `comissoes_competencia_idx` já cobre a apuração.

### 5.3 Config

`update configuracoes set valor = <JSON da §4.1> where chave = 'comissoes'` — a linha já existe, então `update`, não `insert ... on conflict do nothing`. Bônus nasce **ligado** (é a regra que a ACIMM descreveu); o toggle existe para desligar.

### 5.4 RPCs (mesma migration)

Duas funções `security definer`, `search_path = public`, com `revoke ... from public, anon, authenticated` + `grant ... to service_role` (padrão 0063/0064).

**`apurar_comissao_competencia(p_competencia, p_pct_locacao, p_pct_coffee, p_bonus_aplicado, p_config jsonb, p_base_locacao_esperada, p_base_coffee_esperada, p_fechar bool, p_user uuid) returns jsonb`**

1. `pg_advisory_xact_lock(hashtextextended('comissao_apuracao:' || p_competencia::text, 0))`.
2. `fechada_em is not null` → `{"ok":false,"motivo":"fechada"}`.
3. Soma `base_centavos` por origem das linhas vivas.
4. Bases divergem do esperado → `{"ok":false,"motivo":"bases_mudaram", ...bases reais}` (o TS recomputa a faixa e repete).
5. `update comissoes set percentual = <pct da origem>, valor_centavos = floor(base_centavos * pct / 100)::int` para as linhas vivas da competência.
6. Recalcula totais e faz `insert ... on conflict (competencia) do update`.
7. `p_fechar` → exige `qtd > 0`, seta `fechada_em/por`, faz append no `historico`.

**`reabrir_comissao_competencia(p_competencia, p_user) returns jsonb`** — mesmo lock, exige fechada, limpa os campos, append no histórico.

**Por que RPC e não tudo em TS:** precisa de atomicidade entre as N linhas e o cabeçalho (um update parcial é exatamente a divergência que queremos evitar) e de um lock que sobreviva à operação — `pg_advisory_xact_lock` só vale dentro de uma transação, e via PostgREST cada chamada TS é a sua própria transação. **A decisão (faixa/bônus) fica em TS; o SQL só aplica `floor(base × pct / 100)`.**

---

## 6. Núcleo puro — `src/lib/comissoes/apuracao-core.ts` (novo, testado)

Arquivo separado para não inchar `comissoes-core.ts`. `node --test`, padrão dos demais `*-core.ts`.

```ts
export interface Faixa { ateCentavos: number | null; percentual: number }
export interface RegraGrupo { ativo: boolean; faixas: Faixa[] }
export interface RegraBonus {
  ativo: boolean; percentual: number;
  metaLocacaoCentavos: number; metaCoffeeCentavos: number;
}
export interface Apuracao {
  percentualLocacao: number; percentualCoffee: number;
  bonusAplicado: boolean;
  faixaLocacao: Faixa | null; faixaCoffee: Faixa | null;      // p/ a tela: "acima de R$ 10.000 → 6%"
  faltaLocacaoCentavos: number; faltaCoffeeCentavos: number;  // p/ a tela: "faltam R$ X p/ o bônus"
}

export function ordenarFaixas(faixas: Faixa[]): Faixa[];
export function faixaDoTotal(faixas: Faixa[], totalCentavos: number): Faixa | null;
export function percentualDaFaixa(faixas: Faixa[], totalCentavos: number): number;
export function metasBatidas(bonus: RegraBonus, bases: BasesCompetencia): boolean;
export function apurarCompetencia(cfg: ConfigComissoes, bases: BasesCompetencia): Apuracao;
export function proximaCompetenciaAberta(desejada: string, fechadas: string[]): string;
```

O bônus só aplica se: `bonus.ativo && bonus.percentual > 0 && locacao.ativo && coffee.ativo` e as duas bases **estritamente** acima das metas. Exigir os dois grupos ativos é decisão explícita — com coffee desligado não existe "meta de coffee batida" que faça sentido premiar.

**O bônus substitui mesmo se for menor** (decisão B, literal). Se o admin configurar bônus 7% com faixa alta de 8%, bater as metas *reduz* a comissão. Tratado com **aviso no editor de config**, não com `Math.max` silencioso — mascarar mascararia um erro de configuração.

### 6.1 Arredondamento — floor por linha, sobra aceita

O valor da linha continua `Math.floor(base × pct / 100)` (a `valorComissao` atual, já testada). **O total do mês é a soma das linhas, não `floor(baseTotal × pct)`.** Motivos, nessa ordem:

1. **O que se paga é a linha** — `marcarComissoesPagas` opera por id, o CSV é por linha, o estorno é por linha. Se o total fosse a autoridade, não bateria com o que é efetivamente pago.
2. **Rateio do resto quebraria a idempotência da linha** — no rateio, o valor de uma linha depende do conjunto do mês; uma baixa no dia 28 mudaria o valor de uma linha gerada no dia 3, inclusive de linha já paga num mês reaberto. É defeito de correção, não de estética.
3. **A diferença é limitada a `(n−1)` centavos por grupo/mês** — com ~30 locações, ≤ R$ 0,29.
4. **Auditabilidade** — cada linha se confere com uma calculadora.

Consequência obrigatória na tela: **nunca exibir `floor(baseTotal × pct)` como total do mês.** Exibir "Base R$ X · Percentual Y% · Total R$ Z (soma de N linhas)".

### 6.2 Mudanças no `comissoes-core.ts`

- **`baseLocacao`** → `max(0, salas + adicionais − descontos)`. Reescrever o docblock (linhas 69-75), que hoje argumenta o contrário.
- **`comissoesDevidas` → `basesDevidas(cfg, bases)`**, devolvendo só `{origem, baseCentavos}`. A função não pode mais devolver percentual/valor: no momento do insert a competência ainda não está apurada. Gate novo: grupo ativo **e** `faixas.length > 0` **e** `base > 0`.
  - *Mudança de comportamento a registrar:* hoje "valor arredondado a 0 não gera linha"; com o percentual vindo depois, o gate passa a ser só `base > 0`. Uma base de 50 centavos geraria linha de R$ 0,00 — aceitável (base real mínima é dezenas de reais) e preferível a suprimir uma linha por causa de um percentual provisório que a reapuração pode elevar.
- Intactos: `valorComissao`, `mesRelativo`, `competenciaDoMes`.

### 6.3 Testes existentes a atualizar (`comissoes-core.test.ts`)

| Linhas | Teste | Ação |
|---|---|---|
| 15-42 | parse (3 testes) | reescrever para v2 + teste novo de fallback legado |
| 66-76 | "base locação ignorando adicionais" | inverter: `50000 + 4500 − 20000 = 34500` |
| 97-145 | `comissoesDevidas` | migrar para `basesDevidas` |
| 157-170 | "valor arredondado a 0 não gera linha" | reescrever conforme §6.2 |
| **172-183** | **"adicionais NÃO entram (Ciclo 2)"** | **inverter e renomear** — Ciclo 3 |

---

## 7. Apuração — `src/lib/comissoes/apuracao.ts` (novo, `server-only`)

### 7.1 API

```ts
reapurarCompetencia(competencia): { ok, snapshot } | { ignorada: "fechada" | "vazia" } | { erro }
reapurarCompetencias(competencias: string[]): void      // dedup + sequencial
competenciaAberta(desejada): string                     // §7.3
fecharCompetencia({ competencia })                      // requireColaborador
reabrirCompetencia({ competencia })                     // requireAdmin
```

`reapurarCompetencia`: lê config → soma bases das linhas vivas (0 linhas → `{ignorada:"vazia"}`, **sem** criar cabeçalho, para não gerar 12 linhas de lixo por ano) → `apurarCompetencia` → chama a RPC → se `bases_mudaram`, recomputa a faixa com as bases devolvidas e repete (**máx. 3 tentativas**; converge porque o lock serializa) → `revalidatePath`.

Idempotente: função pura de (config, linhas vivas). Rodar duas vezes só reescreve `apurada_em`.

### 7.2 Gatilhos

| Gatilho | Onde | O que reapura |
|---|---|---|
| Geração | fim de `gerarComissoesConfirmada` | a competência resolvida |
| Estorno | fim de `estornarComissoesLocacao` | competências das linhas afetadas (lidas **antes** do update) |
| Reparo | `repararComissoes` | uma por competência distinta, **depois** do loop (não N×) |
| Salvar config | `salvarConfigComissoes` | todas as competências **abertas** com ≥1 linha viva |
| Mudar `mes_recebimento` | `locacoes/actions.ts` | competência de origem **e** de destino |
| Botão "Recalcular" | painel | a competência selecionada |

Sem cron: todo caminho que muda linha ou config já dispara.

### 7.3 Competência fechada no destino

`competenciaAberta(desejada)`: se não há cabeçalho ou `fechada_em is null` → `desejada`; senão avança mês a mês até achar uma aberta (teto de 12 iterações). Quando desloca, a linha grava `competencia_original = desejada` e a UI diz *"Competência 08/2026 já fechada — lançado em 09/2026"*.

Alternativa rejeitada (lançar no mês fechado e marcá-lo divergente): um mês fechado pode já ter sido **pago** ao colaborador; mexer nele depois do pagamento é o cenário que o próprio Spec 29 §4.2 evita. Deslocar para o próximo fechamento é a resposta contábil correta.

### 7.4 Fechar / reabrir

- **Fechar** (colaborador): reapura uma última vez, grava `config_snapshot`, `fechada_em/por`, append no histórico. Recusa mês futuro e mês sem linhas; avisa (não bloqueia) ao fechar o mês corrente.
- **Reabrir** (admin): **bloqueado se houver linha `pago=true`** na competência. O escape existe e é explícito — desmarcar as comissões como pagas (`marcarComissoesPagas` já aceita `pago:false`) e então reabrir. Sem isso, reabrir reescreveria o valor de uma comissão já quitada ao colaborador.
- **`marcarComissoesPagas` ganha guard**: só aceita linhas de competência **fechada**. É mudança de comportamento (hoje é livre) e decorre direto da decisão C — sem ela, uma linha paga em 12/08 a 5% vira 6% na reapuração do dia 20, com o valor pago divergindo do gravado e sem rastro. Custo para a operação: um clique a mais por mês.

### 7.5 Geração e estorno (`geracao.ts`)

**`gerarComissoesConfirmada`:**
- Select da locação passa a trazer `mes_recebimento`.
- Competência: `loc.mes_recebimento ?? competenciaDoMes(mesSP(max(baixa_em)) ?? mesCorrenteSP())`, depois passada por `competenciaAberta`.
- Quando `mes_recebimento` era null, **grava de volta** na locação o mês derivado (não o deslocado — a locação registra o mês do fato). É assim que a sugestão da decisão D fica visível e editável.
- Percentual provisório: `percentualDaFaixa` sobre (bases já na competência + bases desta locação) — uma leitura extra, barata, e o valor gravado já é quase sempre o final mesmo se a reapuração falhar.
- Grava `competencia_original` quando deslocada; mantém o loop por origem tolerante a `23505`.
- Ao fim: `reapurarCompetencia` em `try/catch` próprio — falha aqui não pode impedir que as linhas fiquem gravadas.
- Regra de isenção total inalterada.

**`estornarComissoesLocacao`:** select passa a trazer `competencia`; **não carimba** `estornada_em` em linha de competência fechada (§10.1); notifica quando alguma linha não foi estornada (por paga **ou** por mês fechado); reapura as competências abertas afetadas.

**`efeitos.ts`: nenhuma mudança.** Os hooks já chamam as funções certas, e `SUPRIMIVEIS_RETROATIVA` já mantém a comissão em lançamento retroativo — que é o comportamento desejado.

---

## 8. `locacoes.mes_recebimento`

- **Sugestão:** ponto único de resolução em `gerarComissoesConfirmada` (§7.5). **Não** mexer em `darBaixaPagamento` — evita duas regras concorrentes de sugestão e mantém a baixa barata.
- **Editável em qualquer status**, inclusive antes da quitação (caso do boleto de mensalidade que cai em setembro). Se preenchido antes, a geração o respeita.
- **Action** `salvarMesRecebimentoAction({locacaoId, mes})` em `src/app/admin/(painel)/locacoes/actions.ts`, molde exato de `salvarObservacoesInternasAction` (linhas 71-88). Sequência: sem linhas vivas → só grava; alguma `pago=true` → recusa; competência de **origem** fechada → recusa com mensagem nomeando o mês; senão move `competencia` das linhas vivas, grava o campo e reapura **origem + destino**. Retorna `ResultadoAcao & {aviso?}` (tipo já existe).
- **Componente** `src/app/admin/(painel)/locacoes/[id]/mes-recebimento.tsx`, molde de `observacoes-internas.tsx` (client, `useState` + `toast` + `Button loading`), com `<input type="month">` nativo. **Posição: dentro da seção *Pagamentos*, acima de `<PagamentosGestao>`** — é onde o operador está quando dá a baixa.
- **Suporte:** `LocacaoDetalhe` ganha `mesRecebimento: string | null` ('YYYY-MM'); `carregarLocacao` adiciona ao select e mapeia junto de `observacoesInternas`.
- **Não entra na RPC `criar_locacao_assistida`.** A função já foi dropada e recriada 6× (0028, 0029, 0047, 0048, 0061, 0063), tem 22+ parâmetros, e cada mudança exige recriar o corpo inteiro + `revoke`/`grant` + o espelho no portal. Além disso, na criação ninguém sabe o mês do recebimento — é justamente o problema que o campo resolve. Se um dia for preciso, o caminho barato é um `update` logo após a RPC em `nova/actions.ts`, sem migration.

---

## 9. Tela `/admin/comissoes`

### 9.1 Painel de apuração (novo `apuracao-painel.tsx`)

**Posição:** entre o `ReconciliacaoBanner` e as abas de visão — não como 4ª aba. A apuração é sobre um **mês**; as abas são recortes **relativos**. Misturar confunde os dois eixos.

Seleção por `?competencia=YYYY-MM` (mesmo padrão de `visao`/`origem`/`q`). Default: mês anterior se ainda aberto, senão mês corrente — é o fluxo real (dia 5 de setembro: fechar agosto e pagar).

Dois blocos, um por grupo: base do mês, faixa atingida em texto ("acima de R$ 10.000,00 → 6%"), total (soma das linhas), e progresso até a meta — "faltam R$ 1.240,00 em coffee para o bônus de 7%" ou badge "Bônus aplicado · 7% nas duas origens". Esse progresso serve diretamente à intenção do cliente (a meta existe para motivar) e sai de graça de `Apuracao.falta*Centavos`.

Rodapé: badge de status ("Em apuração · apurado às HH:mm" / "Fechada em dd/MM por Fulano"), botões **Recalcular**, **Fechar competência** (dialog com resumo do que será congelado) e **Reabrir** (admin), e o banner de divergência.

### 9.2 Demais componentes

- **`config-comissoes.tsx`** — reescrever o corpo mantendo o invólucro. Lista dinâmica de faixas por grupo ("até R$ [input] → [input] %", última fixa "acima disso"), valores em reais via `brlParaCentavos`/`centavosParaBRL`; bloco de bônus com toggle, percentual, duas metas e botão "usar os limites das faixas"; aviso quando o bônus é menor que a maior faixa. **Corrigir duas cópias stale:** "Alterar aqui **não** recalcula comissões já geradas" → "Recalcula as competências ainda **abertas**; fechadas ficam congeladas"; e a descrição da base, que volta a incluir adicionais.
- **`comissoes-tabela.tsx`** — **coluna `%` nova** (o campo `percentual` já existe em `ComissaoLinha` e já vem de `carregarReais`, mas nunca foi exibido; com percentual variável isso é indefensável). Badge "deslocada" quando `competenciaOriginal != null`. "Marcar paga" desabilitado com tooltip "Feche a competência 08/2026 para liberar o pagamento".
- **`csv-core.ts`** — cabeçalho ganha `percentual` (ausente hoje), `bonus_aplicado`, `competencia_status`, `competencia_original`. `csv-core.test.ts` assere cabeçalho e linha exatos → atualizar as duas asserções.
- **`actions.ts`** — wrappers finos `reapurarCompetenciaAction`, `fecharCompetenciaAction`, `reabrirCompetenciaAction`.

### 9.3 Ressuscitar as visões de previsão

`projetarComissoes` (`dados.ts:162-245`) está natimorta por **dois** motivos, não um: `previsao_recebimento` nunca é escrito **e** a linha 219 passa `valorAdicionaisCentavos: 0` (o select nem busca a coluna). Com adicionais voltando à base, o segundo vira bug de verdade. Reescrita:

- Fonte: `locacoes` com `mes_recebimento` no mês alvo, status entre `aprovada`…`aguardando_pagamento`, `valor_total > 0`, excluindo as que já têm comissão viva.
- Remover completamente o caminho `previsao_recebimento`.
- Incluir `valor_adicionais_centavos` no select e no objeto.
- Percentual da previsão via `percentualDaFaixa` sobre (reais já gravadas + previstas) do mês — responde a pergunta certa: "se tudo previsto entrar, o mês vai a 6%".

---

## 10. Riscos e casos de borda

| Situação | Tratamento |
|---|---|
| **Quitação cai em competência fechada** | Desloca para a primeira aberta, grava `competencia_original`, sinaliza na tela. Não reabre nem altera o mês fechado |
| **Estorno em competência fechada** | **Não** estorna (o total já foi congelado e possivelmente pago). Linha fica viva, cancelamento segue, aviso interno de ajuste manual |
| **Reabrir mês com linha paga** | Bloqueado. Escape explícito: desmarcar as pagas → reabrir. `historico` guarda os percentuais do fechamento anterior para calcular a diferença manualmente. Cálculo automático de diferença fica **fora de escopo** |
| **Config alterada no meio do mês** | Reapura todas as **abertas** — inclusive meses passados ainda abertos, o que é correto (não foram pagos) mas surpreende. Toast informa "N competências reapuradas: 07/2026, 08/2026". Quem quiser blindar um mês, fecha antes |
| **Adicional `sob_consulta` sem valor** | `recomputarERegistrar` faz `?? 0` → entra como R$ 0, **reduz a base e pode derrubar o mês de faixa**. Antes era irrelevante (adicionais fora da base). Mitigação: terceira categoria em `carregarReconciliacao` — "comissão gerada com adicional sob consulta sem valor" → banner de revisão. Atenuante: `podeEditarAdicionais` congela adicionais antes de `confirmada`; o buraco só se abre em lançamento retroativo e em cotação esquecida |
| **Competência sem linhas** | `{ignorada:"vazia"}`, sem cabeçalho; fechar recusado. O painel exibe "Nenhuma comissão" — cuidado para **não** mostrar "5% (1ª faixa)", que sugeriria falsamente haver algo a pagar |
| **Divisão híbrida com baixas em meses diferentes** | Competência = `mes_recebimento` ou mês da **última** baixa. **Não há split de comissão entre meses** — o índice único permite uma linha viva por locação/origem. Para atribuir ao outro mês, edita-se `mes_recebimento` |
| **Isenção total** | Segue sem gerar comissão — e portanto **não conta para a meta**. Decisão explícita |
| **Duas baixas simultâneas** | Advisory lock na RPC + revalidação otimista de bases (`bases_mudaram` → retry) + detector de divergência como backstop |
| **Geração é best-effort** (`efeitos.ts` engole exceções) | A reapuração pende do mesmo caminho: se falhar, o mês fica com o percentual antigo até alguém clicar Recalcular. **O detector de divergência não é opcional** |
| **`carregarReais` tem `LIMITE = 4000`** | Não reaproveitar para calcular bases — a apuração agrega no SQL, sem teto |

---

## 11. Ordem de execução

0. **Spec aprovado** (este arquivo) + linha no `ROADMAP.md`. *CLAUDE.md §14: não criar migration sem spec.*
1. **Migration 0065** (§5) — arquivo criado, aplicado por último no deploy (§4.3).
2. **Núcleo puro**: `apuracao-core.ts` + testes; `parsear`/`serializar` e `baseLocacao`/`basesDevidas` em `comissoes-core.ts`; testes atualizados (§6.3). **`npm test` verde antes de seguir.**
3. **Validações** (`validacoes/comissoes.ts`): faixas com `superRefine` (exatamente um `null`, e por último; demais estritamente crescentes), bônus, competência, `mes_recebimento`.
4. **`apuracao.ts`** + tipos novos.
5. **`geracao.ts`** (§7.5). `efeitos.ts` intocado.
6. **`dados.ts`**: `carregarApuracao`, status da competência em `carregarReais`, `projetarComissoes` reescrito, 3ª categoria na reconciliação.
7. **`gestao.ts`**: guard de `marcarComissoesPagas`, reapuração em `salvarConfigComissoes`/`repararComissoes`, CSV + teste.
8. **Locação**: tipos, `carregarLocacao`, `salvarMesRecebimentoAction`, `mes-recebimento.tsx`, encaixe no `[id]/page.tsx`. *(paralelizável após o passo 1)*
9. **Tela de comissões**: painel, config, tabela, `page.tsx`, actions.
10. **Verificação** (§12) + `npm run build`.

---

## 12. Verificação

### 12.1 Automatizada (`node --test "src/**/*.test.ts"`)

`apuracao-core.test.ts`: faixa inclusiva na borda; meta estrita na borda; bônus com grupo inativo; bônus menor que a faixa (substitui mesmo assim); floor por linha vs `floor(total×pct)`; faixas desordenadas; faixas vazias → 0%; `proximaCompetenciaAberta` (extraída como função **pura**, para cobrir o teto de 12 iterações sem I/O); round-trip `serializar(parsear(x)) === x`.
`comissoes-core.test.ts`: os 5 testes reescritos, com o de adicionais **invertido**.
`csv-core.test.ts`: cabeçalho e linha com as 4 colunas novas.

### 12.2 Manual (`npm run dev`)

1. Duas locações somando R$ 8.000 → faixa "até 10.000 → 5%".
2. Terceira baixa levando a R$ 12.000 → **as três** linhas viram 6% (decisão A).
3. Borda: R$ 10.000,00 cravados → 5% e **sem** bônus; +1 centavo → 6%.
4. Bônus: locação 12.000 + coffee 12.500 → badge e **as duas** origens a 7% (decisão B).
5. Meia-meta: locação 12.000 + coffee 11.000 → 6%/3% + "faltam R$ 1.000,00 em coffee".
6. Adicionais: salas 4.000 + adicionais 1.000 − desconto 500 → base 4.500 (regressão do Spec 29).
7. Fechar → status congela, "Recalcular" some, nova baixa no mês cai na competência seguinte com badge "deslocada".
8. "Marcar paga" bloqueado em mês aberto, liberado após fechar.
9. Reabrir com linha paga → recusado; desmarcar paga → reabre.
10. `mes_recebimento` auto-preenchido na baixa; editar para o mês seguinte → linhas migram e **os dois meses** reapuram.
11. `mes_recebimento` para mês fechado → erro nomeando o mês.
12. Config 6%→8% no meio do mês → aberto recalcula, fechado não; toast lista as competências.
13. **Config legada** (`{locacao:{ativo:true,percentual:5}}`) → roda 5% flat, sem erro, sem bônus (§4.3).
14. Estorno em mês aberto → reapura e pode **derrubar** o mês de faixa; em mês fechado → não estorna + aviso.
15. Concorrência: duas abas dando baixa que cruza a faixa, 3× → percentual igual em todas as linhas, total = soma.
16. Previsões: `mes_recebimento` futuro em 2 locações não quitadas → abas hoje vazias passam a listar.
17. CSV no Excel pt-BR: acentuação (BOM) + colunas novas; total bate com o card.
18. Isenção total: sem comissão e sem contar para a meta.
19. Mês vazio: "Nenhuma comissão", sem percentual sugerido, Fechar bloqueado.
20. Reparo: banner lista, "Reparar" gera **e** reapura o mês uma única vez.
