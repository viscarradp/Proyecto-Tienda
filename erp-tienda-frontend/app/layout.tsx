import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ERP Tienda Karlita",
  description: "Sistema integral de gestión para tiendas, inventarios y puntos de venta.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-full flex flex-col`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          {/* Móvil: el aviso queda sobre la barra del carrito del POS (~3.8rem) y el menú inferior (3.5rem) */}
          <Toaster
            position="bottom-center"
            richColors
            mobileOffset={{ bottom: "calc(8rem + env(safe-area-inset-bottom))" }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
