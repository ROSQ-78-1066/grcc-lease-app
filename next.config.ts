import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "exceljs",
    "mammoth",
    "nodemailer",
    "docxtemplater",
    "pizzip",
    "pdf-lib",
    "node-forge",
    "@signpdf/signpdf",
    "@signpdf/placeholder-pdf-lib",
    "@signpdf/signer-p12",
    "@signpdf/utils",
  ],
  experimental: { serverActions: { bodySizeLimit: "40mb" } },
};

export default nextConfig;
