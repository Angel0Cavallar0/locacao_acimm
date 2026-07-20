# Spec 13 — Contratos: PDF + Envio (E-mail ou Autentique) — Bloco D, parte 1

> Depende: Spec 06 (hooks de efeitos). Nada depende deste spec — implementável a qualquer momento do Bloco D/E.
> Estrutura: **13A (geração do PDF)** + **13B (envio automático com dois modos)**. O modo é escolhido pelo colaborador em Configurações: **E-mail** (padrão) ou **Autentique** (quando as credenciais chegarem).
> Base: modelo real da ACIMM — commitar em `docs/referencias/Contrato_de_Locacao_modelo.pdf`.

---

## 0. Decisões confirmadas (Angelo, jul/2026)

1. **Horários de período**: valem os de `configuracoes.horarios_periodos` (tarde 13h–18h). O template **nunca hardcoda horários** — imprime os da locação real, formatados a partir da config. O "12h–18h" do modelo antigo morre.
2. **Formas de pagamento**: adicionar **`transferencia`** ao enum. **Sem cartão** — remover do template.
3. **Responsável signatário**: campo novo `locatario_responsavel` aprovado.
4. **Modo de envio configurável**: Autentique via API **ou** geração + envio por e-mail ao locatário — escolha do colaborador na tela de Configurações.
5. **Coffee no contrato reflete faixas e adicionais** (o modelo real do banco: `faixas_preco` por quantidade + `adicionais`).

## 1. Migration `0019_contrato_base`

```sql
-- forma nova (PG >= 12 aceita em transação; o valor só é usável após o commit)
alter type forma_pagamento add value if not exists 'transferencia';

-- responsável signatário
alter table locacoes add column locatario_responsavel text;

insert into configuracoes (chave, valor, descricao) values
('modo_envio_contrato', '"email"',
 'Como o contrato é enviado ao locatário após a aprovação: "email" (PDF por e-mail) ou "autentique" (assinatura digital via API)'),
('contrato_textos', '{
  "locadora": "ASSOCIAÇÃO COMERCIAL E INDUSTRIAL DE MOGI MIRIM – ACIMM, CNPJ 44.793.255/0001-24, Av. Luiz Gonzaga de Amoedo Campos, 500, Mogi Mirim/SP.",
  "clausulas": [ /* seed: 8 cláusulas atuais, verbatim */ ],
  "consideracoes_finais": [ /* seed: 2 itens atuais */ ],
  "termo_responsabilidade": "Declaro estar ciente e de acordo com as condições estabelecidas para a locação e uso dos espaços da ACIMM."
}', 'Textos jurídicos do contrato (refletem nos próximos contratos gerados)'),
('dados_pagamento', '{"banco":"SICREDI","codigo_banco":"748","agencia":"0718","conta":"91717-2","pix":""}',
 'Dados bancários exibidos no contrato e nas instruções de pagamento')
on conflict (chave) do nothing;
```

- Formulários (Specs 07/11): campo **Responsável** obrigatório (pré-preenche com `contato` do Sophus quando houver) e **Transferência bancária** como forma disponível (portal continua sem "Isento").
- Locação antiga sem responsável: contrato usa o nome do locatário + aviso ao gerar.

---

## PARTE 13A — Geração do PDF

## 2. Template — `lib/contratos/pdf-contrato.tsx` (`@react-pdf/renderer`)

Reproduz o modelo ACIMM (logo, tipografia, rodapé `@acimmmogimirim · 19 3814-5760 · www.acimm.com.br`). Mapeamento:

| Modelo | Fonte no sistema |
|---|---|
| `<<empresa>>` / `<<cnpj>>` | `locatario_nome` / `locatario_documento` formatado (rótulo dinâmico CNPJ/CPF) |
| `<<responsavel>>` / `<<telefone>>` | `locatario_responsavel` / `locatario_telefone` |
| `<<data>>` / `<<pessoas>>` | data do evento / `qtd_pessoas` |
| Período | período da locação + horários reais `inicio`–`fim` (Sao_Paulo), rotulados a partir de `horarios_periodos` — **sem horários hardcoded, sem checkboxes** |
| Ambiente | lista dinâmica de `locacao_salas` |
| **3. Coffee Break** | nível + **faixa de preço aplicada** (ex.: "Executivo — 15+ pessoas · R$ 26,30/pessoa") + qtd de pessoas + **lista de adicionais do coffee com valores** + subtotal do coffee. Sem coffee: "Não contratado" |
| `<<adicionais>>` (locação) | `locacao_adicionais` (descrição × qtd × valor unitário × subtotal) |
| **5. Especificações** | **`salas.equipamentos`** de cada sala (multi-sala: um bloco por sala, nome como subtítulo) |
| 4. Pagamento | Valor Locação / Valor Coffee / Adicionais / Descontos (quando ≠ 0) / **Valor total**; apenas a forma escolhida, com `dados_pagamento` quando transferência ou PIX. Opções: PIX · Boleto · Boleto-Mensalidade · Transferência · Isento — **sem cartão** |
| Cláusulas / finais / termo | `configuracoes.contrato_textos` |
| Data do termo | "Mogi Mirim, {dia} de {mês por extenso} de {ano}" (geração) |

- Bloco visual de assinaturas (locatária + ACIMM) presente nos dois modos.

## 3. Geração e armazenamento

- `gerarContrato(locacaoId)` (server-only): status ≥ `aprovada` → renderiza → bucket privado `contratos/{locacao_id}/{uuid}.pdf` → upsert `contratos` (status `pendente`, `pdf_url`) → linha do tempo.
- **Hook `aprovada`**: gera automaticamente e encadeia o **envio (§5)** conforme o modo. Falha não desfaz a aprovação; detalhe mostra erro + "Gerar novamente".
- Regenerar: permitido antes da assinatura; substitui o PDF (sem órfão no Storage); registra na linha do tempo.
- Download por URL assinada (admin: qualquer; associado: só a própria — acende a seção do Spec 12).

## 4. Tela `/admin/contratos`

Lista: LOC-nº, locatário, evento, status do contrato, modo de envio usado, timestamps, ações (baixar, regenerar, reenviar). Filtros por status/período; busca.

---

## PARTE 13B — Envio automático (dois modos)

## 5. Configuração do modo — `/admin/configuracoes` (seção "Contratos")

- Radio: **"Enviar por e-mail"** (padrão) | **"Assinatura digital (Autentique)"**.
- Opção Autentique **desabilitada com aviso** enquanto `AUTENTIQUE_API_TOKEN` não estiver configurado (getter lazy — feature detection).
- Troca de modo vale para os **próximos** envios; contratos em andamento seguem o modo com que foram enviados.

## 6. Modo E-MAIL (padrão)

- Efeito pós-geração: envia via **Resend** para `locatario_email` — assunto e corpo em pt-BR com identidade ACIMM, **PDF anexo** + link para o portal (`/locacoes/[id]`) quando o locatário for associado com conta (não-associado recebe só o anexo).
- Sucesso → `contratos.status = 'enviado'` + `enviado_em` → transiciona locação → `contrato_enviado` (autor Sistema).
- **Assinatura é registrada manualmente**: colaborador usa "Marcar contrato assinado" (Spec 06) quando o documento voltar (o processo físico/da resposta é o atual da ACIMM).
- Sem `RESEND_API_KEY` (dev): não envia — contrato fica gerado com aviso e o fluxo manual de sempre (baixar + marcar enviado) cobre.
- Reenviar por e-mail: botão no detalhe/`/admin/contratos` (linha do tempo registra cada envio).

## 7. Modo AUTENTIQUE

- `lib/integracoes/autentique.ts` (GraphQL) atrás da interface `ServicoAssinatura`: `criarDocumento`, `consultarStatus`, `cancelarDocumento`.
- Efeito pós-geração: `criarDocumento` (signatário: `locatario_email`, nome `locatario_responsavel`) → grava `autentique_id` + `link_assinatura`, contrato `enviado` → transiciona → `contrato_enviado` (Sistema). Portal mostra "Assinar contrato".
- Retorno: **webhook** `/api/webhooks/autentique` (validação obrigatória do token/assinatura) — assinado → contrato `assinado` + transiciona → `contrato_assinado` (Sistema); recusado → contrato `recusado` + alerta (colaborador reenvia ou cancela a locação). **Polling de reconciliação** (pg_cron 30min — lista do Spec 16) cobre webhook perdido.
- Reenvio: cancela o documento anterior na Autentique e cria novo.
- Contador do plano Free (20 docs/mês) no `/admin/contratos`, aviso a partir de 15.

## 8. Critérios de aceite

**13A**
- [ ] PDF fiel ao modelo com: horários vindos da config (mudar `horarios_periodos` muda o próximo contrato sem deploy), coffee com faixa aplicada + adicionais valorados, equipamentos por sala, multi-sala, formas sem cartão.
- [ ] Aprovação gera contrato automaticamente; falha não bloqueia aprovação; regenerar só antes da assinatura, sem órfãos.
- [ ] Campo Responsável nos dois formulários + `transferencia` disponível (portal segue sem Isento); locação antiga gera com fallback + aviso.
- [ ] Associado baixa apenas o próprio contrato (URL assinada; bucket privado).

**13B**
- [ ] Config do modo na tela de Configurações; Autentique desabilitado sem token; troca de modo não afeta contratos em andamento.
- [ ] Modo e-mail: envio com anexo + link condicional ao portal, status/transição automáticos, reenvio registrado; sem Resend, degrada para o fluxo manual com aviso.
- [ ] Modo Autentique: cadeia completa até `contrato_enviado`; webhook validado processa assinatura/recusa; polling reconcilia (teste com webhook desligado); contador do Free correto.
- [ ] Em ambos: cada envio/reenvio/assinatura aparece na linha do tempo com autor correto (Sistema/colaborador).
