# CLAUDE.md — Sistema de Locação de Ambientes ACIMM

> Arquivo de contexto permanente para o Claude Code. Leia este arquivo antes de qualquer tarefa.
> Specs detalhados por módulo ficam em `docs/features/` — leia apenas o spec do módulo em que estiver trabalhando.

---

## 1. Visão geral

Sistema web **de uso público** para a **ACIMM (Associação Comercial e Empresarial de Mogi Mirim)** substituir o fluxo manual (WhatsApp + planilha Google + AutoCrat) de locação dos ambientes de sua sede. As salas **não são fixas no sistema**: os colaboradores cadastram quantas salas forem necessárias, com os nomes, capacidades e preços que quiserem, tudo pelo painel administrativo — inclusive criar, renomear ou desativar ambientes a qualquer momento, sem intervenção técnica. O sistema também suporta locação de múltiplas salas em uma mesma reserva.

Dois perfis com interfaces distintas:

- **Colaborador (ACIMM):** gestão completa — salas, calendário consolidado, aprovação/recusa, contratos, comprovantes, coffee break, comissões, eventos internos, edição do formulário.
- **Associado:** consulta de disponibilidade, solicitação de locação, histórico próprio, acompanhamento de status.

Fluxo central: associado solicita → colaborador aprova/recusa → sistema gera contrato (Autentique), envia p/ assinatura, envia instruções de pagamento, confirma e notifica (WhatsApp + e-mail) — tudo automático após a aprovação.

**Projeto desenvolvido pela FacioFlow.** Nunca expor nomes de stack/ferramentas em textos, e-mails ou telas visíveis ao cliente final.

---

## 2. Stack

| Camada | Tecnologia | Observações |
|---|---|---|
| Frontend | **Next.js 16.2+** (App Router, Turbopack), React 19, TypeScript strict | NÃO usar Next.js 15 (Maintenance LTS, EOL out/2026). Verificar patch mais recente ao iniciar — houve cluster de CVEs corrigido em 16.2.6+ |
| UI | Tailwind CSS v4 + shadcn/ui | Design tokens com a identidade visual da ACIMM (aguardando material de marca) |
| Banco/Auth | **Supabase** (projeto dedicado ACIMM) | Postgres + Supabase Auth + RLS obrigatório em todas as tabelas. MCP do projeto ainda não disponível — gerar migrations SQL versionadas em `supabase/migrations/` |
| Automações | **n8n 2.11.4** (self-hosted FacioFlow) | Neste projeto o n8n é usado **somente** para sincronizar dados de associados do Sophus → Supabase. Todo o resto roda na aplicação (server actions / route handlers / cron da Vercel) |
| WhatsApp | Evolution API v2 | Mensagens transacionais |
| E-mail | **Resend** | Canal paralelo/fallback do WhatsApp. Free tier 10k/mês |
| Assinatura digital | **Autentique** (API — chave já disponível) | Lei 14.063/2020. Free até 20 docs/mês; monitorar volume |
| Validação de associado | **Sophus** (sophus.com.br) | OAuth client credentials (client_id + client_secret já disponíveis). Integração via n8n → tabela local |
| Eventos internos | **Sympla** (API pública — chave já disponível) | **Somente leitura** — ver §6.2 |
| Calendário | **Google Calendar API** (OAuth 2.0) | Espelho dos eventos/locações — ver §6.4 |
| Hospedagem | Vercel (**plano Hobby**) | Todas as secrets como environment variables na Vercel — ver §3 |
| Agendamentos | **Supabase pg_cron + pg_net** | Todos os jobs agendados rodam via Supabase — ver §2.1 |

### 2.1 Agendamentos (cron) — estratégia

Todos os jobs agendados são implementados com **pg_cron dentro do Postgres do Supabase**, usando **pg_net** para fazer chamadas HTTP aos route handlers da aplicação. Não usar Vercel Cron.

1. Habilitar as extensões `pg_cron` e `pg_net` no projeto Supabase (Dashboard → Database → Extensions).
2. Cada job agendado faz um `net.http_post` para `{APP_URL}/api/cron/<job>` com header `Authorization: Bearer <CRON_SECRET>`.
3. O route handler valida o `CRON_SECRET` e executa a tarefa (a lógica vive no app, o Supabase só dispara o gatilho).

Jobs previstos:

| Job | Frequência | Rota |
|---|---|---|
| Sync inscritos Sympla | a cada 1h | `/api/cron/sympla-inscritos` |
| Retry de notificações falhas | a cada 15min | `/api/cron/notificacoes-retry` |
| Lembrete pré-evento | 1x/dia (manhã) | `/api/cron/lembretes` |
| PDF semanal de coffee | 1x/semana | `/api/cron/coffee-pdf` |
| Sync Sophus | — | feito pelo n8n (Schedule Trigger próprio, sem depender da Vercel) |

Atenção: projetos Supabase free pausam após ~7 dias sem atividade — com o app em produção isso não ocorre, mas em ambientes parados (staging) os crons param junto. Alternativa de contingência: o n8n self-hosted da FacioFlow pode assumir qualquer um desses gatilhos via Schedule Trigger + HTTP Request com o mesmo `CRON_SECRET`.

### Padrões de código
- UI e todo texto visível: **português brasileiro**.
- Banco: tabelas e colunas em português, snake_case (`locacoes`, `salas`, `associados`).
- Código TS: componentes/variáveis em inglês, exceto termos de domínio (`locacao`, `coffeeBreak`, `associado` são aceitáveis).
- Valores monetários: **inteiros em centavos** no banco; formatação BRL só na UI.
- Datas/horas: `timestamptz` UTC no banco; exibição em `America/Sao_Paulo`.
- Validação com Zod em toda entrada (forms + API).

---

## 3. Variáveis de ambiente (Vercel)

**Regra absoluta: nenhuma API key, secret ou token no código, em arquivo commitado ou no client bundle.** Tudo via environment variables na Vercel (Production/Preview/Development) e `.env.local` no dev (git-ignored). Manter `.env.example` atualizado com os nomes (sem valores).

| Variável | Uso | Exposição |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase | pública |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave anon (protegida por RLS) | pública |
| `SUPABASE_SERVICE_ROLE_KEY` | operações administrativas server-side | **server only** |
| `SOPHUS_CLIENT_ID` / `SOPHUS_CLIENT_SECRET` | OAuth Sophus (usada no n8n) | **server only** |
| `SYMPLA_API_TOKEN` | header `s_token` da API Sympla | **server only** |
| `AUTENTIQUE_API_TOKEN` | geração/envio de contratos | **server only** |
| `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` / `EVOLUTION_INSTANCE` | WhatsApp transacional | **server only** |
| `RESEND_API_KEY` | e-mail transacional | **server only** |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth Google Calendar | **server only** (client_id pode ir ao client se necessário) |
| `GOOGLE_REDIRECT_URI` | callback OAuth — ver §6.4 | **server only** |
| `APP_URL` | URL canônica da aplicação | pública |
| `CRON_SECRET` | proteger route handlers de cron/webhook | **server only** |
| `TOKEN_ENCRYPTION_KEY` | criptografar refresh tokens Google no banco | **server only** |

Variáveis `NEXT_PUBLIC_*` são embutidas no bundle — jamais usar esse prefixo para secrets. Ao adicionar integração nova, adicionar aqui e no `.env.example`.

---

## 4. Segurança server-side (app público — inegociável)

O app é exposto na internet. **Nenhuma verificação pode existir apenas no client.** O client é UX; a autoridade é sempre o servidor:

1. **Toda mutação** (criar locação, aprovar, cancelar, editar sala etc.) acontece via Server Action ou Route Handler que, nesta ordem: (a) valida a sessão Supabase no servidor; (b) valida o perfil/role (colaborador vs associado); (c) valida o payload com Zod; (d) revalida as regras de negócio.
2. **Preço nunca vem do client.** O valor exibido em tempo real no formulário é cortesia visual; no submit, o servidor **recalcula** locação + coffee + adicionais + descontos + período grátis a partir das tabelas de preço e grava o valor calculado por ele. Divergência → rejeitar.
3. **Disponibilidade revalidada no submit** dentro de transação, com constraint de exclusão (`EXCLUDE USING gist` com `tsrange`) por sala × horário no Postgres como última linha de defesa contra race condition.
4. **Condição de associado revalidada no servidor** contra a tabela `associados` (status ativo) a cada solicitação — nunca confiar em flag vinda do form.
5. **Transições de status** só por funções server-side dedicadas que validam a transição permitida (máquina de estados) e registram em `locacao_eventos`.
6. **RLS em todas as tabelas** como segunda camada: associado só lê as próprias locações; escrita de aprovação/preço/status só via role de colaborador ou service role.
7. **Rate limiting** nas rotas públicas (login, cadastro, criação de solicitação) — usar Vercel Firewall/Upstash. Proteção básica contra enumeração de CNPJ no login (resposta genérica em falha).
8. Route handlers de cron/webhook exigem `CRON_SECRET`.
9. `SUPABASE_SERVICE_ROLE_KEY` jamais importada em código que possa vazar pro client (usar módulos `server-only`).

---

## 5. Autenticação e perfis de acesso

Supabase Auth (e-mail + senha) como base. Três situações de acesso:

### 5.1 Colaborador
- Login em `/admin/login` com **e-mail + senha**.
- Perfil na tabela `colaboradores` vinculada ao `auth.users`, com `role` (`admin` | `colaborador` — enum `role_colaborador` já existente no banco).
- Middleware protege todo o segmento `/admin/*`; sem sessão de colaborador → redirect para login. Checagem de role repetida em cada server action (middleware não é suficiente sozinho).
- Colaborador é criado por convite de um admin (sem cadastro público de colaborador).

### 5.2 Associado
- Login em `/login` com **CNPJ + e-mail + senha** (os três obrigatórios).
- Implementação: autentica via Supabase Auth (e-mail + senha); em seguida o servidor valida que o CNPJ informado bate com `associados.documento` do perfil vinculado. CNPJ divergente = falha de login (mensagem genérica, sem revelar qual campo errou).
- **Primeiro acesso:** associado informa CNPJ → servidor busca na tabela `associados` (espelho Sophus) → se ativo, confirma identidade (e-mail cadastrado no Sophus recebe código de verificação) → define senha. Sem match/inativo → mensagem orientando contato com a ACIMM.
- **Atenção (visto na planilha atual):** há locatários PF/MEI com **CPF**. Campo `documento` aceita CNPJ ou CPF, com validação de dígitos.

### 5.3 Não-associado
- **Não tem login.** Locação de não-associado (preço cheio) é criada pelo colaborador via atendimento assistido (§9, tela Nova Locação). O não-associado recebe contrato e comunicações por e-mail/WhatsApp como locatário externo, sem conta no sistema.

---

## 6. Integrações

### 6.1 Sophus (dados do associado)
- Workflow n8n (OAuth client credentials) busca associados e faz **upsert** em `associados`: documento, razão social, nome fantasia, e-mail, telefone, **situação (ativo/suspenso/excluido — enum `situacao_associado`)**, `sincronizado_em`. **Já implementado e populado** (~2k associados).
- A aplicação **nunca chama o Sophus diretamente** — valida sempre contra a tabela local (Sophus fora do caminho crítico).
- Sync periódico (~6h). Somente status **ativo** loca com condição de sócio.

### 6.2 Sympla (eventos internos)
- API pública: base `https://api.sympla.com.br/public/v1.5.1`, autenticação via header `s_token: <SYMPLA_API_TOKEN>`. Retorna apenas eventos do organizador dono do token.
- **A API é somente leitura — não é possível criar evento no Sympla.** Fluxo: a ACIMM cria o evento no Sympla; no nosso sistema, ao criar/editar um **evento interno**, o colaborador pode **vincular** a um evento Sympla via dropdown/busca alimentado por `GET /events` (suporta filtro por janela de datas e parâmetro `fields`).
- Guardar `sympla_event_id` no evento interno. Job periódico (pg_cron — §2.1) consulta `GET /events/{event_id}/participants` e atualiza `qtd_inscritos` — insumo da regra de remanejamento por capacidade (§8.2).
- Encapsular em `lib/integracoes/sympla.ts` com tipagem das respostas; tratar paginação e rate limit com backoff.

### 6.3 Autentique (contratos)
- Chave de API já disponível (`AUTENTIQUE_API_TOKEN`). API GraphQL: criar documento a partir do PDF do contrato gerado, definir signatário (e-mail), receber webhooks/polling de status de assinatura.
- Abstrair em `lib/integracoes/autentique.ts` atrás de uma interface (`ServicoAssinatura`) para permitir mock em dev/testes.
- Guardar em `contratos`: id do documento Autentique, status, link de assinatura, assinado_em.

### 6.4 Google Calendar (espelho de agenda)
- **Toda locação aprovada e todo evento interno criado geram evento no Google Calendar.** Atualização/cancelamento da locação propagam para o evento (guardar `google_event_id`).
- **O banco continua sendo a fonte da verdade de disponibilidade.** O Calendar é espelho unidirecional (sistema → Calendar); nunca ler do Calendar para decidir conflito.
- **Vínculo de conta via OAuth 2.0** (o app será criado no GCP):
  - Escopo mínimo: `https://www.googleapis.com/auth/calendar.events` (+ `calendar.readonly` se precisar listar calendários para o usuário escolher qual vincular).
  - Fluxo: authorization code com `access_type=offline` e `prompt=consent` para obter **refresh token**; tokens armazenados criptografados (AES-GCM com `TOKEN_ENCRYPTION_KEY`) na tabela `google_conexoes`.
  - **Rota de callback fixa no código:** `/api/google/callback`.
    - Dev: `http://localhost:3000/api/google/callback`
    - Produção provisória: `https://<projeto>.vercel.app/api/google/callback`
    - Produção final: `https://<dominio-definitivo>/api/google/callback`
    - Registrar as três como *Authorized redirect URIs* no GCP.
- **Vínculo único — uso interno da ACIMM apenas.** O associado NÃO conecta conta Google no sistema:
  1. **Admin → Configurações → Integrações:** colaborador admin conecta a conta Google da ACIMM (única conexão OAuth do sistema). Todos os eventos (locações aprovadas + eventos internos) são criados no calendário dessa conta. Sem conexão ativa, o espelho fica em fila de retry — nunca bloquear o fluxo de locação por falha no Calendar.
  2. **Associado recebe convite do Google Agenda:** ao criar o evento no calendário da ACIMM, incluir o **e-mail de cadastro do associado** (e do locatário externo, quando houver) como `attendee` e usar `sendUpdates: "all"` na chamada da Calendar API — o Google envia o convite padrão por e-mail e o evento aparece na agenda pessoal dele ao aceitar. Atualização/cancelamento da locação propagam pelo mesmo mecanismo.
- **Vantagem operacional:** como só a conta da própria ACIMM autoriza o app, o app OAuth no GCP pode permanecer em modo *testing* com a conta da ACIMM como test user — **não é necessária verificação do app pelo Google**.

### 6.5 Evolution API (WhatsApp) e Resend (e-mail)
- Notificações sempre em par (WhatsApp + e-mail); falha em um canal não bloqueia o outro nem a transição de status. Fila/retry com registro em `notificacoes`.
- Templates de mensagem centralizados em `lib/notificacoes/templates.ts`, texto em pt-BR, sem menção a ferramentas.

---

## 7. Modelo de dados (visão de domínio)

Preços e salas **não são hardcoded** — cadastráveis pelo painel. Seed real será feito depois, direto no banco. Detalhar em `docs/features/database.md` antes da primeira migration.

- `salas` — nome, descrição, capacidade, equipamentos, fotos, status.
- `precos_sala` — sala × período (manhã/tarde/noite/dia inteiro) × dia da semana × condição (associado/não-associado), com vigência por data.
- `associados` — espelho Sophus + vínculo com `auth.users`.
- `colaboradores` — vínculo com `auth.users`, role.
- `locacoes` — solicitante (associado ou locatário externo), sala(s), data, horário início/fim, nº de pessoas, valores (locação/coffee/adicionais/desconto/total, todos calculados no servidor), observações, status.
  - **Máquina de estados:** `rascunho → solicitada → em_analise → aprovada → contrato_enviado → contrato_assinado → aguardando_pagamento → confirmada → realizada → finalizada`, desvios `recusada` / `cancelada` (com motivo). Constraint de exclusão `tsrange` por sala.
- `locacao_eventos` — auditoria de cada transição (quem, quando, o quê).
- `locacao_adicionais` — hora extra, organização de sala, mobiliário, garrafas etc. (frequentes na planilha atual; não engessar).
- `coffee_breaks` — nível (Bronze/Prata/Ouro — valores por pessoa cadastráveis; hoje R$10,90/20,90/29,90), pessoas, horário de servir, adicionais.
- `contratos` — vínculo Autentique (§6.3).
- `pagamentos` — 1..N por locação (a planilha mostra pagamentos híbridos: coffee no boleto, locação no Pix). Formas: Pix, Boleto Avulso, Boleto - Mensalidade, Isento. Baixa manual na v1.
- `eventos_internos` — cursos/palestras ACIMM, tag de prioridade (alta = não remaneja / média / baixa), `sympla_event_id`, `qtd_inscritos`, `google_event_id`.
- `lista_espera` — sala + data, ordem de chegada, contato.
- `periodos_gratuitos` — consumo do benefício do sócio por ciclo mensal (regras parametrizadas em `configuracoes`).
- `comissoes` — por locação confirmada e coffee aprovado, exportável.
- `google_conexoes` — conexão única da conta ACIMM: refresh token criptografado, calendário alvo, status.
- `notificacoes` — log/fila de envios WhatsApp e e-mail.
- `configuracoes` — regras parametrizáveis (desconto multi-sala, período grátis, prioridades).

---

## 8. Regras de negócio críticas

1. **Disponibilidade — fonte da verdade é o banco** (constraint `tsrange` + revalidação transacional no submit). Google Calendar é só espelho.
2. **Locação de associado nunca é remanejada.** Remanejamento só para eventos internos, conforme tag de prioridade e `qtd_inscritos` (Sympla) vs. capacidade da sala.
3. **Conflito de horário — três cenários, nunca bloquear silenciosamente:**
   - **(a) Horário confirmado/ocupado:** informar indisponibilidade e oferecer segunda opção de data ou entrada na lista de espera.
   - **(b) Horário com solicitação pendente (aguardando aprovação):** exibir informativo de que o horário já foi solicitado por outro associado e está aguardando aprovação, oferecendo entrada na **fila de espera** (não criar solicitação concorrente pelo portal). No painel do colaborador, sobreposições pendentes geram **alerta visual** para a responsável administrar.
   - **(c) Horário ocupado por evento ACIMM:** **convidar o associado a participar do evento** (título e, quando vinculado, link do Sympla) e informar que, caso precise realmente daquela sala específica, deve entrar em contato com a equipe da ACIMM.
4. **Período gratuito do sócio:** aplicado automaticamente quando elegível, com aviso ao exceder e ciclo de renovação visível. Registrar o consumo na locação.
5. **Desconto multi-sala:** automático ao locar múltiplas salas na mesma data; regras em `configuracoes` (pendente ACIMM).
6. **Locação em nome de terceiro:** dados do locatário no contrato editáveis, mantendo vínculo com o associado.
7. **Atendimento assistido:** colaborador cria a locação em nome do associado ou de não-associado; o locatário recebe apenas para confirmar e assinar.
8. **Cálculo de valor em tempo real** no formulário — sempre recalculado no servidor no submit (§4.2).
9. **Baixa de pagamento MANUAL na v1.** Integração bancária é fase futura.
10. **Notificações multicanal** em toda mudança de status + lembrete pré-evento.
11. **Coffee break — PDF semanal** consolidado enviado ao setor de compras via WhatsApp (cron), com geração manual disponível.
12. **Isenções:** locação com valor zero (prefeitura, parceiros, período grátis) sem quebrar contrato/fluxo.

---

## 9. Telas — Painel do Colaborador (`/admin`)

Princípio de design (compromisso com o cliente): **reduzir cliques e eliminar transcrição**. Tudo que hoje é planilha + WhatsApp + e-mail vira visão consolidada com histórico auditável.

### 9.1 Login (`/admin/login`)
E-mail + senha. Recuperação de senha por e-mail. Sem cadastro público.

### 9.2 Dashboard (`/admin`)
- Cards: solicitações pendentes de aprovação (com atalho direto), locações da semana, receita do mês, ocupação do mês (%), comissões acumuladas.
- Lista "Ação necessária": pendências ordenadas por urgência (aprovar, enviar contrato, dar baixa em pagamento, conflitos detectados).
- **Alertas de conflito** em destaque visual (regra §8.3).

### 9.3 Calendário consolidado (`/admin/calendario`)
- Visão mensal/semanal/diária de todas as salas; filtros por sala, status e responsável; cores por status.
- Eventos internos e locações diferenciados visualmente; clique abre painel lateral com detalhes e ações rápidas.
- Botão "Nova locação" e "Novo evento interno" a partir de um slot vazio.

### 9.4 Locações (`/admin/locacoes` e `/admin/locacoes/[id]`)
- Lista com filtros (status, sala, período, associado, forma de pagamento) e busca; colunas espelhando o que a equipe acompanha hoje na planilha (responsável, empresa, sala, período, valores, flags).
- Detalhe da locação: linha do tempo de status (auditoria), dados do locatário, valores discriminados (locação + coffee + adicionais + descontos), contrato (status Autentique + link), pagamentos (registrar baixa manual, anexar comprovante), coffee, observações.
- Ações por status: aprovar (dispara contrato + notificações), recusar (motivo obrigatório, notifica), cancelar, reenviar contrato, marcar pago, editar adicionais.

### 9.5 Nova locação — atendimento assistido (`/admin/locacoes/nova`)
- Mesmo formulário do associado, operado pelo colaborador: busca de associado (nome/documento, dados auto-preenchidos da base Sophus) **ou** cadastro de locatário externo (não-associado, com CNPJ/CPF).
- Cálculo de valor em tempo real; ao salvar, o locatário recebe o fluxo normal (confirmação → contrato → pagamento).

### 9.6 Salas e preços (`/admin/salas`)
- CRUD de salas: nome, descrição, capacidade, equipamentos, fotos, status (ativa/indisponível).
- Por sala: tabela de preços por período × dia da semana × condição (associado/não-associado), com vigência — reajuste cria vigência nova sem tocar no histórico.

### 9.7 Eventos internos (`/admin/eventos`)
- CRUD de eventos ACIMM (cursos/palestras): sala, data/horário, tag de prioridade (alta/média/baixa), descrição.
- **Vincular ao Sympla:** busca/dropdown dos eventos da conta Sympla (`GET /events`); vinculado, exibe inscritos atualizados e badge de sincronização.
- Sugestão de remanejamento quando inscritos << capacidade e existe demanda de locação em conflito (só eventos remanejáveis).

### 9.8 Coffee break (`/admin/coffee`)
- Pedidos da semana/período: locação, nível, pessoas, horário de servir, itens calculados, adicionais.
- Botão "Gerar PDF de compras" (manual) + indicação do próximo envio automático semanal.
- Configuração dos níveis (Bronze/Prata/Ouro): valor por pessoa e composição de itens.

### 9.9 Contratos e comprovantes (`/admin/contratos`)
- Lista de contratos com status de assinatura (Autentique), filtros, download do PDF assinado, reenvio.
- Comprovantes de pagamento vinculados por locação.

### 9.10 Comissões (`/admin/comissoes`)
- Comissões geradas por locação confirmada e coffee aprovado; filtros por período/colaborador; exportação CSV.

### 9.11 Lista de espera (`/admin/lista-espera`)
- Por sala + data, ordem de chegada, contato rápido (link wa.me), conversão em locação em um clique.

### 9.12 Editor de formulário (`/admin/configuracoes/formulario`)
- Personalização dos campos extras que o associado preenche na solicitação (adicionar/remover/reordenar campos dinâmicos), sem intervenção técnica.

### 9.13 Configurações (`/admin/configuracoes`)
- Regras parametrizáveis: desconto multi-sala, período gratuito do sócio, prioridades de evento.
- **Integrações:** vincular conta Google da ACIMM (OAuth §6.4), status das integrações (Sophus sync, Sympla, Autentique, WhatsApp, e-mail).
- Gestão de colaboradores (convite, roles).

---

## 10. Telas — Portal do Associado (`/`)

Interface simplificada, mobile-first (o público hoje resolve tudo pelo WhatsApp no celular).

### 10.1 Página inicial (`/`)
Landing pública e minimalista:
- **Logo da ACIMM** centralizada + título **"Sistema de Locação de Salas"**.
- Dois botões de ação:
  - **"Locar sala"** (primário) → fluxo do associado (`/login`, ou `/disponibilidade` se já autenticado).
  - **"Acesso do colaborador"** (secundário/discreto) → `/admin/login`.
- Sem menu, sem conteúdo institucional — a página existe só para rotear os dois públicos. Responsiva, carregamento leve (logo otimizada, sem JS pesado).

### 10.2 Login (`/login`) e primeiro acesso (`/cadastro`)
- Login: **CNPJ + e-mail + senha** (§5.2). Mensagens de erro genéricas.
- Primeiro acesso: CNPJ → validação na base de associados → verificação por código no e-mail do cadastro Sophus → criação de senha.
- Recuperação de senha por e-mail.

### 10.3 Disponibilidade (`/disponibilidade`)
- Calendário visual por sala com três estados: **livre**, **indisponível** (ocupado/confirmado ou evento ACIMM) e **aguardando aprovação** (solicitação pendente de outro associado). Nunca expor dados de outras locações — apenas o estado do horário.
- Horário de evento ACIMM exibe o título do evento e convite para participar (link Sympla quando vinculado), com orientação para contatar a ACIMM caso precise daquela sala específica (§8.3c).
- Filtros por sala, data e capacidade. CTA "Solicitar locação" a partir de um horário livre; horário pendente oferece "Entrar na fila de espera".

### 10.4 Nova solicitação (`/locacoes/nova`)
Formulário guiado em etapas:
1. **Sala e data:** sala(s), data desejada, período/horário. Conflito segue §8.3: confirmado → segunda data/lista de espera; pendente → informativo "horário já solicitado, aguardando aprovação" + fila de espera; evento ACIMM → convite ao evento + orientação de contato.
2. **Dados do associado:** auto-preenchidos da base (razão social, CNPJ, contato) — apenas confirma. Opção "locação em nome de terceiro" abre campos do locatário do contrato.
3. **Evento:** tipo, nº de pessoas, observações + campos dinâmicos do editor de formulário.
4. **Coffee break:** com/sem; nível (Bronze/Prata/Ouro), horário de servir, adicionais — subtotal em tempo real.
5. **Pagamento e resumo:** forma de pagamento preferida, resumo com valores discriminados (incl. desconto multi-sala e período gratuito quando aplicável), envio.
- Confirmação imediata por WhatsApp + e-mail ("solicitação recebida, em análise").

### 10.5 Minhas locações (`/locacoes` e `/locacoes/[id]`)
- Histórico completo com status em tempo real (pendente, aprovada, contrato enviado, assinado, pagamento, confirmada).
- Detalhe: linha do tempo, link de assinatura do contrato, instruções de pagamento (Pix), envio de comprovante, dados do evento.

### 10.6 Meu perfil (`/perfil`)
- Dados cadastrais (somente leitura — origem Sophus; alteração orientada via ACIMM), troca de senha.
- Nota informativa: os convites de agenda das locações confirmadas chegam automaticamente no e-mail de cadastro (via Google Agenda da ACIMM — §6.4). Nenhuma ação ou vínculo de conta é necessário por parte do associado.

---

## 11. Fases de desenvolvimento

Trabalhar **uma fase por vez**. Antes de codar um módulo, criar/atualizar o spec em `docs/features/<modulo>.md` (telas, tabelas, regras, casos de borda) e validar com Angelo.

- **Fase 0 — Setup:** scaffold Next.js 16 + TS + Tailwind v4 + shadcn/ui, projeto Supabase, estrutura de pastas, envs na Vercel, CI básico.
- **Fase 1 — Fundação:** migrations completas, RLS, seed de dev, auth dos três cenários (§5), middleware, layouts base.
- **Fase 2 — Painel do Colaborador (core):** salas + preços, calendário consolidado, nova locação assistida, máquina de estados, aprovação/recusa, detalhe de locação. *Meta: substituir a planilha já nesta fase.*
- **Fase 3 — Portal do Associado:** login/primeiro acesso, disponibilidade, formulário de solicitação com cálculo em tempo real (recalculado no servidor), histórico/status.
- **Fase 4 — Automações:** contrato + Autentique, notificações WhatsApp/e-mail, lembrete pré-evento, PDF semanal de coffee, comissões.
- **Fase 5 — Integrações:** n8n Sophus→Supabase, Google Calendar (OAuth da conta ACIMM + espelho + convites aos locatários), Sympla (vínculo + sync de inscritos), jobs pg_cron (§2.1).
- **Fase 6 — Regras avançadas:** prioridade/remanejamento, lista de espera, desconto multi-sala, período gratuito automatizado, editor de formulário.
- **Fase 7 — Homologação e entrega:** testes de fluxo completo, treinamento, documentação de uso.

Prazo contratual: 60 dias. Meta interna: primeira versão testável (Fases 0–2) em ~1,5 semana após recebimento dos dados.

---

## 12. Pendências externas (não bloquear — usar fallback)

| Pendência | Fallback até resolver |
|---|---|
| Material de marca ACIMM (logo, cores, fontes) | Tema neutro com tokens centralizados |
| App OAuth no GCP (Angelo vai criar) | Rota `/api/google/callback` já implementada; feature atrás de flag até as credenciais chegarem. Modo *testing* com a conta ACIMM como test user é suficiente (§6.4) — sem verificação Google |
| Regras exatas: desconto multi-sala, período grátis, prioridades | Parametrizado em `configuracoes`, valores placeholder |
| Banco/meio de pagamento da ACIMM (API?) | Baixa manual (padrão da v1) |
| Hospedagem do site institucional / DNS do subdomínio | Domínio Vercel provisório (lembrar de registrar o redirect URI provisório no GCP) |
| Modelo único de contrato | Template com merge tags (o modelo já existe no AutoCrat deles) |

## 13. Segurança e LGPD

- RLS em todas as tabelas; disponibilidade pública não expõe dados de terceiros.
- Dados pessoais (CNPJ/CPF, telefone, e-mail): minimizar exposição, nunca logar em claro.
- Trilha de auditoria completa em `locacao_eventos` — requisito explícito do cliente.
- Token Google (conta ACIMM) criptografado no banco; desvinculação/revogação disponível no painel admin.

## 14. O que NÃO fazer

- Não confiar em validação client-side para nada com efeito no servidor (preço, disponibilidade, condição de sócio, role).
- Não hardcodar preços, valores de coffee, regras de desconto ou do período grátis.
- Não usar Google Calendar como fonte de disponibilidade; não bloquear locação por falha no espelho.
- Não tentar criar eventos no Sympla via API (é somente leitura).
- Não colocar secrets no código, em `NEXT_PUBLIC_*` ou em arquivos commitados.
- Citar a FacioFlow apenas como desenvolvedora da plataforma.
- Não citar stack em textos visíveis ao cliente final.
- Não criar migration sem spec do módulo aprovado.
- Não implementar integração bancária na v1.
- Não usar Next.js 15 ou dependências com CVEs conhecidos sem patch.
