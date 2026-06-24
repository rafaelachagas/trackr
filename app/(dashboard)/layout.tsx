import Sidebar from "@/components/ui/Sidebar"
import Topbar from "@/components/ui/Topbar"
import { DashboardProvider } from "@/context/DashboardContext"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <DashboardProvider>
      <div className="flex min-h-screen text-foreground transition-colors duration-400" style={{ backgroundColor: '#121212' }}>
        <Sidebar />
        <main className="flex-1 min-h-screen flex flex-col transition-colors duration-300 overflow-hidden">
          <Topbar />
          <div className="flex-1 py-8 px-10 overflow-y-auto overflow-x-hidden">
            {children}
          </div>
        </main>
      </div>
    </DashboardProvider>
  )
}
