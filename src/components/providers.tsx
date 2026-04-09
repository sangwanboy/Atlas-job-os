"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <SessionProvider basePath="/api/auth" refetchInterval={3600} refetchOnWindowFocus={false} refetchWhenOffline={false}>
        {children}
      </SessionProvider>
    </ThemeProvider>
  );
}
