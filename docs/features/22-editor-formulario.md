# Spec 22 — Editor de Formulário (Bloco E, parte 6 — fecha o bloco)

> Depende: Specs 07/11 (o renderer `CamposDinamicos` e a gravação em `respostas_formulario` JÁ existem — este spec entrega apenas a gestão dos campos). Tabela `campos_formulario` (Spec 02) já existe.
> Referência: CLAUDE.md §9.12 ("o formulário evolui junto com as necessidades da ACIMM, sem intervenção técnica"). Rota: `/admin/configuracoes/formulario` (colaborador — é operação do dia a dia, não administração).

---

## 1. Objetivo

Colaborador cria, ordena e desativa os campos extras que o locatário responde ao solicitar (ex.: "O evento terá venda de ingressos?", "Precisa de apoio técnico?") — e as respostas aparecem no detalhe da locação e no fluxo de aprovação, sem nenhum deploy.

## 2. Tela

- **Lista ordenada** dos campos: rótulo, tipo (badge), obrigatório, ativo, nº de respostas já registradas; reordenação por setas (o campo `ordem` manda no formulário).
- **Adicionar campo** (dialog): rótulo, tipo (`texto` · `texto_longo` · `numero` · `selecao` · `multiselecao` · `booleano` · `data` — enum `tipo_campo`), opções (editor de linhas, obrigatório para seleção/multiseleção, mín. 2), obrigatório, ativo.
- **Editar:** rótulo, opções, obrigatoriedade, ordem, ativo. **Tipo é imutável após a criação** — mudou de ideia, desativa e cria outro (respostas antigas não podem virar lixo de tipo incompatível).
- **Desativar** (sem hard delete — padrão): some dos formulários novos; respostas já dadas continuam exibidas normalmente nos detalhes.
- **Preview ao vivo:** painel lateral renderizando o formulário exatamente como o locatário verá (reusa o `CamposDinamicos` — qualquer divergência entre preview e portal é bug por definição).
- Limite de sanidade: **máx. 15 campos ativos** (formulário de locação, não censo do IBGE — o servidor impõe).

## 3. Regras de dados (o que protege as respostas antigas)

- Respostas são gravadas em `respostas_formulario` **chaveadas pelo `id` do campo** (nunca pelo rótulo). Exibição usa o rótulo **atual** — renomear "Tipo de evento?" para "Qual o tipo do evento?" atualiza a exibição de todas as locações sem tocar nos dados.
- Remover uma **opção** de seleção já usada: permitido; respostas antigas com o valor removido continuam exibidas com o valor bruto (sem quebrar), e o valor não é mais ofertado em novas solicitações. Aviso no editor quando a opção tem uso.
- Obrigatoriedade e campos novos valem **apenas para novas solicitações** — locação antiga sem resposta de campo novo exibe "—", nunca vira pendência retroativa.

## 4. Validação server-side (reforço nos Specs 07/11)

- No submit, o servidor monta o schema Zod **dinamicamente** a partir dos campos ativos no momento: tipo correto, obrigatórios presentes, valores de seleção ∈ opções vigentes. Payload com chave de campo inexistente/inativo é descartado silenciosamente (nunca gravado).
- Corrida edição×submit (colaborador altera campos enquanto associado preenche): o submit valida contra o estado ATUAL — obrigatório novo faltando → erro amigável pedindo revisão do formulário (o client refaz a etapa com os campos atualizados).

## 5. Critérios de aceite
- [ ] CRUD completo com reordenação; tipo imutável; seleção exige ≥ 2 opções; limite de 15 ativos imposto no servidor.
- [ ] Campo criado aparece imediatamente no portal e no assistido (sem deploy); desativado some dos novos e permanece nos detalhes antigos.
- [ ] Renomear campo atualiza exibição em locações antigas (chave por id comprovada); remover opção usada não quebra exibição antiga e some das novas.
- [ ] Validação dinâmica no servidor: tipo errado, obrigatório ausente e opção inválida rejeitados; chave desconhecida descartada (teste de payload adulterado).
- [ ] Corrida edição×submit termina em erro amigável com formulário atualizado, nunca em dado inconsistente.
- [ ] Preview idêntico ao render real (mesmo componente).
