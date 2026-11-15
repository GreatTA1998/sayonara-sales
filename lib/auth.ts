export function adminPassword() {
  return process.env.ADMIN_PASSWORD || "admin";
}

export function checkAdmin(password: string | null | undefined) {
  return !!password && password === adminPassword();
}
