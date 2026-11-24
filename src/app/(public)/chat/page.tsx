import type { Metadata } from "next";

import { ChatRoom } from "@/components/chat/chat-room";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "聊天室",
};

export default async function ChatPage() {
  const user = await getCurrentUser();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">聊天室</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          登录后以账号名发言；未登录填个昵称即可参与
        </p>
      </div>
      <ChatRoom viewer={user ? { id: user.id, name: user.name } : null} />
    </div>
  );
}
