import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import authConfig from "./auth.config"
import { authenticateUser } from "@/lib/services/auth/local-user-store"

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await authenticateUser(email, password);
        if (!user) return null;

        // Block non-active users (PENDING waitlist, SUSPENDED)
        if (user.status !== "ACTIVE") return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
})
