import { CalendarCheck, Gift, LogOut } from "lucide-react";
import type { Metadata } from "next";
import { signOutAssociado } from "@/app/(portal)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireAssociado } from "@/lib/auth/guards";
import { formatarDocumento } from "@/lib/locacoes/tipos";
import { saldoDoAssociado } from "@/lib/periodo-gratuito/consumo";
import { cn } from "@/lib/utils";
import { mascararTelefone } from "@/lib/utils/mascaras";
import { TrocarSenhaForm } from "./trocar-senha-form";

export const metadata: Metadata = { title: "Meu perfil" };

const SITUACAO: Record<string, { rotulo: string; classe: string }> = {
  ativo: {
    rotulo: "Ativo",
    classe: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  suspenso: {
    rotulo: "Suspenso",
    classe: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  excluido: {
    rotulo: "Excluído",
    classe: "bg-surface-muted text-ink-muted",
  },
};

export default async function PerfilPage() {
  const { user, associado } = await requireAssociado();
  const nome = associado.razao_social ?? associado.nome;
  const situacao = SITUACAO[associado.situacao] ?? {
    rotulo: associado.situacao,
    classe: "bg-surface-muted text-ink-muted",
  };
  const beneficios =
    associado.situacao === "ativo"
      ? await saldoDoAssociado(associado.id)
      : [];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">
          Meu perfil
        </h2>
        <p className="text-sm text-ink-muted">
          Seus dados cadastrais e acesso.
        </p>
      </div>

      {/* Dados cadastrais (somente leitura) */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Dados cadastrais</h3>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium",
                situacao.classe,
              )}
            >
              {situacao.rotulo}
            </span>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-muted">Nome / Razão social</dt>
              <dd className="text-ink">{nome}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">CNPJ / CPF</dt>
              <dd className="text-ink">
                {associado.documento
                  ? formatarDocumento(associado.documento)
                  : "—"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-ink-muted">E-mails</dt>
              <dd className="text-ink">
                {associado.emails.length > 0 ? associado.emails.join(", ") : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Telefone</dt>
              <dd className="text-ink">
                {associado.telefone
                  ? mascararTelefone(associado.telefone)
                  : "—"}
              </dd>
            </div>
          </dl>
          <p className="rounded-md bg-surface-muted px-3 py-2 text-xs text-ink-muted">
            Fonte: cadastro de associados da ACIMM. Para corrigir qualquer dado,
            fale com a ACIMM.
          </p>
        </CardContent>
      </Card>

      {/* Benefícios do mês (período gratuito por sala) */}
      {beneficios.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Gift className="size-4 text-brand" />
              <h3 className="text-sm font-semibold text-ink">
                Seus benefícios do mês
              </h3>
            </div>
            <ul className="flex flex-col gap-1.5 text-sm">
              {beneficios.map((b) => (
                <li key={b.salaId} className="flex justify-between">
                  <span className="text-ink-muted">{b.salaNome}</span>
                  <span
                    className={
                      b.disponiveis > 0
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-ink-muted"
                    }
                  >
                    {b.disponiveis} de {b.limite} disponível
                    {b.limite > 1 ? "eis" : ""}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-ink-muted">
              Período gratuito do sócio: aplicado automaticamente na reserva de
              sala única elegível; renova a cada mês.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* Acesso */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-ink">Acesso</h3>
          <div className="text-sm">
            <p className="text-xs text-ink-muted">E-mail de login</p>
            <p className="text-ink">{user.email}</p>
            <p className="mt-1 text-xs text-ink-muted">
              Para trocar o e-mail de login, fale com a ACIMM.
            </p>
          </div>
          <div className="border-t pt-3">
            <p className="mb-2 text-sm font-medium text-ink">Trocar senha</p>
            <TrocarSenhaForm emailLogin={user.email ?? ""} />
          </div>
        </CardContent>
      </Card>

      {/* Agenda */}
      <div className="flex items-start gap-2 rounded-lg border border-brand/20 bg-brand/5 px-4 py-3 text-sm">
        <CalendarCheck className="mt-0.5 size-4 shrink-0 text-brand" />
        <p className="text-ink-muted">
          Os convites de agenda das suas locações confirmadas chegam
          automaticamente no seu e-mail de cadastro. Nenhuma ação é necessária.
        </p>
      </div>

      <form action={signOutAssociado}>
        <Button type="submit" variant="outline" className="w-full sm:w-auto">
          <LogOut className="size-4" />
          Sair
        </Button>
      </form>
    </div>
  );
}
