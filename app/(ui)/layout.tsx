import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ToggleTema } from "@/components/ui/ToggleTema";

export default async function UiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const esAdmin = session?.user?.rol === "admin";
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-white/40 bg-white/60 backdrop-blur-sm dark:border-white/10 dark:bg-black/30">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="text-lg font-extrabold tracking-tight text-sky-700 dark:text-sky-300"
            >
              B&amp;B Tech
            </Link>
            {session?.user ? (
              <nav className="hidden items-center gap-4 text-sm text-muted-foreground sm:flex">
                <Link
                  href="/"
                  className="transition-colors hover:text-foreground"
                >
                  Home
                </Link>
                <Link
                  href="/workspace"
                  className="transition-colors hover:text-foreground"
                >
                  Workspace
                </Link>
                <Link
                  href="/conciliacion"
                  className="transition-colors hover:text-foreground"
                >
                  Conciliación
                </Link>
                {esAdmin ? (
                  <>
                    <Link
                      href="/formatos"
                      className="transition-colors hover:text-foreground"
                    >
                      Formatos
                    </Link>
                    <Link
                      href="/admin"
                      className="transition-colors hover:text-foreground"
                    >
                      Admin
                    </Link>
                  </>
                ) : null}
              </nav>
            ) : null}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <ToggleTema />
            {session?.user ? (
              <>
                <Link
                  href="/cuenta"
                  className="text-muted-foreground hover:text-foreground"
                >
                  {session.user.name ?? session.user.email}{" "}
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs uppercase">
                    {session.user.rol ?? "operador"}
                  </span>
                </Link>
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/login" });
                  }}
                >
                  <Button type="submit" variant="outline" size="sm">
                    Cerrar sesión
                  </Button>
                </form>
              </>
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
