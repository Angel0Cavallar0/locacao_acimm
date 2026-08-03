# Spec 30 — Serviços adicionais + resumo na aprovação + contratos por WhatsApp (Ciclo 2, Fase 2)

> Revisa o Spec 07/11 (adicionais no formulário), Spec 13 (contratos) e Spec 15 (notificações).
> Fonte: [docs/alteracao/plano_alteracoes_acimm_ciclo2.md](../alteracao/plano_alteracoes_acimm_ciclo2.md) §8, §3.2, §4.
> Decisões travadas: adicionais **também no portal**; contrato **só por WhatsApp**.

---

## 1. Objetivo

Transformar os adicionais de locação (hoje texto livre) num **catálogo cadastrável** com três modelos de cobrança, vinculável a sala e com flags que geram etapas de checklist. Enriquecer a mensagem de aprovação com o **resumo do pedido**. Tirar o **Autentique** do fluxo de contrato (envio por **WhatsApp**), notificar a equipe da via assinada e do comprovante PIX por WhatsApp, e filtrar contratos por associado/período.

---

## 2. Catálogo de serviços adicionais (§8)

### 2.1 Migration
- Enum `modelo_cobranca_adicional`: `('por_unidade','fixo_evento','sob_consulta')`.
- Tabela `servicos_adicionais`: `nome`, `descricao` (vai p/ o contrato), `modelo_cobranca`, `unidade` (certificado/montagem/cadeira/publicacao/evento…), `valor_unitario_centavos` (nulo quando sob consulta), `sala_id` (nullable — restringe à sala), `requer_aprovacao bool`, `sujeito_disponibilidade bool`, `ativo bool`, `excluido_em` (soft-delete). `check`: sob_consulta ⇒ valor nulo; demais ⇒ valor não-nulo. RLS: `select` de colaborador; escrita só service role; leitura pública dos ativos é feita **server-side** (RSC/admin client), sem policy de escrita.
- `locacao_adicionais` += `servico_adicional_id uuid null`, `aprovacao_status text null` (`pendente|aprovado`), `disponibilidade_status text null` (`pendente|confirmado`). Texto livre continua válido (fallback: `servico_adicional_id null`).

### 2.2 Carga inicial (§8.3) — seed idempotente
| Serviço | Modelo | Valor | Sala | Flags |
|---|---|---|---|---|
| Impressão de certificados | por_unidade (certificado) | R$ 3,50 | — | — |
| Montagem personalizada da Sala Cinza | fixo_evento (montagem) | R$ 50,00 | Sala Cinza | — |
| Cadeiras adicionais | por_unidade (cadeira) | R$ 10,00 | Sala de Reunião | — |
| Divulgação nas redes sociais da ACIMM | por_unidade (publicacao) | R$ 100,00 | — | requer_aprovacao |
| Uso da Cozinha (forno) | fixo_evento (locacao) | R$ 100,00 | — | sujeito_disponibilidade |
| Segurança para o evento | fixo_evento (evento) | R$ 250,00 | — | — |
| Pedestal de microfone | sob_consulta | — | — | — |
| Banheirista | sob_consulta | — | — | — |
`sala_id` resolvido por nome (Sala Cinza / Sala de Reunião existem).

### 2.3 CRUD admin
- Tela de gestão em `/admin/configuracoes/servicos` (ou item de config): criar/editar/ativar/soft-delete. Campos da §2.1. Reusa o padrão de listas admin.

### 2.4 Uso na locação
- **Assistido** (`/admin/locacoes/nova` + editor da locação): seletor do catálogo filtrado pela(s) sala(s); `por_unidade` pede quantidade (calcula `qtd × valor`), `fixo_evento` valor único, `sob_consulta` exige valor digitado. Ao inserir, grava `servico_adicional_id`, `descricao` (= nome), snapshot de `quantidade`/`valor_unitario_centavos`, e `aprovacao_status`/`disponibilidade_status='pendente'` conforme flags. Mantém o adicional de texto livre.
- **Portal** (`/locacoes/nova`): expõe o catálogo (modelos com preço; **sob_consulta fica fora do portal**), respeitando sala vinculada e flags. A RPC `criar_solicitacao_portal` passa a aceitar `p_adicionais` **com valores recalculados no servidor** a partir do catálogo (nunca do client). O gate de "sob consulta sem valor" impede envio para pagamento antes de cotar.
- **Cálculo:** `calcularValores` já soma `quantidade × valor_unitario_centavos` — cobre por_unidade e fixo. Sem mudança na fórmula.
- **Comissão:** adicionais já são 0% e o subtotal fica isolado em `valor_adicionais_centavos` (Fase 1). Sem mudança.

## 3. Resumo na aprovação (§3.2)

`notificarAprovada` passa a montar um resumo (sala(s), período, coffee: nível/pessoas/horário, adicionais: nome × qtd/valor) e o template `aprovada` renderiza via blocos `{{#…}}`. WhatsApp + e-mail.

## 4. Contratos (§4)

### 4.1 Envio só por WhatsApp
- `enviarContrato` envia o PDF por **WhatsApp** (documento) ao número do responsável/associado; remove o ramo `autentique` e a config `modo_envio_contrato` da UI; o stub `autentique.ts` sai do fluxo. Degrada com aviso (mantém o fluxo manual "baixar + marcar assinado") quando não há WhatsApp configurado.
- `notificarContratoEnviado` ajustado (sem link Autentique).

### 4.2 Via assinada recebida → avisa a equipe
- Ao associado enviar a via assinada, a equipe é notificada (WhatsApp + e-mail interno) — hoje é `console.info` no-op.

### 4.3 Comprovante PIX → WhatsApp interno
- `notificarComprovanteRecebido` ganha canal WhatsApp (template `interna_comprovante_recebido`), usando `configuracoes.contato_acimm.whatsapp`.

### 4.4 Filtros de contratos
- `/admin/contratos` ganha filtro por **associado** (busca) e **período** (data do evento), além do status.

## 5. Critérios de aceite
- [ ] Catálogo CRUD funciona; seed dos 8 idempotente; sala vinculada e flags respeitadas.
- [ ] Assistido e portal inserem adicionais do catálogo; valores recalculados no servidor; sob_consulta só no assistido e gated antes do pagamento.
- [ ] Adicional com flag gera `aprovacao_status`/`disponibilidade_status = 'pendente'`.
- [ ] Contrato do PDF lista os adicionais com a descrição do catálogo.
- [ ] Mensagem de aprovação traz o resumo (sala/período/coffee/adicionais).
- [ ] Contrato enviado por WhatsApp; sem WhatsApp → degrada com aviso, fluxo manual disponível; Autentique fora da UI.
- [ ] Via assinada e comprovante PIX notificam a equipe por WhatsApp.
- [ ] Contratos filtram por associado e período.
- [ ] `npm run build` + testes passam.
