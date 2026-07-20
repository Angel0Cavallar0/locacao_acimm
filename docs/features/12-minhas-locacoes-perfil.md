# Spec 12 — Minhas Locações + Perfil (Fase 3, parte 4 — fecha o Bloco C)

> Depende: Spec 11 (solicitações existem), Spec 06 (máquina de estados), Spec 09 (shell).
> Referência: CLAUDE.md §10.5, §10.6. Rotas: `/locacoes`, `/locacoes/[id]`, `/perfil` (guard `requireAssociado()`).
> Contrato e pagamento ganham ações reais nos Specs 13/14 — aqui as seções nascem null-safe.

---

## 1. Objetivo

Associado acompanha suas locações com status em tempo real e linha do tempo amigável, cancela solicitações ainda não aprovadas, envia comprovante de pagamento e gerencia o próprio perfil.

## 2. Minhas locações (`/locacoes`)

- Cards mobile-first (não tabela): sala(s), data/horário, badge de status com rótulo amigável, valor total.
- Tabs: **Em andamento** (padrão — `solicitada` → `confirmada`), **Realizadas** (`realizada`/`finalizada`), **Encerradas** (`recusada`/`cancelada`), **Todas**. Ordenação: data do evento (próximas primeiro).
- Vazio bem tratado: "Você ainda não tem locações" + CTA para a disponibilidade.
- RLS existente já limita às próprias locações; a página é RSC (dados via servidor).

## 3. Detalhe (`/locacoes/[id]`)

### 3.1 Status e linha do tempo — versão AMIGÁVEL (não é a do admin)
- Stepper visual do fluxo: Solicitada → Em análise → Aprovada → Contrato → Pagamento → Confirmada → Realizada (encerradas mostram o desfecho com o motivo).
- Linha do tempo **sanitizada**: apenas transições de status com rótulos em linguagem de cliente, data/hora e autor genérico — **"Você"**, **"ACIMM"** ou **"Sistema"** (nunca nome de colaborador). Motivo de recusa/cancelamento aparece; **observações internas jamais**.

### 3.2 Migration `0018_privacidade_timeline` (obrigatória neste spec)
A policy de select do associado em `locacao_eventos` (Spec 02 §6) expõe colunas demais (`observacao`, `autor_user_id`, `dados`) a uma consulta direta via anon key — notas internas do colaborador vazariam. Correção:

```sql
drop policy if exists locacao_eventos_associado_select on locacao_eventos;
-- associado deixa de ler a tabela diretamente;
-- a linha do tempo do portal é servida por RSC/server action (service role) já sanitizada.
```
(Colaborador mantém select; portal recebe DTO com `{ de, para, criado_em, autorTipo, motivo? }`.)

### 3.3 Seções do detalhe
- **Evento:** sala(s) com fotos, data/horário, pessoas, tipo, observações do associado, respostas do formulário.
- **Valores:** discriminado (salas, coffee, adicionais lançados pela ACIMM, descontos, total) — leitura.
- **Contrato** (null-safe até o Spec 13): quando existir, status da assinatura + botão "Assinar contrato" (link Autentique) + download do PDF assinado (URL assinada do Storage).
- **Pagamento** (null-safe até o Spec 14): quando houver `pagamentos` pendentes — forma, valor, instruções (Pix da config), status; **envio de comprovante** (§4).
- **Coffee:** resumo (nível, pessoas, horário de servir), leitura.
- **Ajuda:** "Precisa alterar algo? Fale com a ACIMM: {contato_acimm}".

## 4. Envio de comprovante (associado)

- Disponível em pagamento `pendente` das próprias locações. Mesmo padrão de upload do Spec 04 §3.1 (payload da Vercel = 4,5MB → **signed upload URL**):
  1. Client valida tipo (`pdf/jpeg/png`) e comprime imagem quando aplicável (alvo ≤ 3MB; teto 8MB);
  2. `prepararUploadComprovante` (guard + verifica que o pagamento pertence a locação do associado) → signed URL no bucket **privado** `comprovantes`, path `comprovantes/{locacao_id}/{pagamento_id}/{uuid}`;
  3. Upload direto ao Storage;
  4. `confirmarComprovante`: valida objeto/tamanho → grava `comprovante_url` → registra na linha do tempo ("Comprovante enviado — Você") → hook de notificação ao colaborador (no-op até o Spec 15).
- Substituição permitida enquanto o pagamento estiver `pendente` (o anterior é removido do Storage). A **baixa** continua sendo ato exclusivo do colaborador (Spec 14).
- Visualização: URL assinada de curta duração gerada no servidor (bucket nunca público).

## 5. Cancelamento pelo associado

- Botão "Cancelar solicitação" **apenas** em `solicitada`/`em_analise` (antes de qualquer aprovação): dialog com motivo opcional → `transicionarLocacao(→ cancelada)` com autor = associado (a máquina de estados já permite; nenhuma via paralela).
- De `aprovada` em diante: sem botão — card explicativo "Para cancelar ou alterar, fale com a ACIMM: {contato}" (cancelamento pós-aprovação tem implicações de contrato/cobrança — decisão humana).

## 6. Perfil (`/perfil`)

- **Dados cadastrais** somente leitura (nome/razão social, documento formatado, e-mails, telefone, situação como badge) + nota "Fonte: cadastro de associados da ACIMM. Para corrigir, fale com a ACIMM."
- **Trocar senha:** senha atual + nova (mesmos requisitos do Spec 09) via `updateUser` — reautentica antes.
- **E-mail de login:** exibido, sem auto-troca (fluxo é a ACIMM desvincular/reconvidar — Spec 09 §7; a tela informa isso).
- **Nota de agenda** (CLAUDE.md §10.6): convites das locações confirmadas chegam automaticamente no e-mail — nenhuma ação necessária.
- Sair (signOut global).

## 7. Critérios de aceite
- [ ] Tabs e cards corretos; associado A jamais enxerga locação do associado B (teste com duas contas, incluindo tentativa por URL direta e via anon key).
- [ ] Migration 0018 aplicada: consulta direta de `locacao_eventos` com sessão de associado retorna vazio; linha do tempo do portal continua funcionando via DTO sanitizado, sem `observacao`/nomes de colaborador.
- [ ] Stepper reflete o status real; recusa/cancelamento mostram motivo.
- [ ] Comprovante: upload via signed URL (nada trafega pela Vercel), substituição em pendente, objeto órfão removido, evento na linha do tempo; associado não anexa em pagamento de outra locação (teste de autorização na action).
- [ ] Cancelamento próprio só em solicitada/em_analise, via máquina de estados, com autor "Você" na linha do tempo do portal e nome real na do admin.
- [ ] Troca de senha exige senha atual; perfil não permite editar dados do Sophus.
- [ ] Seções de contrato/pagamento não quebram sem dados (null-safe) e acendem sozinhas quando os Specs 13/14 chegarem.
