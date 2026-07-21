import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { TEMPLATE_ROTULO } from "./rotulos";
import {
  type CanalTemplate,
  CHAVES_TEMPLATE,
  type DestinoTemplate,
  templatesPadrao,
} from "./templates-padrao";

/**
 * Acesso a `templates_mensagem` (Spec 25 §C). A tabela guarda só overrides:
 * ausência de linha = template ativo com o texto padrão do código. O envio
 * (processar) resolve override ?? padrão; o gate liga/desliga (eventos) usa as
 * chaves desativadas. Toda leitura é fail-open — nunca bloqueia o fluxo.
 */

export interface TemplateConfig {
  ativo: boolean;
  whatsappTexto: string | null;
  emailAssunto: string | null;
  emailCorpo: string | null;
}

interface Row {
  chave: string;
  ativo: boolean;
  whatsapp_texto: string | null;
  email_assunto: string | null;
  email_corpo: string | null;
}

/** Overrides por chave (só as linhas que existem no banco). */
export async function carregarTemplatesConfig(): Promise<
  Map<string, TemplateConfig>
> {
  const admin = createAdminClient();
  const map = new Map<string, TemplateConfig>();
  const { data, error } = await admin
    .from("templates_mensagem")
    .select("chave, ativo, whatsapp_texto, email_assunto, email_corpo");
  if (error || !data) return map;
  for (const r of data as Row[]) {
    map.set(r.chave, {
      ativo: r.ativo,
      whatsappTexto: r.whatsapp_texto,
      emailAssunto: r.email_assunto,
      emailCorpo: r.email_corpo,
    });
  }
  return map;
}

/** Chaves desativadas (ativo=false). Fail-open: erro → conjunto vazio. */
export async function carregarTemplatesDesativados(): Promise<Set<string>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("templates_mensagem")
    .select("chave")
    .eq("ativo", false);
  if (error || !data) return new Set<string>();
  return new Set((data as { chave: string }[]).map((r) => r.chave));
}

export interface TemplateGestao {
  chave: string;
  rotulo: string;
  destino: DestinoTemplate;
  canais: CanalTemplate[];
  ativo: boolean;
  critico: boolean;
  /** Valores atuais (override do banco ?? padrão do código). */
  whatsapp: string;
  emailAssunto: string;
  emailCorpo: string;
  /** Variáveis {{...}} que o template aceita (extraídas do padrão). */
  variaveis: string[];
  /** Há texto personalizado no banco (habilita "Restaurar padrão"). */
  personalizado: boolean;
}

/** Tags {{chave}} / {{#chave}} usadas nas fontes (para os chips do editor). */
function extrairVariaveis(...fontes: (string | undefined)[]): string[] {
  const set = new Set<string>();
  for (const f of fontes) {
    if (!f) continue;
    for (const m of f.matchAll(/\{\{#?(\w+)(?:\|[^}]*)?\}\}/g)) {
      set.add(m[1]);
    }
  }
  return [...set];
}

/** Lista canônica (código) mesclada com os overrides — alimenta o editor. */
export async function listarTemplatesGestao(): Promise<TemplateGestao[]> {
  const cfg = await carregarTemplatesConfig();
  return CHAVES_TEMPLATE.map((chave) => {
    const p = templatesPadrao[chave];
    const o = cfg.get(chave);
    return {
      chave,
      rotulo: TEMPLATE_ROTULO[chave] ?? chave,
      destino: p.destino,
      canais: p.canais,
      ativo: o?.ativo ?? true,
      critico: Boolean(p.critico),
      whatsapp: o?.whatsappTexto ?? p.whatsapp ?? "",
      emailAssunto: o?.emailAssunto ?? p.emailAssunto ?? "",
      emailCorpo: o?.emailCorpo ?? p.emailCorpo ?? "",
      variaveis: extrairVariaveis(p.whatsapp, p.emailAssunto, p.emailCorpo),
      personalizado: Boolean(
        o &&
          (o.whatsappTexto !== null ||
            o.emailAssunto !== null ||
            o.emailCorpo !== null),
      ),
    };
  });
}
