import type { Metadata } from "next";
import { WaitlistLanding } from "@/components/landing/WaitlistLanding";

export const metadata: Metadata = {
  title: "Decode — ask a question, get a video that teaches",
  description:
    "Type a question and Decode builds an animated video explanation — a planned lesson, narrated and drawn to teach, not a wall of text to skim.",
};

export default function Page() {
  return <WaitlistLanding />;
}
