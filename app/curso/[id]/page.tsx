import { coursesData } from "@/lib/course-data"
import { notFound } from "next/navigation"
import CourseViewer from "./CourseViewer"

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const course = coursesData.find(c => c.id === id)
  
  if (!course) {
    notFound()
  }

  return <CourseViewer course={course} />
}
