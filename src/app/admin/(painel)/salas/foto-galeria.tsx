"use client";

import imageCompression from "browser-image-compression";
import { ChevronLeft, ChevronRight, Upload, X } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  confirmarFotoSala,
  prepararUploadFoto,
  removerFotoSala,
  reordenarFotosSala,
} from "./fotos-actions";

interface Foto {
  path: string;
  url: string;
}

const BUCKET = "salas-fotos";
const TIPOS = ["image/jpeg", "image/png", "image/webp"];
const MAX_FOTOS = 10;
const MAX_BYTES = 8 * 1024 * 1024;

export function FotoGaleria({
  salaId,
  fotosIniciais,
}: {
  salaId: string;
  fotosIniciais: Foto[];
}) {
  const [fotos, setFotos] = useState<Foto[]>(fotosIniciais);
  const [enviando, setEnviando] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = useMemo(() => createClient(), []);

  async function processar(files: FileList) {
    if (fotos.length + files.length > MAX_FOTOS) {
      toast.error(`Máximo de ${MAX_FOTOS} fotos por sala.`);
      return;
    }
    setEnviando(true);
    let atuais = fotos;
    for (const file of Array.from(files)) {
      if (!TIPOS.includes(file.type)) {
        toast.error(`Tipo não suportado: ${file.name}`);
        continue;
      }
      try {
        const comprimida = await imageCompression(file, {
          maxSizeMB: 2,
          maxWidthOrHeight: 1920,
          fileType: "image/webp",
          initialQuality: 0.8,
          useWebWorker: true,
        });
        if (comprimida.size > MAX_BYTES) {
          toast.error(`${file.name}: muito grande mesmo após compressão.`);
          continue;
        }
        const prep = await prepararUploadFoto(salaId);
        if ("error" in prep) {
          toast.error(prep.error);
          continue;
        }
        const up = await supabase.storage
          .from(BUCKET)
          .uploadToSignedUrl(prep.path, prep.token, comprimida, {
            contentType: "image/webp",
          });
        if (up.error) {
          toast.error(`Falha no upload: ${file.name}`);
          continue;
        }
        const conf = await confirmarFotoSala(salaId, prep.path);
        if ("error" in conf) {
          toast.error(conf.error);
          continue;
        }
        atuais = [...atuais, { path: prep.path, url: conf.url }];
        setFotos(atuais);
      } catch {
        toast.error(`Erro ao processar ${file.name}`);
      }
    }
    setEnviando(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function mover(i: number, dir: "esq" | "dir") {
    const alvo = dir === "esq" ? i - 1 : i + 1;
    if (alvo < 0 || alvo >= fotos.length) return;
    const anterior = fotos;
    const nova = [...fotos];
    [nova[i], nova[alvo]] = [nova[alvo], nova[i]];
    setFotos(nova);
    startTransition(async () => {
      const r = await reordenarFotosSala(
        salaId,
        nova.map((f) => f.path),
      );
      if (r.error) {
        toast.error(r.error);
        setFotos(anterior);
      }
    });
  }

  function remover(path: string) {
    const anterior = fotos;
    setFotos(fotos.filter((f) => f.path !== path));
    startTransition(async () => {
      const r = await removerFotoSala(salaId, path);
      if (r.error) {
        toast.error(r.error);
        setFotos(anterior);
      }
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-muted">
            Até {MAX_FOTOS} fotos. A primeira é a capa. ({fotos.length}/
            {MAX_FOTOS})
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={enviando || fotos.length >= MAX_FOTOS}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-4" />
            {enviando ? "Enviando…" : "Enviar fotos"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) processar(e.target.files);
            }}
          />
        </div>

        {fotos.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">
            Nenhuma foto ainda.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {fotos.map((foto, i) => (
              <div
                key={foto.path}
                className={cn(
                  "group relative overflow-hidden rounded-md border bg-surface-muted",
                  isPending && "opacity-70",
                )}
              >
                <div className="aspect-video">
                  {/* biome-ignore lint/a11y/useAltText: alt fornecido */}
                  <img
                    src={foto.url}
                    alt={`Foto ${i + 1}`}
                    className="size-full object-cover"
                  />
                </div>
                {i === 0 ? (
                  <span className="absolute top-1 left-1 rounded bg-brand px-1.5 py-0.5 text-[10px] font-medium text-brand-foreground">
                    Capa
                  </span>
                ) : null}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/40 p-1">
                  <div className="flex gap-0.5">
                    <button
                      type="button"
                      aria-label="Mover para a esquerda"
                      disabled={i === 0 || isPending}
                      onClick={() => mover(i, "esq")}
                      className="rounded p-0.5 text-white hover:bg-white/20 disabled:opacity-30"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Mover para a direita"
                      disabled={i === fotos.length - 1 || isPending}
                      onClick={() => mover(i, "dir")}
                      className="rounded p-0.5 text-white hover:bg-white/20 disabled:opacity-30"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    aria-label="Remover foto"
                    disabled={isPending}
                    onClick={() => remover(foto.path)}
                    className="rounded p-0.5 text-white hover:bg-white/20"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
