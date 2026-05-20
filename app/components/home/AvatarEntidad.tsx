import { paletaDeEntidad, inicialesDeEntidad } from "@/lib/colores-entidad";

export function AvatarEntidad({
  slug,
  nombre,
  size = "md",
}: {
  slug: string;
  nombre: string;
  size?: "sm" | "md" | "lg";
}) {
  const { bg, text } = paletaDeEntidad(slug);
  const iniciales = inicialesDeEntidad(nombre);
  const dim =
    size === "lg"
      ? "h-12 w-12 text-base"
      : size === "sm"
        ? "h-7 w-7 text-[10px]"
        : "h-10 w-10 text-sm";
  return (
    <span
      aria-label={nombre}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${bg} ${text} ${dim}`}
    >
      {iniciales}
    </span>
  );
}
