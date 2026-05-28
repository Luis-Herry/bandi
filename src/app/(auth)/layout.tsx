/**
 * Auth layout. No AccentProvider (no per-anime accent here), no main nav.
 * Keeps the login experience completely chrome-less.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
