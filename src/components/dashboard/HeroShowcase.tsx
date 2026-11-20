"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  selectMainHero,
  heroVisual,
  getHeroRenderUrl,
  shouldAnimateHero,
} from "@/lib/dota-presentation";
import type { DotaHero, DotaProfileBundle } from "@/lib/dota-stats/types";
export function HeroShowcase({ data }: { data: DotaProfileBundle }) {
  if (data.availability === "PUBLIC_DATA_NOT_SHARED") return null;
  const choice = selectMainHero(
    (data.heroes.data as DotaHero[] | null) ?? [],
    data.heroes.fetchedAt,
  );
  const visual = heroVisual(
    data.catalog.find((h) => h.heroId === choice?.hero.heroId),
  );
  if (
    !choice ||
    !visual ||
    (data.heroes.status && !["available", "stale"].includes(data.heroes.status))
  )
    return null;
  return (
    <HeroScene
      key={choice.hero.heroId}
      name={visual.name}
      portrait={visual.portrait}
      artwork={visual.artwork}
      render={getHeroRenderUrl(choice.hero.heroId, data.catalog)}
    />
  );
}
export function HeroScene({
  name,
  portrait,
  artwork,
  render,
}: {
  name: string;
  portrait: string;
  artwork?: string;
  render: string | null;
}) {
  const root = useRef<HTMLElement>(null),
    video = useRef<HTMLVideoElement>(null);
  const [animated, setAnimated] = useState(false),
    [visible, setVisible] = useState(false),
    [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)"),
      desktop = matchMedia("(min-width: 1280px)");
    const update = () =>
      setAnimated(
        shouldAnimateHero(
          reduce.matches,
          window.innerWidth,
          !!document
            .createElement("video")
            .canPlayType('video/webm; codecs="vp9"'),
        ),
      );
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((e) => e.isIntersecting)),
      { threshold: 0.05 },
    );
    if (root.current) observer.observe(root.current);
    const init = setTimeout(update, 0);
    reduce.addEventListener("change", update);
    desktop.addEventListener("change", update);
    return () => {
      clearTimeout(init);
      observer.disconnect();
      reduce.removeEventListener("change", update);
      desktop.removeEventListener("change", update);
    };
  }, []);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (visible && animated) void v.play().catch(() => setFailed(render));
    else v.pause();
  }, [visible, animated, render]);
  const staticSrc = artwork && failed !== artwork ? artwork : portrait;
  if (failed === portrait) return null;
  return (
    <figure ref={root} className="hero-showcase" aria-label={`Héroe: ${name}`}>
      {animated && render && failed !== render && visible ? (
        <video
          ref={video}
          src={render}
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          disablePictureInPicture
          onError={() => setFailed(render)}
          className="hero-showcase-render"
          aria-hidden="true"
        />
      ) : (
        <Image
          unoptimized
          loading="lazy"
          src={staticSrc}
          alt=""
          width={400}
          height={225}
          onError={() => setFailed(staticSrc)}
          className="hero-showcase-image"
        />
      )}
      <figcaption className="sr-only">{name}</figcaption>
    </figure>
  );
}
