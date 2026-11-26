import type { Metadata, Viewport } from "next";
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
  title: {
    default: "ERP Tienda Karlita",
    template: "%s · Tienda Karlita",
  },
  description: "Sistema integral de gestión para tiendas, inventarios y puntos de venta.",
};

export const viewport: Viewport = {
  // Chrome Android: el teclado achica el contenido y los diálogos se reacomodan.
  interactiveWidget: "resizes-content",
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
          {/* El aviso queda sobre la barra del carrito del POS (~3.8rem, existe hasta xl) y el menú inferior
              (3.5rem, hasta md). `mobileOffset` rige bajo 600 px y `offset` desde 600 px: los dos igual. */}
          <Toaster
            position="bottom-center"
            richColors
            offset={{ bottom: "calc(8rem + env(safe-area-inset-bottom))" }}
            mobileOffset={{ bottom: "calc(8rem + env(safe-area-inset-bottom))" }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
