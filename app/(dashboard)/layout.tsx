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
      <div className="flex min-h-screen bg-background text-foreground transition-colors duration-400">
        <Sidebar />
        <main className="flex-1 min-h-screen flex flex-col transition-colors duration-400 overflow-hidden" style={{ paddingLeft: '256px' }}>
          <Topbar />
          <div className="flex-1 py-8 px-10 overflow-y-auto overflow-x-hidden">
            {children}
          </div>
        </main>
      </div>
    </DashboardProvider>
  )
}
