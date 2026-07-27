import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LineageShield — Context-Graph Change Agent",
  description:
    "Turn DataHub lineage, ownership, tags, tiers, and schema context into a verified blast radius and merge-ready rollout plan.",
  metadataBase: new URL(
    "https://lineageshield-agent.nexicturbo.chatgpt.site",
  ),
  openGraph: {
    title: "LineageShield — Ship schema changes without surprises",
    description:
      "A DataHub context-graph agent for safe, accountable data changes.",
    type: "website",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "LineageShield",
    description: "Every downstream consequence, before merge.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
