import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Proof of Handshake — Onchain Rental Dispute Resolution",
  description:
    "AI-powered rental deposit dispute resolution on GenLayer. Both sides submit claims, 5 AI validators read the evidence and deliver a binding onchain verdict.",
  keywords: [
    "rental dispute",
    "deposit",
    "blockchain",
    "AI arbitration",
    "GenLayer",
    "onchain justice",
  ],
  authors: [{ name: "Bradbury Builders" }],
  openGraph: {
    title: "Proof of Handshake",
    description:
      "Onchain AI arbitration for rental deposit disputes. Fair. Transparent. Final.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Proof of Handshake",
    description:
      "Onchain AI arbitration for rental deposit disputes. Fair. Transparent. Final.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0a0a0a" />
      </head>
      <body style={{ margin: 0, padding: 0, background: "#0a0a0a" }}>
        {children}
      </body>
    </html>
  );
}
