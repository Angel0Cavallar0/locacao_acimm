# Spec 05 — Calendário Consolidado (Fase 2, parte 3)

> Depende: Spec 04 (salas). Rota: `/admin/calendario`.
> Referência: CLAUDE.md §9.3, §8.3. Fonte de dados: `agenda_ocupacoes` (Spec 02 §5.3).
> Nota de dependência invertida: ações de aprovar/recusar chegam no Spec 06 — aqui o painel de detalhes apenas exibe e aponta para a locação.

---

## 1. Objetivo

Visão única da agenda de todas as salas — locações, eventos internos e bloqueios — com filtros, alerta visual de sobreposições pendentes e criação de bloqueio manual de sala. É a tela que a equipe da ACIMM vai abrir todo dia de manhã; precisa responder "o que acontece nesta semana?" num relance.

---

## 2. Biblioteca e visões

- **FullCalendar** (`@fullcalendar/react` + `daygrid` + `list` + `interaction`) — **somente plugins gratuitos (licença MIT); plugins premium (resource/timeline) são proibidos** (custo de licença).
- Visões — apenas duas:
  - **Mês** (dayGrid) — padrão, abrindo no mês atual; navegação anterior/próximo disponível.
  - **Lista** (listMonth) — mesma agenda em formato de lista cronológica do mês, útil no mobile e para leitura rápida.
  - Sem visões de semana/dia (timegrid) — decisão de produto para manter a tela simples.
- Locale `pt-br`, fuso exibido `America/Sao_Paulo` (dados em UTC — conversão na borda, padrão do CLAUDE.md).
- Sem lane por sala (exigiria plugin premium): diferenciação por **cor por sala** (paleta determinística derivada do id, com legenda) + filtros de sala (§4) que permitem ver todas juntas, um subconjunto ou uma sala isolada. Título do evento no calendário: `{Sala} · {conteúdo}`.
- **Hover com resumo (shadcn `HoverCard`):** ao passar o mouse sobre qualquer item do calendário, exibir card com informações resumidas — sala, horário, e conforme a origem: locatário + status (locação), título + prioridade + inscritos (evento), motivo (bloqueio). No touch (mobile), o hover não existe: o toque abre direto o painel de detalhes (§7). O clique no desktop também abre o painel — o hover é só leitura rápida.

## 3. Dados

- Server Component carrega o range visível inicial; mudança de range/filtros busca via server action `listarAgenda` (guard `requireColaborador()`, Zod no range — máx. 62 dias por consulta).
- Query: `agenda_ocupacoes` no range, com joins:
  - `origem = 'locacao'` → nº da locação, nome do locatário, status, qtd_pessoas;
  - `origem = 'evento_interno'` → título, prioridade, qtd_inscritos;
  - `origem = 'bloqueio'` → motivo.
- Mapeamento visual:
  - **Locação bloqueante** (aprovada→realizada): cor sólida da sala.
  - **Solicitação pendente** (`bloqueante = false`): mesma cor com padrão listrado/translúcido + ícone de relógio.
  - **Evento interno**: cor sólida com ícone/badge distinto; borda de destaque se `prioridade = 'alta'`.
  - **Bloqueio**: cinza hachurado com motivo.

## 4. Filtros e cabeçalho

- Chips de sala (multi; padrão todas as ativas), filtro de status (pendentes / confirmadas / eventos / bloqueios) e por responsável (`criado_por`) — combináveis, refletidos na URL (`searchParams`) para link compartilhável.
- Contadores do range visível: X locações, Y pendentes, Z eventos.
- Botões: "Novo bloqueio" (§6) e "Nova locação" (aponta para `/admin/locacoes/nova` — stub até o Spec 07).

## 5. Alertas de sobreposição (regra §8.3)

- Ao carregar o range, detectar no servidor sobreposições envolvendo pendências: pendente × pendente e pendente × bloqueante na mesma sala (`periodo && periodo`).
- Exibição: banner no topo ("⚠ N sobreposições pendentes neste período") abrindo painel lateral com a lista (sala, horário, envolvidos) — cada item leva à locação; no grid, os eventos envolvidos ganham realce de atenção.
- É informativo/administrativo (a responsável decide) — nenhuma ação automática.

## 6. Bloqueio manual de sala

- Dialog "Novo bloqueio": sala, data, hora início/fim (ou dia inteiro), motivo (obrigatório — ex.: "Manutenção do ar-condicionado").
- Server action `criarBloqueio` (guard + Zod): insere em `agenda_ocupacoes` com `origem = 'bloqueio'`, `bloqueante = true`.
  - Violação da constraint de exclusão (`23P01` — já existe ocupação bloqueante no horário) → erro amigável indicando o que ocupa o horário.
- Clicar num bloqueio → painel com detalhes + "Remover bloqueio" (com confirmação).

### Migration `0014_bloqueios`

```sql
alter table agenda_ocupacoes
  add column motivo text,
  add column criado_por uuid references auth.users(id);

comment on column agenda_ocupacoes.motivo is
  'Preenchido apenas quando origem = bloqueio (motivo do bloqueio manual)';

-- garante coerência: bloqueio manual sempre tem motivo; demais origens nunca têm
alter table agenda_ocupacoes
  add constraint bloqueio_exige_motivo
  check (
    (origem = 'bloqueio' and motivo is not null and length(trim(motivo)) > 0)
    or (origem <> 'bloqueio' and motivo is null)
  );
```

As funções de trigger que sincronizam `agenda_ocupacoes` (Spec 02 §5.3) não tocam nessas colunas — nenhuma alteração nelas é necessária; apenas validar após aplicar.

## 7. Painel de detalhes (clique em item)

Sheet lateral com resumo conforme a origem:
- **Locação:** nº, status (badge), locatário, sala(s), horário, pessoas, valor total, botão "Abrir locação" → `/admin/locacoes/[id]` (stub `PaginaEmConstrucao` até o Spec 06 — nunca 404).
- **Evento interno:** título, prioridade, inscritos (quando sincronizado), botão "Abrir evento" (stub até o Spec 17).
- **Bloqueio:** motivo, quem criou, remover.

## 8. Interação e atualização

- **Drag-and-drop de eventos: nunca** — decisão de produto permanente (gera ruído de usabilidade e remarcar locação é operação da máquina de estados, com recálculo e notificações — Spec 06). Nenhum spec futuro deve reintroduzir.
- Clique/seleção em slot vazio abre menu: "Nova locação neste horário" (leva ao stub com querystring pré-preenchida) ou "Bloquear horário".
- Revalidação: após qualquer action e no focus da janela. **Supabase Realtime é opcional** (melhoria futura, não critério de aceite).
- Estado de carregamento com skeleton; range navegado mantém filtros.

## 9. Critérios de aceite

- [ ] Visões Mês (padrão, mês atual) e Lista funcionais em pt-BR, horários exibidos em America/Sao_Paulo; nenhuma visão de semana/dia presente.
- [ ] Hover (shadcn HoverCard) mostra o resumo correto por origem no desktop; no touch, o toque abre o painel de detalhes diretamente.
- [ ] Filtro de salas permite ver todas, subconjunto ou uma sala isolada, com a legenda refletindo a seleção.
- [ ] Todos os tipos de ocupação aparecem com a distinção visual definida; legenda de cores por sala presente.
- [ ] Filtros combináveis e persistidos na URL; contadores corretos no range.
- [ ] Sobreposições pendentes geram banner + painel com navegação ao item; nenhum falso positivo com bloqueante × bloqueante (impossível por constraint).
- [ ] Bloqueio manual cria/remove com sucesso; conflito 23P01 vira mensagem amigável com o ocupante do horário.
- [ ] Nenhum plugin premium do FullCalendar no bundle.
- [ ] Consulta limitada a 62 dias por chamada; range maior é rejeitado pela action.
- [ ] Migration 0014 aplicada; triggers da agenda seguem íntegros (testar transição de status após a migration).
