import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default async function UiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-white/40 bg-white/60 backdrop-blur-sm dark:border-white/10 dark:bg-black/30">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link
            href="/"
            className="text-lg font-extrabold tracking-tight text-sky-700 dark:text-sky-300"
          >
            B&amp;B Tech
          </Link>
          {session?.user ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">
                {session.user.name ?? session.user.email}{" "}
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs uppercase">
                  {session.user.rol ?? "operador"}
                </span>
              </span>
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
            </div>
          ) : null}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
