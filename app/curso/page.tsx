import { coursesData } from "@/lib/course-data"
import Link from "next/link"

export default function CursosPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-12">
        <h1 className="text-4xl font-extrabold tracking-tight mb-2">Meus Cursos</h1>
        <p className="text-gray-400">Continue de onde parou ou comece uma nova jornada.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {coursesData.map(course => (
          <Link href={`/curso/${course.id}`} key={course.id} className="group">
            <div className="relative rounded-2xl overflow-hidden bg-white/5 border border-white/10 transition-all duration-300 hover:border-purple-500/50 hover:shadow-[0_0_30px_-5px_rgba(168,85,247,0.3)] hover:-translate-y-1">
              <div className="aspect-video bg-gradient-to-br from-neutral-800 to-black relative">
                <div className="absolute inset-0 bg-black/40 group-hover:bg-transparent transition-colors duration-500 z-10" />
                <div className="absolute inset-0 flex items-center justify-center z-20">
                  <h3 className="text-2xl font-black uppercase tracking-widest bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50 text-center px-4 drop-shadow-2xl">
                    {course.title}
                  </h3>
                </div>
              </div>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">{course.modules.reduce((acc, m) => acc + m.lessons.length, 0)} Aulas</span>
                  <span className="text-xs font-medium bg-white/10 px-2 py-1 rounded-md text-gray-300">Acesso Vitalício</span>
                </div>
                <h2 className="text-xl font-bold mb-2 text-white group-hover:text-purple-300 transition-colors">{course.title}</h2>
                <div className="w-full bg-white/10 h-1.5 rounded-full mt-4 overflow-hidden">
                  <div className="bg-gradient-to-r from-purple-500 to-pink-500 h-full w-0 group-hover:w-full transition-all duration-1000 ease-out" />
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
