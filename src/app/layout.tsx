import type { Metadata } from "next";
import "./globals.css";
import "./backend.css";
export const metadata: Metadata = {
  title: "GART Media — Медиатека",
  description: "Фронтенд-прототип медиатеки GART",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
