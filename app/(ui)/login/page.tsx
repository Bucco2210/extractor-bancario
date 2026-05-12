import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
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

type SearchParams = Promise<{ redirectTo?: string; error?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  const sp = await searchParams;
  if (session?.user) redirect(sp.redirectTo ?? "/");

  const error = sp.error ?? "";

  async function iniciarSesion(formData: FormData): Promise<void> {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const redirectTo = String(formData.get("redirectTo") ?? "/");
    try {
      await signIn("credentials", { email, password, redirectTo });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("NEXT_REDIRECT")) throw err;
      redirect(`/login?error=credenciales&redirectTo=${encodeURIComponent(redirectTo)}`);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Iniciar sesión</CardTitle>
          <CardDescription>
            Ingresá con tu cuenta de ETHOS para extraer extractos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={iniciarSesion} className="flex flex-col gap-4">
            <input type="hidden" name="redirectTo" value={sp.redirectTo ?? "/"} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive">
                Credenciales inválidas. Probá de nuevo.
              </p>
            ) : null}
            <Button type="submit" className="w-full">
              Ingresar
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="text-center text-xs text-muted-foreground">
        ¿Sin cuenta? Pedile al admin que corra <code>npm run seed:admin</code>.
      </p>
    </div>
  );
}
