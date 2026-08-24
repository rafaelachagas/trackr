import Sidebar from "@/components/ui/Sidebar"
import Topbar from "@/components/ui/Topbar"
import MobileNav from "@/components/ui/MobileNav"
import { DashboardProvider } from "@/context/DashboardContext"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <DashboardProvider>
      <div className="flex min-h-screen text-foreground transition-colors duration-400" style={{ backgroundColor: 'var(--background)' }}>
        <Sidebar />
        <main className="flex-1 min-w-0 min-h-screen flex flex-col transition-colors duration-300 overflow-hidden">
          <MobileNav />
          <Topbar />
          <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ backgroundColor: 'var(--background)' }}>
            <div className="px-4 md:px-8 pb-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </DashboardProvider>
  )
}
