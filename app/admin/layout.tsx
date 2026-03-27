// Force all admin pages to be server-rendered on demand (never statically prerendered)
// This is required because admin pages depend on authentication and Supabase cookies.
export const dynamic = 'force-dynamic'

import AdminLayoutClient from './AdminLayoutClient'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>
}
