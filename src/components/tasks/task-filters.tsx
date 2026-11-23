"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FilterX, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  taskPriorityOptions,
  taskStatusOptions,
} from "@/lib/task-meta";

type TaskFiltersProps = {
  q: string;
  status: string;
  priority: string;
};

export function TaskFilters({ q, status, priority }: TaskFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(q);

  useEffect(() => {
    setSearch(q);
  }, [q]);

  function updateParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    params.delete("page");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      const value = search.trim();
      if (value === q) return;
      updateParams((params) => {
        if (value) {
          params.set("q", value);
        } else {
          params.delete("q");
        }
      });
    }, 350);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const hasFilters = Boolean(q || status || priority);

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索标题、描述或负责人..."
          className="h-9 pl-9"
          aria-label="搜索任务"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto">
        <Select
          value={status || "ALL"}
          onValueChange={(value) =>
            updateParams((params) => {
              if (value === "ALL") {
                params.delete("status");
              } else {
                params.set("status", value);
              }
            })
          }
        >
          <SelectTrigger className="h-9 sm:w-[132px]" aria-label="按状态筛选">
            <SelectValue placeholder="全部状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">全部状态</SelectItem>
            {taskStatusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={priority || "ALL"}
          onValueChange={(value) =>
            updateParams((params) => {
              if (value === "ALL") {
                params.delete("priority");
              } else {
                params.set("priority", value);
              }
            })
          }
        >
          <SelectTrigger className="h-9 sm:w-[132px]" aria-label="按优先级筛选">
            <SelectValue placeholder="全部优先级" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">全部优先级</SelectItem>
            {taskPriorityOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 shrink-0 gap-1.5 px-2 text-muted-foreground"
          onClick={() => router.replace(pathname, { scroll: false })}
        >
          <FilterX className="size-4" />
          清除筛选
        </Button>
      )}
    </div>
  );
}
