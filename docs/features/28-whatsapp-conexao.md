# Spec 28 — Conexão do WhatsApp (Configurações)

> Página em **Configurações › WhatsApp** (`/admin/configuracoes/whatsapp`, admin only) para ver o
> status da conexão do número que envia as mensagens, gerar o QR code para parear um aparelho,
> reiniciar, desconectar e enviar uma mensagem de teste — tudo pela própria plataforma.

## Contexto
O WhatsApp era usado apenas para **enviar** mensagens (`sendText`/`sendMedia`); não havia
visibilidade nem controle sobre a **conexão** do número dentro do sistema. Se o número caísse
(celular offline, sessão expirada, troca de aparelho), a equipe não tinha como ver o status nem
reparear sem sair da plataforma. Esta página fecha essa lacuna usando os endpoints de gestão de
instância do serviço de WhatsApp.

**Sem migration e sem env nova** — reaproveita `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` /
`EVOLUTION_INSTANCE`. Nenhuma tabela envolvida: o estado é lido em tempo real, **não** persistido.

## Como funciona
- **Cliente** ([lib/integracoes/evolution.ts](../../src/lib/integracoes/evolution.ts)) ganhou
  funções de gestão de instância, no mesmo padrão do envio (server-only, `getEnvEvolution()`):
  - `obterEstadoInstancia()` → `GET /instance/connectionState` → `"open" | "close" | "connecting" | "desconhecido"` (nunca lança).
  - `obterInfoInstancia()` → `GET /instance/fetchInstances` (best-effort) → `{ numero, perfil }` do número conectado; falha silenciosa retorna nulos.
  - `conectarInstancia()` → `GET /instance/connect` → `{ base64, pairingCode }` (QR normalizado como data URI; lê `base64` ou `qrcode.base64`).
  - `desconectarInstancia()` → `POST /instance/logout` (encerra a sessão, mantém a instância).
  - `reiniciarInstancia()` → `POST /instance/restart` (sem deslogar).
- **Actions** ([whatsapp/actions.ts](../../src/app/admin/(painel)/configuracoes/whatsapp/actions.ts)),
  todas `requireAdmin` e com guarda `isEvolutionConfigured()`:
  `atualizarStatusWhatsappAction` (polling), `gerarQrWhatsappAction`, `desconectarWhatsappAction`,
  `reiniciarWhatsappAction`, `enviarTesteWhatsappAction` (valida o celular com
  `normalizarTelefoneBR` e reusa `enviarWhatsappTexto`).
- **UI** ([whatsapp-client.tsx](../../src/app/admin/(painel)/configuracoes/whatsapp/whatsapp-client.tsx)):
  - **Conectado (`open`)**: badge "Conectado" + número/perfil, bloco de mensagem de teste, botões
    Conectar outro aparelho / Reiniciar / Desconectar (com `AlertDialog`).
  - **Desconectado (`close`/`desconhecido`)**: botão "Gerar QR code" → exibe a imagem + código de
    pareamento alternativo + instruções de leitura + "Gerar novo QR".
  - **Polling**: enquanto o QR está na tela (ou estado `connecting`), chama
    `atualizarStatusWhatsappAction` a cada 4s; ao virar `open`, para o polling, dá toast de sucesso
    e `router.refresh()`.
- **Hub**: novo card "WhatsApp" em [configuracoes/page.tsx](../../src/app/admin/(painel)/configuracoes/page.tsx), antes de "Integrações".

## Segurança
- Toda action é `requireAdmin` (admin only).
- A `apikey` do serviço **nunca** vai ao client; só o QR (`base64`/`pairingCode`) — token efêmero de
  pareamento, não persistido.
- Nenhum texto visível cita ferramentas/stack (a página se chama "WhatsApp", "Conexão do WhatsApp").

## Casos de borda
- **QR expira/rotaciona (~40s)**: coberto por polling + botão "Gerar novo QR"; o base64 não é guardado.
- **Já conectado ao gerar QR**: a API pode responder sem QR → mensagem orientando atualizar o status.
- **Credenciais ausentes** (`!isEvolutionConfigured()`): página mostra aviso "não configurado", sem quebrar; actions retornam erro amigável.
- **Número inválido no teste**: `normalizarTelefoneBR` rejeita antes de qualquer chamada de rede.
- **Chave restrita à instância**: `obterInfoInstancia` (fetchInstances) é best-effort; o status vem
  de `connectionState`, que funciona com a chave da própria instância — se o número não aparecer,
  o status ainda funciona (o número exibe "indisponível").

## Fora de escopo
- Persistir histórico de conexões/desconexões.
- Criar/excluir instâncias pela plataforma (só gestão da instância já configurada).
- Painel unificado de status de todas as integrações (Sophus, Sympla, Autentique, e-mail) num só lugar.
