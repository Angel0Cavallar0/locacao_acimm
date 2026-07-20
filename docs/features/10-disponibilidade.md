# Spec 10 — Disponibilidade (Fase 3, parte 2)

> Depende: Spec 09 (auth/shell do portal), Spec 05 (agenda populada), Spec 04 (salas/preços).
> Referência: CLAUDE.md §10.3, §8.3. Rota: `/disponibilidade` (guard `requireAssociado()`).
> Fonte de dados: view `disponibilidade` (Spec 02 §6) — NUNCA `agenda_ocupacoes` direto no portal.

---

## 1. Objetivo

Associado consulta a agenda por dia e sala, vê o estado de cada período (livre / indisponível / aguardando aprovação / evento ACIMM), o preço da sua condição, e a partir daqui: inicia uma solicitação, entra na fila de espera ou recebe o convite para evento da ACIMM. Mobile-first — é a tela mais usada do portal.

---

## 2. Estrutura da tela

- **Seletor de data:** dia atual como padrão; setas anterior/próximo + date picker (shadcn `calendar`). Limites: passado bloqueado; futuro até **+180 dias**.
- **Filtros:** sala (multi-select; padrão todas as ativas) e capacidade mínima (slider/select — filtra salas com `capacidade >= x`). Persistidos na URL.
- **Cards de sala** (uma coluna no mobile, grid no desktop): foto de capa, nome, capacidade, equipamentos resumidos (+n), e a **régua de períodos** do dia selecionado.

## 3. Régua de períodos (o coração da tela)

Para cada sala, quatro chips — manhã / tarde / noite / dia inteiro — com horários vindos de `configuracoes.horarios_periodos` (Spec 07 §2). Estado calculado no servidor por interseção do slot do período com os registros da view no dia:

| Estado | Cálculo | Visual | Ação no toque |
|---|---|---|---|
| **Livre** | nenhuma linha da view intersecta E existe preço vigente (Spec 04 §4) para a condição | chip verde com **preço** (§4) | → `/locacoes/nova?sala=&data=&periodo=` (stub até o Spec 11) |
| **Aguardando aprovação** | intersecta apenas `situacao = 'solicitado'` | chip âmbar "Solicitado" | dialog da **fila de espera** (§5) |
| **Indisponível** | intersecta `ocupado` | chip cinza "Indisponível" | dialog: "Este horário já está reservado" + sugestão de outra data + fila de espera |
| **Evento ACIMM** | intersecta `evento_acimm` | chip destacado com o **título do evento** | dialog do **convite** (§6) |
| **Sem preço** | nenhum preço vigente p/ condição | chip cinza "Não disponível" | tooltip "Período não disponível para locação" |

- `dia_inteiro` conflita se qualquer sub-período estiver tomado.
- Sobreposição mista (ex.: `solicitado` + `ocupado` no mesmo slot): prevalece o estado mais restritivo (`evento_acimm` > `ocupado` > `solicitado`).

## 4. Preço no chip

- Server action `listarDisponibilidade(data, filtros)` retorna, junto do estado, o preço via `resolverPreco()` para a **condição do associado logado**: `situacao = 'ativo'` → preço de associado; caso contrário não exibe preço (o banner do shell já explica que novas locações estão indisponíveis, e os chips livres ficam sem CTA para ele).
- O preço aqui é informativo (cortesia) — o cálculo oficial continua sendo o do submit (Spec 11 → `calcularValores()`).

## 5. Fila de espera (dialog)

- Conteúdo: sala, data, período; nome e contato **pré-preenchidos do associado** (editáveis — pode preferir outro telefone).
- Server action `entrarFilaEspera` (guard): Zod → impede duplicata (mesmo associado + sala + data ainda não atendida) → insert em `lista_espera` (`associado_id`, ordem = `criado_em`).
- Confirmação: "Você está na fila. A ACIMM entrará em contato se o horário for liberado." Item some da tela? Não — chip permanece no estado real; o dialog passa a mostrar "Você já está na fila desta data" com posição aproximada (nº de pessoas à frente).

## 6. Convite para evento ACIMM (dialog)

- Título do evento + mensagem: "Este horário está reservado para um evento da ACIMM. Que tal participar?"
- Botão "Ver evento no Sympla" **apenas quando houver URL** (a coluna `sympla_url` chega com o sync do Spec 17 — renderização null-safe até lá).
- Rodapé fixo (regra §8.3c): "Precisa desta sala especificamente nesta data? Fale com a equipe da ACIMM: {contato}" — contato vindo de `configuracoes.contato_acimm`.

**Migration `0017_config_contato`:**
```sql
insert into configuracoes (chave, valor, descricao) values (
  'contato_acimm',
  '{"telefone": "", "whatsapp": "", "email": ""}',
  'Contatos exibidos ao associado (preencher com os dados oficiais da ACIMM)'
) on conflict (chave) do nothing;
```
(Editável futuramente pela tela de configurações; enquanto vazio, o dialog mostra apenas "Fale com a equipe da ACIMM".)

## 7. Desempenho e segurança

- Consulta sempre de **um dia por vez** (leve; sem varredura de mês). Navegação de dia refaz a consulta com estado de loading nos chips.
- `listarDisponibilidade` valida data dentro da janela (hoje → +180d) e usa somente a view + `salas` ativas + preços — impossível vazar dado de locação de terceiro por construção.
- Nenhum dado da view é exibido além do estado (o associado nunca vê "quem" ocupa — exceto o título de evento ACIMM, que é público por natureza).

## 8. Critérios de aceite

- [ ] Estados dos chips corretos nos cinco casos, incluindo `dia_inteiro` conflitando com sub-período tomado e precedência na sobreposição mista.
- [ ] Preço exibido apenas para associado `ativo`, batendo com `resolverPreco()` (teste comparativo).
- [ ] Período sem preço vigente aparece como "Não disponível" mesmo com agenda livre.
- [ ] Fila de espera: entrada registrada com dados corretos, duplicata bloqueada, posição aproximada exibida ao reabrir.
- [ ] Dialog de evento ACIMM com título, convite, link Sympla condicional e contato da ACIMM da configuração.
- [ ] Navegação de datas limitada (passado e +180d bloqueados no client E no servidor).
- [ ] Suspenso/excluído: consulta normalmente, sem preços e sem CTAs de solicitação/fila.
- [ ] Filtros persistidos na URL; tela fluida no mobile (uma mão, um polegar).
- [ ] Migration 0017 aplicada.
