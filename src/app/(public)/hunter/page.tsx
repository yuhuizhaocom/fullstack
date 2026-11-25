import type { Metadata } from "next";

import { HunterGame } from "@/components/hunter/hunter-game";

export const metadata: Metadata = {
  title: "猎人与农民",
};

export default function HunterPage() {
  return <HunterGame />;
}
