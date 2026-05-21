import { Home } from "@/components/home/Home";
import { BannerCicloUsuario } from "@/components/home/BannerCicloUsuario";

export default async function HomePage() {
  return (
    <div className="flex flex-col gap-4">
      <BannerCicloUsuario />
      <Home />
    </div>
  );
}
