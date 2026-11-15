/**
 * Fonts for the whole app, self hosted by next/font.
 * The root layout (Integrator) must attach `fontVariables` to <html>. See docs/handoffs/ai3-to-integrator-1-root-setup.md.
 * Until then the token stacks in tokens.css fall back to system fonts, so nothing breaks.
 */
import { Instrument_Serif, Geist, Geist_Mono } from "next/font/google";

export const fontDisplay = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display-loaded",
  display: "swap",
});

export const fontBody = Geist({
  subsets: ["latin"],
  variable: "--font-body-loaded",
  display: "swap",
});

export const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono-loaded",
  display: "swap",
});

/** Class names to place on <html>. */
export const fontVariables = `${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable}`;
