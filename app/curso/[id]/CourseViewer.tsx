"use client"

import { useState } from "react"
import type { Course, CourseLesson } from "@/lib/course-data"

export default function CourseViewer({ course }: { course: Course }) {
  const [activeLesson, setActiveLesson] = useState<CourseLesson>(course.modules[0].lessons[0])
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({
    [course.modules[0].id]: true
  })

  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev => ({ ...prev, [moduleId]: !prev[moduleId] }))
  }

  const getYoutubeVideoId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/
    const match = url.match(regExp)
    return match && match[2].length === 11 ? match[2] : null
  }

  const videoId = getYoutubeVideoId(activeLesson.videoUrl)
  const isYoutube = !!videoId

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] bg-[#0A0A0A]">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <div className="flex-1 bg-black w-full h-full relative border-b border-white/5 lg:border-r lg:border-b-0">
          {isYoutube ? (
            <iframe
              className="absolute inset-0 w-full h-full"
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-neutral-900 to-black p-8 text-center">
              <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-6 border border-white/10">
                <svg className="w-10 h-10 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-4">{activeLesson.title}</h2>
              <p className="text-gray-400 mb-8 max-w-md">Este material está disponível em uma plataforma externa. Clique no botão abaixo para acessar o conteúdo.</p>
              <a 
                href={activeLesson.videoUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full font-semibold hover:scale-105 transition-transform shadow-[0_0_20px_-5px_rgba(168,85,247,0.5)]"
              >
                Acessar Material Externo
              </a>
            </div>
          )}
        </div>
        <div className="p-6 bg-[#0A0A0A] shrink-0 z-10 border-r border-white/5 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.5)]">
          <h1 className="text-2xl font-bold text-white mb-2">{activeLesson.title}</h1>
          <p className="text-gray-400 text-sm">{course.title}</p>
        </div>
      </div>

      {/* Sidebar Navigation */}
      <div className="w-full lg:w-[400px] h-full flex flex-col bg-[#0F0F0F] border-l border-white/5">
        <div className="p-6 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-bold text-white mb-1">Conteúdo do Curso</h2>
          <div className="w-full bg-white/10 h-1 rounded-full mt-3 overflow-hidden">
             <div className="bg-gradient-to-r from-purple-500 to-pink-500 h-full w-1/3" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {course.modules.map((mod, idx) => (
            <div key={mod.id} className="border-b border-white/5 last:border-0">
              <button
                onClick={() => toggleModule(mod.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
              >
                <div className="text-left">
                  <h3 className="font-semibold text-sm text-gray-200">Módulo {idx + 1}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{mod.title}</p>
                </div>
                <svg
                  className={`w-5 h-5 text-gray-500 transition-transform duration-300 ${expandedModules[mod.id] ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              <div 
                className={`overflow-hidden transition-all duration-300 ${expandedModules[mod.id] ? 'max-h-max border-t border-white/5 bg-black/20' : 'max-h-0'}`}
              >
                {mod.lessons.map((lesson, index) => {
                  const isActive = activeLesson.id === lesson.id
                  return (
                    <button
                      key={lesson.id}
                      onClick={() => setActiveLesson(lesson)}
                      className={`w-full flex items-start p-4 hover:bg-white/5 transition-colors text-left gap-3 ${isActive ? 'bg-purple-500/10 border-l-2 border-purple-500' : 'border-l-2 border-transparent'}`}
                    >
                      <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${isActive ? 'border-purple-500 bg-purple-500/20' : 'border-gray-600 bg-transparent'}`}>
                        {isActive ? (
                          <div className="w-2 h-2 rounded-full bg-purple-400" />
                        ) : (
                          <span className="text-[10px] text-gray-500">{index + 1}</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className={`text-sm ${isActive ? 'text-white font-medium' : 'text-gray-400'}`}>
                          {lesson.title}
                        </h4>
                        <div className="flex items-center gap-2 mt-2">
                          {getYoutubeVideoId(lesson.videoUrl) ? (
                            <span className="text-[10px] uppercase font-bold tracking-wider text-purple-400 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" /></svg>
                              Vídeo
                            </span>
                          ) : (
                            <span className="text-[10px] uppercase font-bold tracking-wider text-pink-400 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                              Material
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
