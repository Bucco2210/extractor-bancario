"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2 } from "lucide-react";
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
  CICLOS_FACTURACION,
  type TipoPlan,
  type CicloFacturacion,
} from "@/lib/planes";

export function RegistrarPagoManual({
  usuarios,
}: {
  usuarios: Array<{ id: string; email: string; nombre: string }>;
}) {
  const router = useRouter();
  const [usuarioId, setUsuarioId] = useState(usuarios[0]?.id ?? "");
  const [plan, setPlan] = useState<TipoPlan>("pro");
  const [ciclo, setCiclo] = useState<CicloFacturacion>("mensual");
  const [monto, setMonto] = useState<string>(
    String(PLANES.pro.precioUsd.mensual ?? 49),
  );
  const [notas, setNotas] = useState("");
  const [loading, setLoading] = useState(false);

  // Sugerir monto al cambiar plan o ciclo
  function actualizarPlan(p: TipoPlan): void {
    setPlan(p);
    const sug =
      ciclo === "anual" ? PLANES[p].precioUsd.anual : PLANES[p].precioUsd.mensual;
    if (sug !== null && sug !== undefined) setMonto(String(sug));
  }
  function actualizarCiclo(c: CicloFacturacion): void {
    setCiclo(c);
    const sug =
      c === "anual" ? PLANES[plan].precioUsd.anual : PLANES[plan].precioUsd.mensual;
    if (sug !== null && sug !== undefined) setMonto(String(sug));
  }

  async function registrar(): Promise<void> {
    if (!usuarioId) {
      toast.error("Elegí un usuario.");
      return;
    }
    const montoNum = Number(monto);
    if (!(montoNum > 0)) {
      toast.error("Monto debe ser un número positivo.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/pagos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usuarioId,
          plan,
          cicloFacturacion: ciclo,
          monto: montoNum,
          moneda: "USD",
          notas,
        }),
      });
      const json = (await res.json()) as { mensaje?: string };
      if (!res.ok) {
        toast.error(json.mensaje ?? "Falló el registro");
        return;
      }
      toast.success("Pago registrado y plan extendido.");
      setNotas("");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-4 w-4" />
          Registrar pago manual
        </CardTitle>
        <CardDescription>
          Útil mientras Mercado Pago no esté habilitado. El plan del
          usuario se extiende automáticamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pg-usuario">Usuario</Label>
            <select
              id="pg-usuario"
              value={usuarioId}
              onChange={(e) => setUsuarioId(e.target.value)}
              className="rounded-md border bg-background px-3 py-1.5 text-sm"
            >
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre} ({u.email})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pg-plan">Plan</Label>
            <select
              id="pg-plan"
              value={plan}
              onChange={(e) => actualizarPlan(e.target.value as TipoPlan)}
              className="rounded-md border bg-background px-3 py-1.5 text-sm"
            >
              {ORDEN_PLANES_VISIBLE.map((p) => (
                <option key={p} value={p}>
                  {PLANES[p].nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pg-ciclo">Ciclo</Label>
            <select
              id="pg-ciclo"
              value={ciclo}
              onChange={(e) =>
                actualizarCiclo(e.target.value as CicloFacturacion)
              }
              className="rounded-md border bg-background px-3 py-1.5 text-sm"
            >
              {CICLOS_FACTURACION.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pg-monto">Monto (USD)</Label>
            <Input
              id="pg-monto"
              type="number"
              step="0.01"
              min="0"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="pg-notas">Notas (opcional)</Label>
            <Input
              id="pg-notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Transferencia recibida 21/05/2026"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={registrar} disabled={loading} type="button">
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Registrar pago
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
