import type { Metadata } from "next";
import "@/styles/globals.css";
import { WorkspaceProvider } from "@/components/WorkspaceProvider";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")),
  title: "PaperGuide AI",
  description: "A free educational demo for guided narration, page-by-page cues, and document-grounded questions.",
  openGraph: { title: "PaperGuide AI", description: "Turn difficult PDFs into guided audio walkthroughs.", images: [{ url: "/og.png", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: "PaperGuide AI", description: "Turn difficult PDFs into guided audio walkthroughs.", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><WorkspaceProvider>{children}</WorkspaceProvider></body>
    </html>
  );
}
