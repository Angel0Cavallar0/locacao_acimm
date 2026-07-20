import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer traz dependências nativas (fontkit, yoga) que devem
  // rodar fora do bundle do servidor — usado na geração do PDF de compras.
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
