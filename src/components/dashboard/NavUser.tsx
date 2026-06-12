"use client";

import {
  SealCheck,
  Bell,
  CaretUpDown,
  CreditCard,
  SignOut,
  Sparkle,
} from "@phosphor-icons/react";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export function NavUser({
  user,
}: {
  user: {
    name: string;
    email: string;
    avatar?: string;
  };
}) {
  const { isMobile } = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-[var(--gl-bg-muted)] data-[state=open]:text-[var(--gl-text-primary)] hover:bg-[var(--gl-bg-muted)] transition-colors duration-200"
              >
                <Avatar className="h-8 w-8 rounded-lg ring-1 ring-[var(--gl-border)]">
                  <AvatarFallback className="rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-xs font-bold">
                    GL
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold text-[var(--gl-text-primary)]">{user.name}</span>
                  <span className="truncate text-xs text-[var(--gl-text-muted)]">{user.email}</span>
                </div>
                <CaretUpDown size={18} className="ml-auto text-[var(--gl-text-muted)]" />
              </SidebarMenuButton>
            }
          />
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg bg-[var(--gl-bg-card)] border border-[var(--gl-border)] text-[var(--gl-text-primary)] shadow-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-3 py-2 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg ring-1 ring-[var(--gl-border)]">
                  <AvatarFallback className="rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-xs font-bold">
                    GL
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{user.name}</span>
                  <span className="truncate text-xs text-[var(--gl-text-muted)]">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[var(--gl-border)]" />
            <DropdownMenuGroup>
              <DropdownMenuItem className="hover:bg-[var(--gl-bg-muted)] focus:bg-[var(--gl-bg-muted)] focus:text-[var(--gl-text-primary)] transition-colors">
                <Sparkle size={18} className="mr-2 text-amber-500" />
                Upgrade to Pro
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="bg-[var(--gl-border)]" />
            <DropdownMenuGroup>
              <DropdownMenuItem className="hover:bg-[var(--gl-bg-muted)] focus:bg-[var(--gl-bg-muted)] focus:text-[var(--gl-text-primary)] transition-colors">
                <SealCheck size={18} className="mr-2" />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem className="hover:bg-[var(--gl-bg-muted)] focus:bg-[var(--gl-bg-muted)] focus:text-[var(--gl-text-primary)] transition-colors">
                <CreditCard size={18} className="mr-2" />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem className="hover:bg-[var(--gl-bg-muted)] focus:bg-[var(--gl-bg-muted)] focus:text-[var(--gl-text-primary)] transition-colors">
                <Bell size={18} className="mr-2" />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="bg-[var(--gl-border)]" />
            <DropdownMenuItem className="text-red-500 hover:bg-red-500/10 focus:bg-red-500/10 focus:text-red-500 transition-colors cursor-pointer">
              <SignOut size={18} className="mr-2" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
