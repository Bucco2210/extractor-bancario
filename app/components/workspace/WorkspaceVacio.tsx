"use client";

import Link from "next/link";
import { Inbox } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export function WorkspaceVacio() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <div className="rounded-full bg-muted p-3">
        <Inbox className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">No hay pestañas abiertas</h2>
      <p className="text-sm text-muted-foreground">
        Cada extracción que subas se abre como una pestaña acá. Empezá desde
        la Home arrastrando un PDF al dropzone.
      </p>
      <Link href="/" className={buttonVariants({ variant: "default" })}>
        Ir a la Home
      </Link>
    </div>
  );
}
