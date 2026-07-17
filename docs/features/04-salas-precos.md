# Spec 04 — Salas e Preços (Fase 2, parte 2)

> Depende: Spec 02 (tabelas `salas`, `precos_sala`) e Spec 03 (guards + shell admin).
> Referência: CLAUDE.md §9.6. Rotas: `/admin/salas`, `/admin/salas/nova`, `/admin/salas/[id]`.
> Salas são 100% dinâmicas — quantidade, nomes e preços livres, sem nada fixo em código.

---

## 1. Objetivo

Colaborador cadastra, edita, ordena e desativa salas, gerencia fotos e mantém a tabela de preços com histórico de vigência. Este spec também entrega `resolverPreco()`, função central que todos os cálculos de locação usarão (Specs 07 e 11).

---

## 2. Lista de salas (`/admin/salas`)

- Cards ou tabela: foto de capa (primeira do array), nome, capacidade, status (badge ativa/indisponível), contagem de preços vigentes, ações (editar, ativar/desativar).
- Ordenação manual (campo `ordem` — setinhas sobem/descem bastam; drag-and-drop é opcional).
- Botão "Nova sala".
- **Sem hard delete em nenhuma hipótese**: sala sai de circulação com `ativa = false` (histórico de locações preservado). Desativar sala com locações futuras confirmadas → dialog de aviso listando-as (a desativação não cancela nada; só impede novas).

## 3. Cadastro/edição (`/admin/salas/nova` e `/admin/salas/[id]`)

Formulário (Zod + server action com `requireColaborador()`):
- `nome` (obrigatório, único entre ativas — validação amigável), `descricao`, `capacidade` (> 0), `equipamentos` (input de tags livre), `ativa`.
- Galeria de fotos (máx. **10 por sala**): upload, reordenação (primeira = capa), remoção.

### 3.1 Upload de fotos — arquitetura obrigatória

Restrições que definem o desenho:
- Bucket Supabase: máx. **50MB por arquivo** (limite do plano — folgado para fotos, mas é o teto duro).
- Funções Vercel: máx. **4,5MB de payload** → **foto NUNCA trafega pelo server action**.

Fluxo:
1. **Client:** valida tipo (`jpeg/png/webp`) e comprime/redimensiona no browser (`browser-image-compression` ou canvas): lado maior ≤ 1920px, webp qualidade ~80, alvo ≤ 2MB (teto de rejeição no client: 8MB pós-compressão).
2. **Server action `prepararUploadFoto`** (guard + Zod): valida sala, extensão e limite de 10 fotos → gera path `salas/{sala_id}/{uuid}.webp` → retorna `createSignedUploadUrl` do bucket.
3. **Client** envia o arquivo direto ao Storage pela URL assinada (não passa pela Vercel).
4. **Server action `confirmarFotoSala`**: confere que o objeto existe no Storage e o tamanho reportado ≤ 8MB (defesa contra client adulterado; acima disso, remove o objeto e rejeita) → append do path em `salas.fotos`.
- Remoção: server action apaga do array **e** do Storage.

### 3.2 Bucket `salas-fotos`
- **Público somente-leitura** (exceção consciente à regra dos buckets privados do Spec 02 §7: fotos de ambiente são conteúdo institucional, sem dado pessoal, e URL pública permite cache de CDN nas telas do associado).
- Escrita/remoção: apenas via signed URLs geradas por server action (nenhuma policy de INSERT para `authenticated`).
- Criado na migration `0012_storage` (ajustar o arquivo se ainda não aplicado; caso já aplicado, nova migration `0013_bucket_salas`).

## 4. Preços (`/admin/salas/[id]` — aba "Preços")

- Grade de preços vigentes: linhas por **condição** (associado/não-associado) × **período** (manhã/tarde/noite/dia inteiro) × **dias da semana** (multiselect 0–6, com atalhos "Seg–Sex", "Fim de semana", "Todos"), valor em R$ (máscara BRL; persistência em centavos).
- **Reajuste sem apagar história**: editar valor de uma combinação = server action transacional que fecha a `vigencia` da linha atual (`[início, hoje)`) e cria linha nova (`[hoje, ∞)`). Nunca UPDATE de `valor_centavos` em linha vigente com locações calculadas por ela; nunca DELETE de linha com vigência passada.
- Validação de sobreposição na aplicação: para (sala, condição, período), os `dias_semana` de linhas com vigência sobreposta não podem se intersectar — erro amigável apontando o conflito.
- Visualização "Histórico de preços" (colapsada): linhas com vigência encerrada, somente leitura.
- Combinações sem preço cadastrado = período **não disponível para locação** naquela condição (o formulário de locação futuramente só oferece o que tem preço). Exibir aviso de cobertura incompleta na aba (ex.: "Noite sem preço para não-associado").

## 5. `resolverPreco()` — contrato da função (lib compartilhada)

`lib/precos/resolver.ts` (server-only):

```ts
resolverPreco(input: {
  salaId: string;
  data: Date;              // data do evento (dia da semana + vigência saem daqui)
  periodo: PeriodoDia;
  condicao: CondicaoLocatario;
}): Promise<{ valorCentavos: number; precoId: string } | { erro: 'sem_preco' }>
```

- Resolve a linha de `precos_sala` cuja vigência contém a data e cujos `dias_semana` contêm o dia.
- Determinística e testável (testes unitários cobrindo: vigência trocando no dia do reajuste; dia da semana na borda; combinação ausente).
- É a ÚNICA fonte de preço do sistema — Specs 07/11 proíbem qualquer outra forma de obter valor de sala.

## 6. Fora de escopo
- Tela de disponibilidade/agenda da sala (Spec 05).
- Seed de salas reais da ACIMM (entra na homologação — Spec 24, via painel).

## 7. Critérios de aceite
- [ ] CRUD completo com validações; nome duplicado entre ativas rejeitado com mensagem clara.
- [ ] Upload segue o fluxo signed URL: nenhuma foto trafega por função Vercel; client comprime; servidor rejeita objeto > 8MB e some com ele do Storage.
- [ ] Limite de 10 fotos aplicado no servidor; remoção limpa array + Storage; capa = primeira foto.
- [ ] Reajuste de preço cria vigência nova e preserva a anterior intacta; sobreposição de dias/vigência é bloqueada com erro apontando a linha conflitante.
- [ ] `resolverPreco()` com testes unitários passando nos três casos de borda listados.
- [ ] Desativar sala não afeta locações existentes e exibe aviso quando há futuras confirmadas.
- [ ] Associado autenticado enxerga (via RLS já existente) apenas salas ativas e preços vigentes; nada de histórico.
