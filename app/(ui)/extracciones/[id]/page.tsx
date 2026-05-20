import { VistaEstadoExtraccion } from "@/components/extracciones/EstadoExtraccion";

export const dynamic = "force-dynamic";

export default async function ExtraccionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <VistaEstadoExtraccion id={id} />;
}
