"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CustomEase } from "gsap/CustomEase";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import type { RefObject } from "react";

// Registered once at module scope, not inside the hook: these are global,
// idempotent concerns, and re-running them on every mount is noise. The skill's
// rule is to register before any GSAP code runs.
gsap.registerPlugin(ScrollTrigger, CustomEase, DrawSVGPlugin, useGSAP);

// The project's single curve, as a named GSAP ease. Created once — creating it
// inside the hook redefined a global on every mount.
CustomEase.create("decode", "0.22,1,0.36,1");

/** Pass explicitly. `gsap.defaults()` is global and survives cleanup. */
const EASE = "decode";

/**
 * Landing page motion.
 *
 * Two rules this file will not break:
 *
 * 1. No hidden state is ever authored in CSS. Every from-state is set by GSAP
 *    at runtime, inside a matchMedia block. With JS off, a failed bundle, or
 *    `prefers-reduced-motion`, the page renders complete and legible — which is
 *    the safety the handoff's "no entrance animations" rule was protecting.
 * 2. Scroll motion lives on the landing page only. The studio itself renders
 *    at settled state, as specified.
 *
 * The register is deliberately narrow: rise, settle, and a little parallax.
 * Nothing spins, bounces, or slides in from the side. Premium creative software
 * moves as little as it can get away with.
 */
export function useLandingMotion(scope: RefObject<HTMLDivElement | null>) {
  useGSAP(
    () => {
      // Scoped query off the hook's own ref.
      //
      // `ScrollTrigger.batch()` and `gsap.utils.toArray()` are NOT scoped by
      // the surrounding context — they query the whole document, so they would
      // animate a matching element on any other screen the router has mounted.
      // Querying the ref directly is scoped by construction, and unlike
      // `self.selector` it cannot quietly return nothing and leave the
      // animation silently disabled.
      const root = scope.current;
      if (!root) return;
      const q = (sel: string): HTMLElement[] =>
        Array.from(root.querySelectorAll<HTMLElement>(sel));

      const mm = gsap.matchMedia();

      mm.add(
        {
          motion: "(prefers-reduced-motion: no-preference)",
        },
        (ctx) => {
          const { motion } = ctx.conditions as { motion: boolean };

          if (!motion) return;

          /* ---------------- hero ---------------- */

          gsap
            .timeline()
            // Reverted from a slower 0.78s/90ms version: it read as waiting
            // rather than as weight. A hero is seen once, but it is also the
            // first thing between the reader and the page, and this cascade
            // should be over before they notice it started.
            .from(q("[data-hero-word]"), {
              ease: EASE,
              autoAlpha: 0,
              y: 32,
              scale: 0.975,
              duration: 0.4,
              stagger: 0.07,
            })
            .from(q("[data-hero-sub]"), {
              ease: EASE,
              autoAlpha: 0,
              y: 22,
              duration: 0.4,
            }, "-=0.22")
            .from(
              q("[data-hero-act]"),
              { autoAlpha: 0, y: 20, scale: 0.98, duration: 0.4, stagger: 0.07, ease: EASE },
              "-=0.25",
            )
            .from(
              q("[data-stage]"),
              { autoAlpha: 0, y: 42, scale: 0.985, duration: 0.4, ease: EASE },
              "-=0.24",
            )
            .from(
              q("[data-hero-strip] > *"),
              { autoAlpha: 0, y: 16, duration: 0.4, stagger: 0.07, ease: EASE },
              "-=0.22",
            )
            // The diptych's argument, made once and then left alone: the
            // paragraph highlights, the link to the scene draws. It resolves
            // rather than loops — a permanent animation on the hero is the
            // thing that got called annoying, and rightly.
            .from(
              q("[data-src-hit]"),
              { scaleX: 0, autoAlpha: 0, duration: 0.4, ease: EASE },
              "-=0.30",
            )
            .from(
              q("[data-link]"),
              { drawSVG: 0, duration: 0.4, ease: EASE },
              "-=0.20",
            );

          /* ---------------- page ruler: scroll is the playhead ---------------- */

          const scenes = q("[data-scene]");
          const rulerItems = q("[data-ruler-item]");
          const rulerFills = q("[data-ruler-fill]");

          rulerFills.forEach((rulerFill) => {
            const horizontal = rulerFill.dataset.axis === "horizontal";
            gsap.fromTo(
              rulerFill,
              horizontal ? { scaleX: 0 } : { scaleY: 0 },
              {
                ...(horizontal ? { scaleX: 1 } : { scaleY: 1 }),
                ease: EASE,
                scrollTrigger: {
                  trigger: root,
                  start: "top top",
                  end: "bottom bottom",
                  scrub: true,
                },
              },
            );
          });

          const activateScene = (index: number) => {
            gsap.to(rulerItems, { opacity: 1, x: 0, duration: 0.15, ease: EASE });
            gsap.to(
              rulerItems.filter((item) => Number(item.dataset.rulerIndex) === index),
              { x: 2, duration: 0.15, ease: EASE },
            );
          };

          activateScene(0);
          scenes.forEach((scene, index) => {
            ScrollTrigger.create({
              trigger: scene,
              start: "top center",
              end: "bottom center",
              onEnter: () => activateScene(index),
              onEnterBack: () => activateScene(index),
            });
          });

          /* ---------------- section reveals ---------------- */

          ScrollTrigger.batch(q("[data-reveal]"), {
            start: "top 88%",
            once: true,
            onEnter: (els) =>
              gsap.from(els, {
                y: 38,
                scale: 0.985,
                autoAlpha: 0,
                duration: 0.4,
                stagger: 0.07,
                ease: EASE,
              }),
          });

          /* ------------- stats: numerals count up ------------- */

          q("[data-stat]").forEach((el) => {
            const to = Number(el.dataset.stat ?? 0);
            const counter = { v: 0 };
            gsap.to(counter, {
              v: to,
              duration: 0.4,
              ease: EASE,
              snap: { v: 1 },
              onUpdate: () => {
                el.textContent = String(Math.round(counter.v));
              },
              scrollTrigger: { trigger: el, start: "top 88%", once: true },
            });
          });

          /* ------------- CTA glow brightens on approach ------------- */

          const ctaGlow = q("[data-cta-glow]")[0];
          const cta = q("[data-cta]")[0];
          if (ctaGlow && cta) gsap.fromTo(
            ctaGlow,
            { scale: 0.72, autoAlpha: 0.3 },
            {
              scale: 1.12,
              autoAlpha: 1,
              ease: EASE,
              scrollTrigger: {
                trigger: cta,
                start: "top bottom",
                end: "center center",
                scrub: true,
              },
            },
          );

          /* ------------- footer wordmark settles ------------- */

          const wordmark = q("[data-wordmark]")[0];
          if (wordmark) gsap.from(wordmark, {
            y: 34,
            autoAlpha: 0.15,
            ease: EASE,
            scrollTrigger: {
              trigger: wordmark,
              start: "top bottom",
              end: "bottom bottom",
              scrub: true,
            },
          });
        },
      );

      return () => mm.revert();
    },
    { scope },
  );
}
