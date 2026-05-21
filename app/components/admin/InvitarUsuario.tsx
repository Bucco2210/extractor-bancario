"use client";

import { useState } from "react";
import { Copy, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PLANES,
  ORDEN_PLANES_VISIBLE,
  TIPOS_PLAN,
  CICLOS_FACTURACION,
  type TipoPlan,
  type CicloFacturacion,
} from "@/lib/planes";

type Resultado = {
  link: string;
  email: string;
  planSugerido: TipoPlan;
  expiraEn: string;
};

export function InvitarUsuario() {
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [plan, setPlan] = useState<TipoPlan>("trial");
  const [ciclo, setCiclo] = useState<CicloFacturacion>("mensual");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function invitar(): Promise<void> {
    if (!email) {
      toast.error("Falta el email.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/usuarios/invitar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          nombre,
          planSugerido: plan,
          cicloSugerido: ciclo,
        }),
      });
      const json = (await res.json()) as
        | Resultado
        | { mensaje?: string };
      if (!res.ok) {
        toast.error(
          "mensaje" in json
            ? (json.mensaje ?? "Falló la invitación")
            : "Falló la invitación",
        );
        return;
      }
      setResultado(json as Resultado);
      toast.success("Invitación creada. Copiá el link y mandalo.");
      setEmail("");
      setNombre("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  function copiarLink(): void {
    if (!resultado) return;
    const url = new URL(resultado.link, window.location.origin).toString();
    navigator.clipboard.writeText(url).then(
      () => toast.success("Link copiado."),
      () => toast.error("No pude copiar."),
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4" />
          Invitar usuario
        </CardTitle>
        <CardDescription>
          Generá un link único que el invitado usa para setear su
          contraseña. El plan le queda asignado al activar.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inv-email">Email</Label>
            <Input
              id="inv-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cliente@ejemplo.com"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inv-nombre">Nombre (opcional)</Label>
            <Input
              id="inv-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Juan Pérez"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inv-plan">Plan</Label>
            <select
              id="inv-plan"
              value={plan}
              onChange={(e) => setPlan(e.target.value as TipoPlan)}
              className="rounded-md border bg-background px-3 py-1.5 text-sm"
            >
              {TIPOS_PLAN.map((p) => (
                <option key={p} value={p}>
                  {PLANES[p].nombre}
                </option>
              ))}
            </select>
          </div>
          {ORDEN_PLANES_VISIBLE.includes(plan) ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-ciclo">Ciclo</Label>
              <select
                id="inv-ciclo"
                value={ciclo}
                onChange={(e) => setCiclo(e.target.value as CicloFacturacion)}
                className="rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                {CICLOS_FACTURACION.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
        <div className="flex justify-end">
          <Button onClick={invitar} disabled={loading} type="button">
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Crear invitación
          </Button>
        </div>

        {resultado ? (
          <div className="rounded-md border border-sky-300 bg-sky-50 p-3 dark:border-sky-800 dark:bg-sky-950/40">
            <p className="text-sm font-medium">Link generado para {resultado.email}</p>
            <p className="text-xs text-muted-foreground">
              Expira el{" "}
              {new Date(resultado.expiraEn).toLocaleDateString("es-AR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-white px-2 py-1 text-xs dark:bg-black/30">
                {resultado.link}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={copiarLink}
                type="button"
              >
                <Copy className="mr-1 h-3 w-3" />
                Copiar
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
