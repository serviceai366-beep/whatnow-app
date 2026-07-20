function configuredEmails(value: string | undefined): Set<string> {
  return new Set((value ?? "").split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)));
}

export function isSupportAdministrator(
  email: string,
  environment: Record<string, string | undefined> = process.env,
): boolean {
  const normalized = email.trim().toLowerCase();
  return Boolean(normalized) && configuredEmails(environment.WHATNOW_SUPPORT_ADMIN_EMAILS).has(normalized);
}
