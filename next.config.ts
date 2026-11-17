import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["exceljs", "mammoth", "nodemailer", "docxtemplater", "pizzip"],
  experimental: { serverActions: { bodySizeLimit: "40mb" } },
};

export default nextConfig;
