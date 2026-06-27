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
      <div className="flex min-h-screen text-foreground transition-colors duration-400" style={{ backgroundColor: '#0e1315' }}>
        <Sidebar />
        <main className="flex-1 min-h-screen flex flex-col transition-colors duration-300 overflow-hidden">
          <Topbar />
          <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ backgroundColor: '#13181a' }}>
            <div className="px-8 pb-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </DashboardProvider>
  )
}
