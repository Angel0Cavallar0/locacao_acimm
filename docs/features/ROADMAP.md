# ROADMAP — Specs do Sistema de Locação ACIMM

> Ordem de implementação e dependências. Cada spec é implementado e validado antes do próximo.
> Status: ✅ implementado · 📝 spec escrito · ⬜ a escrever

## Bloco A — Fundação
| # | Spec | Escopo | Depende de | Status |
|---|---|---|---|---|
| 00 | Setup | Scaffold Next 16, Supabase, tema, envs (core eager + lazy) | — | ✅ |
| 01 | Tela inicial | Landing `/` com roteamento dos dois públicos | 00 | ✅ |
| 02 | Banco de dados | Migrations 0002–0012, agenda_ocupacoes, RLS, view disponibilidade | 00 | ✅ |
| 03 | Auth admin + shell | Login colaborador, guards, sidebar/layout, gestão de colaboradores | 02 | ✅ |

## Bloco B — Painel do Colaborador (meta: substituir a planilha)
| # | Spec | Escopo | Depende de | Status |
|---|---|---|---|---|
| 04 | Salas e preços | CRUD de salas, tabela de preços com vigência, fotos (Storage) | 03 | ✅ |
| 05 | Calendário consolidado | Visão mensal + lista (FullCalendar MIT), filtros, alertas de sobreposição, bloqueio manual de sala (`origem = bloqueio`) | 04 | ✅ |
| 06 | Locações — lista e detalhe | Listagem com filtros, detalhe com linha do tempo, máquina de estados (aprovar/recusar/cancelar), tratamento do conflito na aprovação (23P01) | 04 | ✅ |
| 07 | Nova locação assistida | Formulário do colaborador: busca de associado (base Sophus), locatário externo, adicionais, cálculo server-side | 06 | ⬜ |
| 08 | Coffee break | Config de níveis (valores + composição), coffee na locação, tela de pedidos, PDF de compras (geração manual) | 06 | ⬜ |

## Bloco C — Portal do Associado
| # | Spec | Escopo | Depende de | Status |
|---|---|---|---|---|
| 09 | Auth associado | Login CNPJ+e-mail+senha, primeiro acesso com verificação por e-mail (array `emails` do Sophus), liberação manual pelo colaborador | 03 | ⬜ |
| 10 | Disponibilidade | Calendário público autenticado com estados livre/ocupado/solicitado/evento ACIMM (view `disponibilidade`), convite ao evento | 09, 05 | ⬜ |
| 11 | Solicitação de locação | Formulário guiado em etapas, regras de conflito §8.3 (a/b/c), fila de espera, cálculo em tempo real + recálculo servidor | 10, 07 | ⬜ |
| 12 | Minhas locações + perfil | Histórico, detalhe com linha do tempo, envio de comprovante, perfil | 11 | ⬜ |

## Bloco D — Automações do fluxo
| # | Spec | Escopo | Depende de | Status |
|---|---|---|---|---|
| 13 | Contratos + Autentique | Template com merge tags, geração de PDF, envio Autentique, acompanhamento de assinatura, tela admin de contratos | 06 | ⬜ |
| 14 | Pagamentos | Registro 1..N por locação (híbridos), baixa manual, comprovantes (Storage + URLs assinadas), isenções | 06 | ⬜ |
| 15 | Notificações | Fila `notificacoes` (WhatsApp Evolution + e-mail Resend em par), templates pt-BR, retry, disparo em cada transição de status | 06 | ⬜ |
| 16 | Jobs pg_cron | Rotas `/api/cron/*` + agendamentos no Supabase (retry de notificações, lembrete pré-evento, PDF semanal de coffee) | 15, 08 | ⬜ |

## Bloco E — Integrações e regras avançadas
| # | Spec | Escopo | Depende de | Status |
|---|---|---|---|---|
| 17 | Eventos ACIMM + Sympla | CRUD de eventos internos, vínculo Sympla (`GET /events`), sync de inscritos, prioridade e sugestão de remanejamento | 05 | ⬜ |
| 18 | Google Calendar | OAuth da conta ACIMM (admin → integrações), espelho de locações/eventos, convites aos locatários (`attendees` + `sendUpdates`) | 06, 17 | ⬜ |
| 19 | Lista de espera | Tela admin da fila por data/sala, contato rápido, conversão em locação | 07, 11 | ⬜ |
| 20 | Desconto multi-sala + período gratuito | Regras parametrizadas em `configuracoes`, aplicação automática no cálculo, controle de ciclo mensal do sócio | 11 | ⬜ |
| 21 | Comissões | Geração automática (locação confirmada + coffee), tela de acompanhamento, exportação CSV | 14, 08 | ⬜ |
| 22 | Editor de formulário | CRUD de `campos_formulario`, renderização dinâmica no formulário do associado/assistido | 11 | ⬜ |

## Bloco F — Fechamento
| # | Spec | Escopo | Depende de | Status |
|---|---|---|---|---|
| 23 | Dashboard admin | Indicadores reais (pendências, semana, receita, ocupação, comissões), lista "ação necessária" | 06, 14, 21 | ⬜ |
| 24 | Homologação e entrega | Seed de produção (salas/preços/coffee reais), revisão de segurança (RLS, rate limits, headers), testes de fluxo ponta-a-ponta, documentação de uso e treinamento | todos | ⬜ |

## Observações
- Dentro de cada bloco a ordem importa; entre blocos C e D há paralelismo possível (13–15 não dependem do portal).
- Pendências externas (marca, regras da ACIMM, credenciais GCP, modelo de contrato) mapeadas no CLAUDE.md §12 — nenhuma bloqueia o início do spec correspondente, todas têm fallback.
- O marco "planilha aposentada" fecha no fim do Bloco B; o marco "associado autônomo" no fim do Bloco C.
