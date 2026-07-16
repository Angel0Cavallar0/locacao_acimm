-- Migration 0013 — Fechar funções internas da superfície da API (PostgREST)
-- Advisor 0028/0029: funções SECURITY DEFINER ficam expostas como RPC.
-- As funções de trigger e rebuild_agenda_locacao só devem rodar internamente
-- (os triggers as executam sem exigir EXECUTE do chamador). Revogar EXECUTE
-- remove os endpoints /rpc/* e fecha o rebuild_agenda_locacao (que MUTA a
-- agenda) para anon/authenticated.
--
-- eh_colaborador() e locacao_do_usuario() são mantidas executáveis: são
-- exigidas pelas policies de RLS e retornam apenas booleanos (false para anon).

revoke execute on function rebuild_agenda_locacao(uuid) from public, anon, authenticated;
revoke execute on function tg_locacoes_agenda() from public, anon, authenticated;
revoke execute on function tg_locacao_salas_agenda() from public, anon, authenticated;
revoke execute on function tg_eventos_agenda() from public, anon, authenticated;
