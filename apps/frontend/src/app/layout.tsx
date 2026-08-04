import type { Metadata, Viewport } from "next";
import {
  Bricolage_Grotesque,
  Caveat,
  Geist_Mono,
  Instrument_Serif,
  Plus_Jakarta_Sans,
} from "next/font/google";
import "./globals.css";

// The display face for marketing surfaces: high-contrast, tight, editorial.
// One weight only — size and colour carry the hierarchy, never faux bold.
const serif = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  display: "swap",
});

// Variable font: the full 300–800 wght range ships by default, and `axes`
// adds optical sizing on top. Declaring fixed weights here would disable both.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

// Body and UI. Warmer and taller in the x-height than a neutral grotesque,
// which is what keeps the serif headlines from reading cold.
const sans = Plus_Jakarta_Sans({
  variable: "--font-sans-ui",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: "Decode",
  title: "Decode — turn any technical source into a lesson you can direct",
  description:
    "Papers, documentation, textbooks, lecture notes, specs. Decode plans the lesson, writes the script and builds every scene. You direct all of it, scene by scene.",
  keywords: [
    "educational video",
    "technical content",
    "research paper",
    "AI production studio",
    "learning design",
  ],
  openGraph: {
    type: "website",
    siteName: "Decode",
    title: "Understand anything. Not summarised — taught.",
    description:
      "Hand it any technical source. Get back a lesson you can direct, scene by scene.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Decode — taught, not summarised",
    description:
      "A production studio that turns difficult source material into lessons you can edit scene by scene.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#EFEFED",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${serif.variable} ${sans.variable} ${geistMono.variable} ${caveat.variable}`}
    >
      <head>
        {/* Motion serialises its `initial` state into the SSR markup, so if
            JS never runs the blur-in text would stay invisible. This makes
            the settled state the no-JS default. */}
        <noscript>
          <style>{`[data-blur-text] > span{opacity:1!important;filter:none!important;transform:none!important}`}</style>
        </noscript>
      </head>
      <body>{children}</body>
    </html>
  );
}
