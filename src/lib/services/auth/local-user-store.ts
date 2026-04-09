import { hashPassword, verifyPassword } from "@/lib/utils/password";
import { prisma } from "@/lib/db";

export type LocalUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "PENDING" | "SUSPENDED";
  createdAt: string;
};

async function ensureDefaults() {
  const admin = await prisma.user.findUnique({ where: { email: "admin@jobos.local" } });
  if (!admin) {
    const passwordHash = await hashPassword("admin123");
    await prisma.user.create({
      data: {
        email: "admin@jobos.local",
        name: "Admin",
        passwordHash,
        role: "ADMIN",
      },
    });
  }
}

export async function findUserByEmail(email: string): Promise<LocalUser | undefined> {
  await ensureDefaults();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, passwordHash: true, role: true, status: true, createdAt: true },
  });
  if (!user || !user.passwordHash) return undefined;
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? "",
    passwordHash: user.passwordHash,
    role: user.role as "USER" | "ADMIN",
    status: user.status as "ACTIVE" | "PENDING" | "SUSPENDED",
    createdAt: user.createdAt.toISOString(),
  };
}

export async function findUserById(id: string): Promise<LocalUser | undefined> {
  await ensureDefaults();
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, passwordHash: true, role: true, status: true, createdAt: true },
  });
  if (!user || !user.passwordHash) return undefined;
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? "",
    passwordHash: user.passwordHash,
    role: user.role as "USER" | "ADMIN",
    status: user.status as "ACTIVE" | "PENDING" | "SUSPENDED",
    createdAt: user.createdAt.toISOString(),
  };
}

export async function authenticateUser(email: string, password: string): Promise<LocalUser | null> {
  const user = await findUserByEmail(email);
  if (!user) return null;
  const valid = await verifyPassword(password, user.passwordHash);
  return valid ? user : null;
}

export async function createUser(
  email: string,
  name: string,
  password: string,
  role: "USER" | "ADMIN" = "USER",
  status: "ACTIVE" | "PENDING" = "ACTIVE",
): Promise<LocalUser> {
  await ensureDefaults();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("Email already registered");
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, name, passwordHash, role, status },
    select: { id: true, email: true, name: true, passwordHash: true, role: true, status: true, createdAt: true },
  });
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? "",
    passwordHash: user.passwordHash!,
    role: user.role as "USER" | "ADMIN",
    status: user.status as "ACTIVE" | "PENDING" | "SUSPENDED",
    createdAt: user.createdAt.toISOString(),
  };
}

export async function getAllUsers(): Promise<Omit<LocalUser, "passwordHash">[]> {
  await ensureDefaults();
  const users = await prisma.user.findMany({
    where: { passwordHash: { not: null } },
    select: { id: true, email: true, name: true, role: true, status: true, createdAt: true },
  });
  return users.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name ?? "",
    role: u.role as "USER" | "ADMIN",
    status: u.status as "ACTIVE" | "PENDING" | "SUSPENDED",
    createdAt: u.createdAt.toISOString(),
  }));
}

export async function updateUserStatus(
  id: string,
  status: "ACTIVE" | "PENDING" | "SUSPENDED",
): Promise<Omit<LocalUser, "passwordHash"> | null> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return null;
  const updated = await prisma.user.update({
    where: { id },
    data: { status },
    select: { id: true, email: true, name: true, role: true, status: true, createdAt: true },
  });
  return {
    id: updated.id,
    email: updated.email,
    name: updated.name ?? "",
    role: updated.role as "USER" | "ADMIN",
    status: updated.status as "ACTIVE" | "PENDING" | "SUSPENDED",
    createdAt: updated.createdAt.toISOString(),
  };
}

export async function updateUserRole(id: string, role: "USER" | "ADMIN"): Promise<LocalUser | null> {
  const user = await prisma.user.update({
    where: { id },
    data: { role },
    select: { id: true, email: true, name: true, passwordHash: true, role: true, status: true, createdAt: true },
  });
  if (!user.passwordHash) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? "",
    passwordHash: user.passwordHash,
    role: user.role as "USER" | "ADMIN",
    status: user.status as "ACTIVE" | "PENDING" | "SUSPENDED",
    createdAt: user.createdAt.toISOString(),
  };
}

export async function deleteUser(id: string): Promise<boolean> {
  const admins = await prisma.user.count({ where: { role: "ADMIN" } });
  const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (target?.role === "ADMIN" && admins <= 1) throw new Error("Cannot delete the last admin");
  await prisma.user.delete({ where: { id } });
  return true;
}

export async function resetUserPassword(id: string, newPassword: string): Promise<boolean> {
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
  return true;
}
