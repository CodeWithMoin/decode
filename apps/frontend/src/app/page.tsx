import type { Metadata } from "next";
import { WaitlistLanding } from "@/components/landing/WaitlistLanding";

export const metadata: Metadata = {
  title: "Decode — understand anything. Not summarised, taught.",
  description:
    "Type a topic or bring a paper, and Decode builds the whole animated lesson — the plan, the narration, the scenes. You direct it, scene by scene, in plain language.",
};

export default function Page() {
  return <WaitlistLanding />;
}
