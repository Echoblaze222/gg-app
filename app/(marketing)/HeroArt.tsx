"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Turntable } from "@/components/motion/Turntable";

const SHEET = "/illustrations/pig-360.webp";
const POSTER = "/illustrations/pig-poster.webp";

type Mode = "checking" | "turntable" | "static";

/**
 * The hero picture. It prefers the 360 degree pig. If the sprite sheet is not deployed or fails to load,
 * it shows the static ink sketch scene instead, so the hero is never an empty ring.
 */
export function HeroArt() {
  const [mode, setMode] = useState<Mode>("checking");

  useEffect(() => {
    let cancelled = false;
    const probe = new window.Image();
    probe.onload = () => !cancelled && setMode("turntable");
    probe.onerror = () => !cancelled && setMode("static");
    probe.src = SHEET;
    return () => {
      cancelled = true;
    };
  }, []);

  if (mode === "turntable") {
    return (
      <Turntable
        src={SHEET}
        frames={30}
        columns={6}
        rows={5}
        frameWidth={440}
        frameHeight={412}
        poster={POSTER}
        startYaw={-0.55}
        label="Glass piggy bank full of gold coins"
      />
    );
  }

  return (
    <Image
      src="/illustrations/hero-scene.webp"
      width={1027}
      height={505}
      priority
      sizes="(min-width: 1024px) 760px, 100vw"
      alt="A glass piggy bank full of gold coins, with a receipt, a calendar, a shield and a phone floating around it."
      className="h-auto w-full"
    />
  );
}
