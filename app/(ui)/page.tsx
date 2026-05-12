import { UploadExtracto } from "@/components/home/UploadExtracto";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Importar extracto
        </h1>
        <p className="text-sm text-muted-foreground">
          Fase 1 — MVP local: subí un PDF digital, la IA extrae los movimientos
          y los exportás a Excel. La Home completa con tabs de bancos llega en
          Fase 3.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo extracto</CardTitle>
          <CardDescription>
            Formatos aceptados: PDF digital. Tamaño máximo según configuración
            (default 25 MB).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UploadExtracto />
        </CardContent>
      </Card>
    </div>
  );
}
