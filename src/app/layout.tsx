import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Droscid",
  description: "A private friend chat platform with servers, channels, roles, and integrated database support.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
