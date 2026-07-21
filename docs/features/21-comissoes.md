# Spec 21 — Comissões (Bloco E, parte 5)

> Depende: Spec 06 (hooks), Spec 08 (coffee), Spec 14 (confirmação por quitação). Tabela `comissoes` (Spec 02) já existe.
> Referência: CLAUDE.md §9.10, ata ("a cada locação confirmada e a cada coffee, comissão registrada automaticamente, pronta para exportação"; hoje é lançamento manual em planilhas separadas — "Planilha Boleto"/"Planilha Coffee").
> **Percentuais não definidos pela ACIMM** → parametrizados no painel; sem destinatário individual na v1 (a ata não define quem recebe — campo de colaborador é evolução futura se pedirem). Rota: `/admin/comissoes`.

---

## 1. Objetivo

Locação confirmada gera as comissões automaticamente (uma por origem: locação e coffee), com competência, acompanhamento por período e exportação CSV que substitui as planilhas manuais.

## 2. Migration `0027_comissoes`

```sql
alter table comissoes add column estornada_em timestamptz;  -- sem hard delete (padrão)
create unique index comissoes_unicidade_idx on comissoes (locacao_id, origem) where estornada_em is null;

insert into configuracoes (chave, valor, descricao) values
('comissoes', '{
  "locacao": { "ativo": false, "percentual": 0 },
  "coffee":  { "ativo": false, "percentual": 0 }
}', 'Percentuais de comissão por origem. Base locação: valor das salas líquido de descontos + adicionais; base coffee: valor do coffee. Ativar quando a ACIMM definir')
on conflict (chave) do nothing;
```

## 3. Geração — hook `confirmada`

- Para cada origem **ativa** na config:
  - `locacao`: `percentual` × (`valor_salas_centavos` − descontos de sala + `valor_adicionais_centavos`);
  - `coffee`: `percentual` × `valor_coffee_centavos` (só se a locação tem coffee).
- Arredondamento para baixo no centavo; valor 0 (percentual zero ou base zero — ex. período gratuito sem adicionais) **não gera linha** (sem lixo).
- `competencia` = 1º dia do **mês da data do evento** (consistente com relatórios de ocupação/receita; a planilha antiga também organizava pelo mês do uso).
- Idempotente pelo índice único parcial: reprocessamento não duplica.
- Snapshot: o percentual aplicado vai junto no registro? Sim — adicionar ao insert um `payload` implícito via `valor` já calculado; mudar a config depois **não** recalcula comissões existentes (mesma filosofia dos preços).

## 4. Estorno

- Locação `cancelada` após `confirmada` (hook): comissões da locação recebem `estornada_em` (histórico preservado; badge "estornada").
- Comissão **já exportada** e depois estornada: permanece com os dois carimbos e entra em destaque no filtro "estornadas após exportação" — é a lista de ajustes que a ACIMM precisa lançar de volta no controle dela. Notificação interna (padrão Spec 15 §5) avisa quando isso acontece.

## 5. Tela `/admin/comissoes`

- **Filtros:** competência (mês — padrão atual), origem, status (pendentes de exportação / exportadas / estornadas), busca por LOC-nº/locatário.
- **Tabela:** LOC-nº (link), locatário, data do evento, origem (badge), base, valor, competência, exportada em, estornada em.
- **Totais do filtro:** soma por origem + geral (pendentes vs exportadas separados).
- **Exportar CSV** (a única ação em massa do sistema — aqui ela é o próprio caso de uso): gera CSV das linhas filtradas **não estornadas** (colunas: competencia, loc_numero, locatario, documento, data_evento, sala(s), origem, base_centavos, valor_centavos) e, com confirmação, marca `exportada = true` nas incluídas. Re-exportar exportadas é permitido (sem remarcar). Arquivo `comissoes_{competencia}.csv`, UTF-8 com BOM (Excel pt-BR abre certo).
- **Config (admin only)**, na própria tela: percentuais e toggles por origem, com aviso "vale para novas confirmações".

## 6. Critérios de aceite
- [ ] Confirmação gera exatamente as linhas devidas (com/sem coffee, origem inativa não gera, base zero não gera); reprocessar não duplica (índice comprovado).
- [ ] Base da locação líquida de descontos de sala + adicionais; coffee sobre o valor do coffee; arredondamento testado.
- [ ] Competência pelo mês do evento (locação confirmada em julho para evento de setembro → competência setembro).
- [ ] Mudar percentual não altera comissões existentes; novas confirmações usam o novo valor.
- [ ] Estorno em cancelamento pós-confirmada; estorno de exportada gera destaque + notificação interna.
- [ ] CSV: colunas corretas, BOM/acentuação ok no Excel, marca exportadas com confirmação, re-export não remarca, estornadas nunca entram.
- [ ] Totais da tela batem com o CSV exportado do mesmo filtro (conferência automática em teste).
