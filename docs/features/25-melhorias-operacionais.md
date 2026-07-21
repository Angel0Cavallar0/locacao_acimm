# Spec 25 — Melhorias operacionais pós-entrega

> Lote de 6 melhorias identificadas em uso após a entrega das Specs 00–23.
> Entregue em 3 PRs independentes (A: antecedência · B: portal de disponibilidade ·
> C: editor de templates). Este doc cobre as três.

---

## A. Regras de antecedência mínima de reserva (PR A)

### Contexto
Algumas salas e os pedidos de coffee break precisam de um prazo mínimo entre a
solicitação e a data do evento (ex.: montar a sala, comprar insumos). Antes não havia
como exigir isso; a equipe controlava manualmente.

### A1. Antecedência por sala (configurável pelo colaborador)
- Coluna nova `salas.dias_antecedencia_minima integer not null default 0` (migration
  `0053_antecedencia`). `0` = sem restrição.
- Editável no CRUD de sala (`/admin/salas`): campo "Antecedência mínima (dias)" em
  [sala-form.tsx](../../src/app/admin/(painel)/salas/sala-form.tsx); validado em
  `salaSchema` ([salas.ts](../../src/lib/validacoes/salas.ts)) e gravado em
  [actions.ts](../../src/app/admin/(painel)/salas/actions.ts).

### A2. Antecedência de coffee break (global)
- Config `antecedencia_coffee = {"dias": N}` em `configuracoes` (seed na migration 0053).
- Leitura: `obterAntecedenciaCoffee()` em
  [config.ts](../../src/lib/coffee/config.ts) (padrão `{dias:0}` se ausente/inválido).
- Edição: campo "Antecedência mínima do coffee" no topo de
  [coffee-client.tsx](../../src/app/admin/(painel)/coffee/coffee-client.tsx), gravado por
  `salvarAntecedenciaCoffeeAction`.

### A3. Helper puro
- `respeitaAntecedencia(data, diasMin, hoje?)` em
  [janela.ts](../../src/lib/disponibilidade/janela.ts) (`diasMin<=0` → sempre respeita).
  Testado em [janela.test.ts](../../src/lib/disponibilidade/janela.test.ts) (6 casos).

### A4. Aplicação (server-side)
- **Portal do associado — bloqueia de fato** ([nova/actions.ts](../../src/app/(portal)/(app)/locacoes/nova/actions.ts)):
  `criarSolicitacao` rejeita quando a data está dentro do prazo da sala (maior N entre as
  salas escolhidas) ou do coffee. `sugerirDatas` não sugere datas dentro do prazo.
- **Atendimento assistido — avisa mas permite** ([admin nova/actions.ts](../../src/app/admin/(painel)/locacoes/nova/actions.ts)):
  `calcularResumoAction` (preview) e `criarLocacaoAssistida` devolvem `aviso` quando fora
  do prazo; a reserva é criada mesmo assim. Exibido no resumo e via `toast.warning`.
- **Coffee incluído depois** ([coffee.ts](../../src/lib/locacoes/coffee.ts) → `salvarCoffeeLocacao`):
  fluxo do painel — retorna `aviso` (não bloqueia), exibido em
  [coffee-editor.tsx](../../src/app/admin/(painel)/locacoes/coffee-editor.tsx).

**Regra**: a validação vive nas server actions (as RPCs de escrita não mudam). O portal é
autoridade de bloqueio; o painel do colaborador é assistido e pode furar com aviso.

---

## B. Portal de disponibilidade — combos, carregando e período gratuito (PR B)

- **Combos direto na tela** de `/disponibilidade`: seção "Combos disponíveis" (para
  associado ativo), reutilizando `listarCombosAplicaveis()`. CTA leva ao formulário com
  `?combo={id}` pré-selecionado. Antes os combos só apareciam dentro do formulário.
- **Animação de carregando** ao trocar de data: overlay de spinner sobre o grid enquanto a
  Server Action de disponibilidade carrega (antes só havia um leve `opacity`).
- **Período gratuito no pop-up da sala**: "Associados têm direito a X locações gratuitas por
  mês nesta sala" (+ saldo do associado no mês), a partir de
  `regras_periodo_gratuito.usos_por_ciclo` / `saldoDoAssociado()`. O pop-up também mostra a
  antecedência mínima da sala (§A1) quando > 0.

---

## C. Editor de templates de mensagem (PR C)

- Colaborador edita o **texto** de cada template (WhatsApp e/ou e-mail) e pode
  **ativar/desativar** cada um, em `/admin/configuracoes/mensagens`.
- Variáveis por `{{tag}}` (ex.: `{{nome}}`, `{{data}}`, `{{loc}}`); e-mail mantém a moldura
  visual da ACIMM (edita assunto + corpo). O texto atual do código é o padrão/fallback.
- Desativado → não enfileira (gate em `enfileirar`). Override → renderizado no envio
  (`enviarLinha`). Fail-open: erro de config nunca bloqueia o fluxo de locação.

---

## Fora de escopo
- HTML cru do e-mail (mantém-se a moldura fixa da ACIMM).
- Antecedência de coffee por nível (decisão: global).
- Integração bancária, `assinatura_mensal` e Autentique real (seguem como na v1).
