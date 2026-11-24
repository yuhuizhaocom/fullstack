"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Shuffle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CLIP_CHANNEL_LENGTH,
  randomChannel,
} from "@/lib/clip/constants";

export function ClipJoinForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  function join(target: string) {
    const value = target.trim().toLowerCase();
    if (!new RegExp(`^[a-z0-9]{${CLIP_CHANNEL_LENGTH}}$`).test(value)) {
      setError(`请输入 ${CLIP_CHANNEL_LENGTH} 位字母或数字的频道码`);
      return;
    }
    setError("");
    router.push(`/clip/${value}`);
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        join(code);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="channel">频道码</Label>
        <Input
          id="channel"
          value={code}
          onChange={(event) => {
            setCode(event.target.value.toLowerCase().slice(0, CLIP_CHANNEL_LENGTH));
            setError("");
          }}
          placeholder="例如 k7f2qd"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={CLIP_CHANNEL_LENGTH}
          className="font-mono tracking-[0.3em] uppercase"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" className="flex-1">
          进入频道
          <ArrowRight className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => {
            const created = randomChannel();
            setCode(created);
            router.push(`/clip/${created}`);
          }}
        >
          <Shuffle className="size-4" />
          创建随机频道
        </Button>
      </div>
    </form>
  );
}
