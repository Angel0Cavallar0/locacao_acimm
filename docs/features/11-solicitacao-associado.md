# Spec 11 — Solicitação de Locação pelo Associado (Fase 3, parte 3)

> Depende: Spec 10 (entrada + estados de disponibilidade), Spec 07 (`calcularValores()`, `horarios_periodos`, render de campos dinâmicos), Spec 09 (guard).
> Referência: CLAUDE.md §10.4, §8.3, §4. Rota: `/locacoes/nova` (prefill `?sala=&data=&periodo=` vindo da disponibilidade).
> Espelho do Spec 07 com regras próprias do portal — **reutiliza as mesmas libs; qualquer duplicação de cálculo é defeito.**

---

## 1. Objetivo

Associado **ativo** solicita locação num formulário guiado em etapas, com valores em tempo real e as três regras de conflito aplicadas. A solicitação nasce `solicitada` e cai na fila de aprovação do colaborador.

## 2. Diferenças deliberadas em relação ao fluxo assistido (Spec 07)

| Tema | Assistido (colaborador) | Portal (associado) |
|---|---|---|
| Pendência sobreposta | avisa e **permite** | **rejeita** + oferece fila de espera (§8.3b — portal não cria solicitação concorrente) |
| Ajuste fino de horário | permitido | **não** — período fechado (manhã/tarde/noite/dia inteiro); necessidade especial vai em observações e a ACIMM ajusta |
| Adicionais (hora extra etc.) | lança no formulário | **não** — adicionais são negociados/lançados pelo colaborador no detalhe |
| Condição/preço | escolhe associado ou não | sempre `associado` (guard exige `situacao = 'ativo'`) |
| Criar e aprovar | disponível | inexistente — aprovação é sempre do colaborador |

## 3. Acesso

- Guard `requireAssociado()` + `situacao = 'ativo'` verificado **fresco no servidor** em cada action (não confia na sessão/banner). Não-ativo que acessar a rota → tela explicativa com contato da ACIMM (`contato_acimm`), sem formulário.
- Anti-abuso: máximo **5 solicitações abertas** (`solicitada`/`em_analise`) por associado — a sexta é bloqueada com orientação de aguardar ou contatar a ACIMM. Rate limit no submit (IP + associado).

## 4. Etapas do formulário

Stepper mobile-first (uma etapa por tela no celular), estado preservado entre etapas; voltar não perde dados.

### Etapa 1 — Sala e data
- Multi-select de salas ativas (cards com foto/capacidade) + data + período (chips com preço, mesmos estados do Spec 10 — componente compartilhado).
- Somente slot **livre** em TODAS as salas selecionadas permite avançar. Nos demais estados, inline:
  - `solicitado` → "Horário já solicitado por outro associado, aguardando aprovação" + botão **fila de espera** (dialog do Spec 10 §5);
  - `ocupado` → indisponível + **próximas datas livres**: server action `sugerirDatas(salas, periodo)` retorna até 5 datas futuras com o slot livre em todas as salas escolhidas (atalho de um toque para trocar a data) + fila de espera;
  - `evento_acimm` → dialog do convite (Spec 10 §6).
- Prefill da querystring aplicado e revalidado (estado pode ter mudado desde a tela anterior).

### Etapa 2 — Seus dados
- Snapshot pré-preenchido do associado: razão social/nome, documento (somente leitura), e-mail (select quando `emails[]` > 1), telefone (editável).
- Toggle **"Locação em nome de terceiro"** (CLAUDE.md §8.6): libera edição de nome/documento/e-mail/telefone do locatário do contrato — `associado_id` permanece.
- Nota: "Dados cadastrais desatualizados? Fale com a ACIMM" (fonte é o Sophus).

### Etapa 3 — Sobre o evento
- Qtd de pessoas (aviso não-bloqueante se exceder capacidade da menor sala selecionada), tipo do evento, observações.
- Campos dinâmicos de `campos_formulario` ativos (mesmo renderer do Spec 07 — componente compartilhado `CamposDinamicos`).

### Etapa 4 — Coffee break (se houver nível ativo)
- Idêntica ao Spec 07 §3.3 (componente compartilhado): toggle, nível com valor por pessoa, qtd (padrão = pessoas do evento), horário de servir, observações. **Sem** adicionais de coffee no portal (mesma lógica dos adicionais — colaborador lança).

### Etapa 5 — Pagamento e revisão
- Forma de pagamento preferida (as quatro; "Isento" **não aparece** no portal — isenção é decisão da ACIMM).
- Resumo completo: salas com valores, coffee, total — vindos de server action `previewValores` que chama `calcularValores()` (client apenas exibe). Descontos com nota "avaliados pela ACIMM" (Spec 20).
- Aviso do fluxo: "Sua solicitação será analisada pela ACIMM. Você receberá a confirmação e o contrato por e-mail e WhatsApp." (o contrato assinado é o instrumento de aceite — sem checkbox de termos).
- Botão **"Enviar solicitação"**.

## 5. Submit — server action `criarSolicitacao`

Transacional: guard + ativo fresco → Zod → revalidações:
1. Limite de 5 abertas; salas ativas; preço vigente para cada (sala, data, período) na condição associado;
2. **Disponibilidade re-checada**: qualquer sobreposição (bloqueante OU pendente) em qualquer sala selecionada → rejeita com o estado atual e as saídas (§4 etapa 1) — no portal, pendente também barra;
3. `calcularValores()` do zero (payload de valores do client descartado);
4. Insere `locacoes` (status `solicitada`, `condicao = 'associado'`, `criado_por` = user do associado, snapshot) + `locacao_salas` + `coffee_breaks` + `locacao_eventos` ("Criada pelo associado via portal");
5. Hook de efeito `solicitada` → notificação de recebimento (no-op até o Spec 15 — registrado em `lib/locacoes/efeitos.ts`);
6. Redirect `/locacoes/[id]` (stub até o Spec 12) com tela de sucesso: nº da solicitação, resumo e próximos passos.

Corrida entre dois associados no mesmo slot (ambos passaram na etapa 1): o segundo submit falha na revalidação (2) com mensagem clara + fila de espera — nunca erro genérico.

## 6. Critérios de aceite
- [ ] Fluxo completo com prefill; voltar entre etapas preserva dados; mobile confortável.
- [ ] Pendência sobreposta REJEITA no portal (contraste com o assistido testado lado a lado); `sugerirDatas` retorna apenas datas realmente livres para todas as salas.
- [ ] Multi-sala: avançar só com todas livres; valores por sala corretos no resumo e no banco.
- [ ] Não-ativo não alcança o formulário nem as actions (teste direto de action com sessão de suspenso).
- [ ] Limite de 5 solicitações abertas aplicado no servidor.
- [ ] Adulteração de valores/condição no payload não afeta o gravado; "Isento" rejeitado como forma vinda do portal.
- [ ] Corrida entre dois associados: segundo recebe mensagem específica com fila de espera; banco fica íntegro.
- [ ] Linha do tempo da locação registra a criação pelo associado; solicitação aparece imediatamente no admin (lista Pendentes + calendário como pendente listrado).
- [ ] Componentes `CamposDinamicos`, chips de período e dialog de fila reutilizados dos Specs 07/10 (sem cópias).
