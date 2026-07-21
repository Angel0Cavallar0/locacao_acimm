# Spec 17 — Eventos ACIMM + Sympla (Bloco E, parte 1)

> Depende: Spec 05 (agenda/calendário), Spec 16 (infra de cron). Token Sympla já configurado na Vercel (`SYMPLA_API_TOKEN`).
> Referência: CLAUDE.md §6.2, §8.2. Rotas: `/admin/eventos`, `/admin/eventos/[id]` (os stubs do calendário ganham destino).
> API Sympla: base **`https://api.sympla.com.br/public/v1.5.1`** (NÃO usar `/public/v3` de exemplos antigos), header `s_token`, **somente leitura**.

---

## 1. Objetivo

Colaborador cadastra eventos internos (cursos/palestras) que ocupam salas na agenda, vincula ao evento correspondente no Sympla para acompanhar inscritos automaticamente, e usa a prioridade + ocupação para remanejar de sala quando fizer sentido.

## 2. Migration `0022_sympla`

```sql
alter table eventos_internos add column sympla_url text;   -- link público (Spec 10 §6 consome)

-- view de disponibilidade passa a expor a URL (recriar):
create or replace view disponibilidade with (security_invoker = false) as
  select o.sala_id, o.periodo,
    case when o.origem = 'evento_interno' then 'evento_acimm'
         when o.bloqueante then 'ocupado' else 'solicitado' end as situacao,
    e.titulo as evento_titulo,
    e.sympla_event_id as evento_sympla_id,
    e.sympla_url as evento_sympla_url
  from agenda_ocupacoes o
  left join eventos_internos e on e.id = o.evento_interno_id;

-- job de sincronização (padrão do Spec 16)
select cron.schedule('sympla-inscritos', '0 * * * *', $$select chamar_cron('sympla-inscritos')$$);
```

## 3. CRUD de eventos (`/admin/eventos`, `/admin/eventos/[id]`)

- **Lista:** próximos eventos (padrão), filtros por sala/prioridade/período, badges: prioridade (alta = borda destaque), Sympla (vinculado + inscritos/capacidade), cancelado.
- **Criar/editar:** título, descrição, sala, data, horário início/fim, prioridade (alta = não remaneja / média / baixa). Guard + Zod; eventos são **sempre bloqueantes** na agenda (trigger do Spec 02 cuida) — conflito na criação (`23P01`) vira erro amigável com o ocupante, padrão do sistema.
- **Recorrência simples (opcional de UX):** "repetir semanalmente até {data}" cria N eventos **independentes** (sem série vinculada — editar/cancelar é por ocorrência; cursos semanais são o caso real). Conflito em uma ocorrência: cria as livres e reporta as que falharam.
- **Cancelar** (não deleta): `cancelado = true` → trigger remove a ocupação; dialog avisa se há vínculo Sympla (o cancelamento lá é manual, na plataforma deles).
- Alterar data/horário/sala revalida conflito e registra (`atualizado_em`; sem máquina de estados — evento é entidade simples).

## 4. Cliente Sympla — `lib/integracoes/sympla.ts`

- Header `s_token: {SYMPLA_API_TOKEN}` (getter lazy — sem token, recursos Sympla ocultos por feature detection; CRUD de eventos segue integral).
- Funções tipadas:
  - `listarEventos({ de, ate, pagina })` → `GET /events` com filtro de janela de datas + `fields` mínimo (id, name, start_date, end_date, url) para payload enxuto;
  - `contarParticipantes(eventId)` → `GET /events/{id}/participants` com `page_size=1`, lendo o **total do objeto de paginação** da resposta (contagem barata, sem iterar páginas); fallback: iterar páginas somando, caso o campo de total não venha (validar na primeira chamada real e fixar o caminho).
- Tratamento: 401 → erro de configuração (alerta em Configurações → Integrações); 429/5xx → backoff e reagenda para o próximo ciclo. Respostas omitem campos `null` por padrão — o parser é tolerante a ausências.

## 5. Vínculo do evento

- No form do evento: seção "Sympla" com busca/dropdown alimentado por `listarEventos` (janela: −30 dias → +1 ano), mostrando nome + data. Selecionar grava `sympla_event_id` + `sympla_url` (a doc confirma `url` no payload do evento) e dispara uma contagem imediata de inscritos.
- Desvincular limpa os três campos (`sympla_event_id`, `sympla_url`, `qtd_inscritos`).
- Um evento Sympla pode ter **apresentações múltiplas** (sessões); v1: o vínculo é ao evento como um todo (inscritos totais) — se a ACIMM usar sessões e precisar de contagem por data, evolução futura via endpoint de apresentações (documentar no código).

## 6. Sync de inscritos — `/api/cron/sympla-inscritos` (hora em hora)

- Seleciona eventos internos **futuros, não cancelados, com vínculo** → `contarParticipantes` sequencial (delay curto entre chamadas — cortesia de rate) → atualiza `qtd_inscritos` + `sincronizado_em`. Lote máx. 30/execução; idempotente.
- Falha individual não derruba o lote (registra e segue); painel de Rotinas (Spec 16 §5) mostra o resultado.

## 7. Remanejamento assistido (regra CLAUDE.md §8.2)

No detalhe do evento com `prioridade ≠ 'alta'`:
- Card **Ocupação**: `qtd_inscritos` / capacidade da sala (barra), última sincronização.
- Painel **Remanejar sala**: lista salas ativas **livres no horário** com `capacidade ≥ qtd_inscritos` (ordena da mais justa para a maior) — ação "Mover para {sala}" revalida conflito na transação e atualiza (trigger realoca a ocupação). Racional exibido: "libera {sala atual} ({capacidade}) para locação".
- Prioridade `alta`: painel oculto com nota "Evento de alta prioridade não é remanejado".
- **Nada é automático** — sugestão + um clique, decisão humana (consistente com a ata). Locação de associado continua intocável por definição.
- Atalho: se existir `lista_espera` para a sala/data liberada, aviso "há {n} interessados na fila desta sala" (conversão é o Spec 19).

## 8. Critérios de aceite
- [ ] CRUD completo; evento ocupa agenda como bloqueante; conflito na criação/edição identifica o ocupante; cancelar libera a agenda.
- [ ] Recorrência cria ocorrências independentes e reporta conflitos parciais sem abortar as livres.
- [ ] Vínculo Sympla: busca real na conta (janela correta, `fields` enxuto), grava id + url, contagem imediata; desvincular limpa.
- [ ] View `disponibilidade` recriada expõe `evento_sympla_url`; botão do portal (Spec 10 §6) passa a aparecer para eventos vinculados.
- [ ] Sync horário atualiza inscritos com lote/idempotência; 401 gera alerta de configuração; 429 não explode (backoff).
- [ ] Remanejamento: só ≠ alta, só salas livres com capacidade suficiente, revalidação transacional, aviso de fila de espera quando houver.
- [ ] Sem `SYMPLA_API_TOKEN`: CRUD funciona, seções Sympla ocultas, cron vira no-op logado.
