export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-black items-center justify-center p-4 font-sans text-zinc-200">
      <div className="w-full max-w-md relative z-10">
        {children}
      </div>
      
      {/* Elementos decorativos de fondo opcionales */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] opacity-50"></div>
      </div>
    </div>
  )
}
