import { ConciliacionDetalleClient } from "@/components/conciliacion/ConciliacionDetalleClient";

export const dynamic = "force-dynamic";

export default async function ConciliacionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ConciliacionDetalleClient id={id} />;
}
