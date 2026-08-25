import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: trustedAppOrigin(),
  title: {
    default: "CartPilot - Smarter skincare, stronger carts",
    template: "%s | CartPilot",
  },
  description:
    "A profit-aware AI skincare shopping experience powered by deterministic offers and Razorpay Test Mode.",
  openGraph: {
    type: "website",
    title: "CartPilot - Smarter skincare, stronger carts",
    description: "Catalog-backed skincare routines and explainable, profit-aware offers.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "CartPilot social preview" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "CartPilot - Smarter skincare, stronger carts",
    description: "Catalog-backed skincare routines and explainable, profit-aware offers.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}

function trustedAppOrigin(): URL {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  try {
    return new URL(configured || "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
}
