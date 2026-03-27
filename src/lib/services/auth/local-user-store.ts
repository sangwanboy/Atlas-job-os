import { hashPassword, verifyPassword } from "@/lib/utils/password";

export type LocalUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: "USER" | "ADMIN";
  createdAt: string;
};

let users: LocalUser[] = [];
let initialized = false;

async function ensureDefaults() {
  if (initialized) return;
  initialized = true;

  const adminHash = await hashPassword("admin123");
  users.push({
    id: "admin-default",
    email: "admin@jobos.local",
    name: "Admin",
    passwordHash: adminHash,
    role: "ADMIN",
    createdAt: new Date().toISOString(),
  });
}

export async function findUserByEmail(
  email: string,
): Promise<LocalUser | undefined> {
  await ensureDefaults();
  return users.find((u) => u.email === email);
}

export async function findUserById(
  id: string,
): Promise<LocalUser | undefined> {
  await ensureDefaults();
  return users.find((u) => u.id === id);
}

export async function authenticateUser(
  email: string,
  password: string,
): Promise<LocalUser | null> {
  await ensureDefaults();
  const user = users.find((u) => u.email === email);
  if (!user) return null;
  const valid = await verifyPassword(password, user.passwordHash);
  return valid ? user : null;
}

export async function createUser(
  email: string,
  name: string,
  password: string,
  role: "USER" | "ADMIN" = "USER",
): Promise<LocalUser> {
  await ensureDefaults();
  if (users.find((u) => u.email === email)) {
    throw new Error("Email already registered");
  }
  const passwordHash = await hashPassword(password);
  const user: LocalUser = {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    email,
    name,
    passwordHash,
    role,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  return user;
}

export async function getAllUsers(): Promise<
  Omit<LocalUser, "passwordHash">[]
> {
  await ensureDefaults();
  return users.map(({ passwordHash, ...rest }) => rest);
}

export async function updateUserRole(
  id: string,
  role: "USER" | "ADMIN",
): Promise<LocalUser | null> {
  await ensureDefaults();
  const user = users.find((u) => u.id === id);
  if (!user) return null;
  user.role = role;
  return user;
}

export async function deleteUser(id: string): Promise<boolean> {
  await ensureDefaults();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return false;
  if (users[idx].role === "ADMIN" && users.filter((u) => u.role === "ADMIN").length <= 1) {
    throw new Error("Cannot delete the last admin");
  }
  users.splice(idx, 1);
  return true;
}

export async function resetUserPassword(
  id: string,
  newPassword: string,
): Promise<boolean> {
  await ensureDefaults();
  const user = users.find((u) => u.id === id);
  if (!user) return false;
  user.passwordHash = await hashPassword(newPassword);
  return true;
}
