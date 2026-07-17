# Spec 07 — Nova Locação Assistida (Fase 2, parte 5)

> Depende: Spec 04 (`resolverPreco()`), Spec 06 (máquina de estados).
> Referência: CLAUDE.md §8.7, §9.5. Rota: `/admin/locacoes/nova` (aceita prefill via querystring do calendário: `?sala=&data=&periodo=`).
> Fecha o Bloco B no essencial: com este spec, a equipe **cria** locações no sistema — a planilha se aposenta.

---

## 1. Objetivo

Colaborador cria locação em nome de um **associado** (dados puxados da base Sophus) ou de um **não-associado** (locatário externo, preço cheio). Formulário único em seções, cálculo em tempo real como cortesia visual e recálculo integral no servidor no submit.

---

## 2. Períodos e horários (pré-requisito do formulário)

Os preços são por `periodo_dia` (manhã/tarde/noite/dia inteiro), mas a locação grava `inicio`/`fim` (`timestamptz`). O elo é a configuração `horarios_periodos`:

**Migration `0015_config_periodos`** — seed em `configuracoes`:

```sql
insert into configuracoes (chave, valor, descricao) values (
  'horarios_periodos',
  '{"manha":{"inicio":"08:00","fim":"12:00"},
    "tarde":{"inicio":"13:00","fim":"18:00"},
    "noite":{"inicio":"18:00","fim":"23:00"},
    "dia_inteiro":{"inicio":"08:00","fim":"18:00"}}',
  'Horários padrão de cada período de locação (placeholder — confirmar com a ACIMM)'
) on conflict (chave) do nothing;
```

Regras:
- Escolher o período preenche `inicio`/`fim` automaticamente (data + horários da config, em America/Sao_Paulo → UTC).
- **Ajuste fino de horário é permitido** (ex.: começar 14h em vez de 13h), desde que contido no dia; o **preço continua sendo o do período** — tempo além do período não muda preço automaticamente: hora extra é lançada como **adicional** (como a ACIMM faz hoje: "hora extra R$45").
- O período escolhido vale para todas as salas da reserva (uma reserva = um horário).

## 3. Formulário (seções em uma página, `/admin/locacoes/nova`)

### 3.1 Locatário
- Toggle **Associado** / **Não-associado** (define `condicao` e o preço).
- **Associado:** busca com autocomplete na base local (usa o índice full-text existente — nome, razão social — e busca por documento). Ao selecionar:
  - Snapshot pré-preenchido: nome (razão social), documento, **e-mail** (se `emails[]` tiver vários, select para escolher qual vai ao contrato/notificações), **telefone** (preferência: whatsapp → celular → telefone, editável).
  - Situação exibida como badge. **Somente `ativo` pode ter condição associado**; se suspenso/excluído, aviso claro + opção de prosseguir como não-associado (preço cheio) mantendo os dados.
  - **Locação em nome de terceiro:** todos os campos do snapshot são editáveis (CLAUDE.md §8.6) — o vínculo `associado_id` permanece para histórico.
- **Não-associado:** campos livres — nome, documento (CNPJ ou CPF, validação de dígitos), e-mail, telefone. Sem conta no sistema (CLAUDE.md §5.3).

### 3.2 Evento
- **Sala(s):** multi-select das ativas (cards com capacidade); ao menos uma.
- **Data + período** (manhã/tarde/noite/dia inteiro) com ajuste fino opcional de horário (§2).
- **Disponibilidade inline** ao completar sala+data+horário, consultando a agenda:
  - `livre` → ok;
  - `solicitado` (pendência de outro) → aviso âmbar "já existe solicitação pendente neste horário" — **colaborador pode prosseguir** (atendimento assistido é a Yasmin administrando a fila; vira sobreposição sinalizada no calendário);
  - `ocupado`/`evento_acimm`/`bloqueio` → **seleção impedida** com identificação do ocupante (criaria locação natimorta — a aprovação falharia na constraint).
- `qtd_pessoas` — se exceder a capacidade da(s) sala(s), **aviso não-bloqueante** (a ACIMM conhece exceções; fica registrado).
- `tipo_evento`, `observacoes`.
- **Campos dinâmicos:** renderizar `campos_formulario` ativos (ordem, tipo, obrigatoriedade) → `respostas_formulario` JSONB. Se a tabela estiver vazia, a seção não aparece (o editor chega no Spec 22).

### 3.3 Coffee break (opcional)
- Se existirem `coffee_niveis` ativos: toggle "Incluir coffee" → nível, qtd de pessoas (padrão = pessoas do evento), horário de servir, adicionais do coffee (descrição + valor), observações. Subtotal em tela.
- Sem níveis cadastrados (Spec 08 pendente): seção oculta com nota discreta "Níveis de coffee ainda não configurados".

### 3.4 Adicionais da locação
- Linhas livres: descrição, quantidade, valor unitário (ex.: hora extra, organização de sala, bistrôs). Subtotal em tela.

### 3.5 Pagamento e resumo
- Forma de pagamento preferida (Pix, Boleto Avulso, Boleto - Mensalidade, Isento).
- **Resumo em tempo real** (client, cortesia): valor por sala (via action de consulta que usa `resolverPreco()` — o client nunca calcula preço, só soma exibição), coffee, adicionais, total. Descontos aparecem zerados com nota "regras de desconto em breve" (Spec 20).
- Ações: **"Criar solicitação"** e **"Criar e aprovar"** (checkbox/split button — para o caso comum do assistido: negócio já fechado por telefone).

## 4. Cálculo compartilhado — `lib/locacoes/calcular.ts` (server-only)

```ts
calcularValores(input): Promise<{
  salas: { salaId; valorCentavos }[];
  coffeeCentavos: number;
  adicionaisCentavos: number;
  descontosCentavos: number;   // 0 neste spec; Spec 20 implementa
  totalCentavos: number;
}>
```
- Única fonte de cálculo de locação. Usa `resolverPreco()` por sala; coffee = `valor_pessoa_centavos × qtd` + adicionais do coffee; adicionais = Σ qtd × unitário.
- **Spec 11 (portal do associado) reutiliza esta função** — proibido duplicar cálculo.

## 5. Submit — server action `criarLocacaoAssistida`

Transacional: guard `requireColaborador()` → Zod → revalidações server-side:
1. Salas ativas; preço existente para (sala, data, período, condição) — sem preço = rejeita indicando a combinação (cadastrar no Spec 04);
2. `condicao = 'associado'` → associado existe e `situacao = 'ativo'` (consulta fresca, não confia no form);
3. Conflito: recheca agenda — bloqueante sobreposto rejeita com ocupante; pendente sobreposto **permite** (comportamento assistido);
4. `calcularValores()` do zero — valores do client são descartados;
5. Insere `locacoes` (status `solicitada`, `criado_por` = colaborador, snapshot completo) + `locacao_salas` + `coffee_breaks` + `locacao_adicionais` + `locacao_eventos` (`para: 'solicitada'`, observação "Criada via atendimento assistido");
6. Se "Criar e aprovar": chama `transicionarLocacao(→ aprovada)` na sequência — conflito 23P01 aqui NÃO desfaz a criação: locação fica `solicitada` e o erro amigável explica que a aprovação falhou e por quê;
7. Redirect ao detalhe (`/admin/locacoes/[id]`) com toast.

## 6. Critérios de aceite
- [ ] Prefill via querystring do calendário funciona (sala, data, período).
- [ ] Busca de associado por nome/razão/documento com autocomplete; múltiplos e-mails viram select; suspenso/excluído não passa como condição associado.
- [ ] Snapshot editável (terceiro) preservando `associado_id`; não-associado com validação de CNPJ/CPF.
- [ ] Disponibilidade inline: bloqueante impede, pendente avisa e permite; submit re-valida no servidor.
- [ ] Valores do client ignorados: adulterar payload de valores não afeta o gravado (teste explícito).
- [ ] Sem preço cadastrado para a combinação → erro apontando qual (sala/período/condição/dia).
- [ ] "Criar e aprovar" com conflito deixa a locação em `solicitada` com erro claro; sem conflito, cai no detalhe já `aprovada` com linha do tempo completa (criação + aprovação).
- [ ] Coffee e campos dinâmicos aparecem apenas quando há cadastro; ausência não quebra nada.
- [ ] Migration 0015 aplicada; alterar `horarios_periodos` em `configuracoes` muda os horários do formulário sem deploy.
