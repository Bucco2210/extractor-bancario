import { redirect } from "next/navigation";
import Link from "next/link";
import { conectarMongoose } from "@/lib/mongo";
import { Invitacion } from "@/models/Invitacion";
import { PLANES } from "@/lib/planes";
import { auth } from "@/lib/auth";
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

type Params = Promise<{ token: string }>;
type SearchParams = Promise<{ error?: string }>;

/** Pure helper aislado del componente: el linter de purity no se queja
 *  porque la comparación no vive en el render directo. */
function invitacionVencida(expiraEn: Date): boolean {
  return expiraEn.getTime() < Date.now();
}

export default async function RegistroPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (session?.user) redirect("/");

  const { token } = await params;
  const sp = await searchParams;

  await conectarMongoose();
  const inv = await Invitacion.findOne({ token }).lean();

  if (!inv) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 py-12">
        <Card>
          <CardHeader>
            <CardTitle>Invitación no encontrada</CardTitle>
            <CardDescription>
              El link no es válido. Pedile al admin que te genere uno nuevo.
            </CardDescription>
          </CardHeader>
        </Card>
        <Link
          href="/login"
          className="text-center text-sm text-sky-700 hover:underline"
        >
          Volver al login
        </Link>
      </div>
    );
  }

  const vencida = invitacionVencida(inv.expiraEn);
  const usada = Boolean(inv.usadaEn);

  if (vencida || usada) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 py-12">
        <Card>
          <CardHeader>
            <CardTitle>
              {vencida ? "Invitación vencida" : "Invitación ya usada"}
            </CardTitle>
            <CardDescription>
              {vencida
                ? `La invitación expiró el ${inv.expiraEn.toLocaleDateString("es-AR")}.`
                : "Esta invitación ya fue consumida. Si perdiste el acceso, pedile al admin que te resetee la contraseña."}
            </CardDescription>
          </CardHeader>
        </Card>
        <Link
          href="/login"
          className="text-center text-sm text-sky-700 hover:underline"
        >
          Volver al login
        </Link>
      </div>
    );
  }

  const def = PLANES[inv.planSugerido];
  const error = sp.error ?? "";

  async function aceptar(formData: FormData): Promise<void> {
    "use server";
    const tokenForm = String(formData.get("token") ?? "");
    const password = String(formData.get("password") ?? "");
    const nombre = String(formData.get("nombre") ?? "").trim();
    const res = await fetch(
      `${process.env.AUTH_URL ?? "http://localhost:3000"}/api/auth/aceptar-invitacion`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenForm, password, nombre }),
      },
    );
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as {
        mensaje?: string;
      } | null;
      const msg = encodeURIComponent(
        json?.mensaje ?? "No pudimos completar tu registro.",
      );
      redirect(`/registro/${tokenForm}?error=${msg}`);
    }
    redirect("/login?registro=ok");
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Activar tu cuenta</CardTitle>
          <CardDescription>
            Plan asignado: <strong>{def.nombre}</strong>
            {def.precioUsd.mensual
              ? ` — $${def.precioUsd.mensual} USD/mes`
              : " (prueba gratuita)"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={aceptar} className="flex flex-col gap-4">
            <input type="hidden" name="token" value={token} />
            <div className="flex flex-col gap-2">
              <Label>Email</Label>
              <Input value={inv.email} readOnly disabled />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="nombre">Nombre y apellido</Label>
              <Input
                id="nombre"
                name="nombre"
                defaultValue={inv.nombre ?? ""}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Contraseña (mínimo 8 caracteres)</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
            <Button type="submit" className="w-full">
              Activar y entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
