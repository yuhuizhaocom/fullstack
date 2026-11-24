import type { Metadata } from "next";

import { FileShare } from "@/components/files/file-share";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "附件分享",
};

export default async function FilesPage() {
  const user = await getCurrentUser();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">附件分享</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          无需登录即可上传，单个文件不超过 100MB，24 小时后自动删除
        </p>
      </div>
      <FileShare signedInName={user?.name ?? null} />
    </div>
  );
}
