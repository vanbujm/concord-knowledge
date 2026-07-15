import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const TITLE = "Concord Wiki Search";
const DESCRIPTION =
  "Fast, cited search across the Concord LARP wiki, via web and MCP.";

export const metadata: Metadata = {
  metadataBase: new URL("https://concord-knowledge.vercel.app"),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
  },
};

// The UI is dark-only (see the forced `dark` class on <html>), so tell the
// browser to render form controls and scrollbars dark and match the chrome.
export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0a0a0a",
};

const RootLayout = ({
  children,
}: Readonly<{ children: React.ReactNode }>) => {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
};

export default RootLayout;
