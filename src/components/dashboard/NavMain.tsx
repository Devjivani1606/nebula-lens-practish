"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CaretRight } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

export interface NavMainItem {
  title: string;
  id?: string;
  icon?: React.ElementType;
  badge?: string;
  items?: {
    title: string;
    id: string;
  }[];
}

function getHref(id: string) {
  if (id === "overview") return "/dashboard";
  if (id === "blast-radius") return "/dashboard/canvas";
  return `/dashboard/${id}`;
}

export function NavMain({ items }: { items: NavMainItem[] }) {
  const pathname = usePathname();
  const [openStates, setOpenStates] = React.useState<Record<string, boolean>>({});

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-slate-400 dark:text-slate-500 font-bold tracking-wider uppercase text-[10px]">
        Platform
      </SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const hasSubItems = item.items && item.items.length > 0;
          
          const isMainActive = item.id ? pathname === getHref(item.id) : false;
          const isSubActive = hasSubItems && item.items?.some(sub => pathname === getHref(sub.id));
          const isOpen = isMainActive || isSubActive;
          const isCurrentOpen = openStates[item.title] ?? isOpen;

          if (!hasSubItems) {
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  tooltip={item.title}
                  render={<Link href={getHref(item.id!)} />}
                  className={cn(
                    "font-bold transition-all duration-200",
                    isMainActive
                      ? "bg-[rgba(59,130,246,0.12)] text-blue-400 hover:text-blue-400 hover:bg-[rgba(59,130,246,0.15)] shadow-[inset_0_0_0_1px_rgba(59,130,246,0.2)]"
                      : "text-[var(--gl-text-secondary)] hover:bg-[var(--gl-bg-muted)] hover:text-[var(--gl-text-primary)]"
                  )}
                >
                  {item.icon && <item.icon size={18} className="shrink-0" />}
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          }

          return (
            <Collapsible
              key={item.title}
              open={isCurrentOpen}
              onOpenChange={(open) => setOpenStates((prev) => ({ ...prev, [item.title]: open }))}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger
                  render={
                    <SidebarMenuButton
                      tooltip={item.title}
                      className={cn(
                        "font-bold transition-all duration-200",
                        isSubActive
                          ? "text-blue-400 hover:text-blue-400"
                          : "text-[var(--gl-text-secondary)] hover:bg-[var(--gl-bg-muted)] hover:text-[var(--gl-text-primary)]"
                      )}
                    >
                      {item.icon && <item.icon size={18} className="shrink-0" />}
                      <span>{item.title}</span>
                      <CaretRight size={18} className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  }
                />
                <CollapsibleContent>
                  <SidebarMenuSub className="border-l border-[var(--gl-border)] ml-4.5 pl-2 mt-0.5 space-y-0.5">
                    {item.items?.map((subItem) => {
                      const isSubItemActive = pathname === getHref(subItem.id);
                      return (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton
                            render={<Link href={getHref(subItem.id)} />}
                            className={cn(
                              "text-xs transition-colors duration-150 cursor-pointer py-1.5",
                              isSubItemActive
                                ? "text-blue-400 font-bold bg-[rgba(59,130,246,0.08)]"
                                : "text-[var(--gl-text-secondary)] hover:text-[var(--gl-text-primary)] hover:bg-[var(--gl-bg-muted)]"
                            )}
                          >
                            <span>{subItem.title}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      );
                    })}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
