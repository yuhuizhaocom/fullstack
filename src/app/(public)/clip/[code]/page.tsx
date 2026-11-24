import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ClipRoom } from "@/components/clip/clip-room";
import { isValidChannel, normalizeChannel } from "@/lib/clip/constants";

export const dynamic = "force-dynamic";

export default async function ClipChannelPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const channel = normalizeChannel(code);

  if (!isValidChannel(channel)) {
    redirect("/clip");
  }

  return (
    <div className="space-y-4">
      <Link
        href="/clip"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        换个频道
      </Link>
      <ClipRoom channel={channel} />
    </div>
  );
}
