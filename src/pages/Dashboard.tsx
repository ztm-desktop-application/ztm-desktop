import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppAlertDialog } from "@/components/app-alert-dialog";
import CourseGrid from "@/components/CourseGrid";
import type { SyncError } from "@/hooks/use-courses";
import { matchesFilter, type Course } from "@/lib/course";

// Chosen at render time so the message matches whether a list is actually shown.
function errorMessage(hasCourses: boolean) {
  return hasCourses
    ? "Could not update courses. Showing the saved local list."
    : "Could not load courses. Check your internet connection and try again.";
}

function greeting(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
}

type DashboardProps = {
  active: boolean;
  name: string;
  academyMember: boolean;
  filter: string;
  courses: Course[];
  /** Uuid of the most recently opened course, shown under Resume. */
  lastCourse: string | null;
  syncing: boolean;
  error: SyncError | null;
  onRetry: () => void;
  favourites: ReadonlySet<string>;
  onToggleFavourite: (uuid: string) => void;
  onOpenCourse: (course: Course) => void;
  canOpenCourse: (course: Course) => boolean;
  animations: boolean;
};

function Dashboard({
  active,
  name,
  academyMember,
  filter,
  courses,
  lastCourse,
  syncing,
  error,
  onRetry,
  favourites,
  onToggleFavourite,
  onOpenCourse,
  canOpenCourse,
  animations,
}: DashboardProps) {
  const [errorDialogOpen, setErrorDialogOpen] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- TODO: refactor dialog reset separately from the lint rollout.
    if (error && !syncing) setErrorDialogOpen(true);
  }, [error, syncing]);
  const visibleCourses = courses.filter((course) =>
    matchesFilter(course, filter),
  );
  const resumeCourse = courses.find((course) => course.uuid === lastCourse);
  const trimmedName = name.trim();

  // The Dashboard stays mounted while hidden, so refresh the greeting as the day moves on.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <main className="p-6">
      <div className="mb-2 flex items-center gap-4">
        {trimmedName && (
          <p className="min-w-0 text-[2.5rem] leading-[1.2] font-bold [overflow-wrap:anywhere]">
            {greeting(now)}, {trimmedName}
          </p>
        )}
        <Badge variant={academyMember ? "default" : "secondary"}>
          {academyMember ? "Academy" : "Public"}
        </Badge>
      </div>
      <h1 className="text-[1.75rem] font-semibold">Dashboard</h1>
      {resumeCourse && (
        <section>
          <h2 id="resume-heading" className="mt-4 text-[1.25rem] font-semibold">
            Resume
          </h2>
          <CourseGrid
            courses={[resumeCourse]}
            favourites={favourites}
            onToggleFavourite={onToggleFavourite}
            onOpenCourse={onOpenCourse}
            canOpenCourse={canOpenCourse}
            labelledBy="resume-heading"
            animations={animations}
          />
        </section>
      )}
      <h2 id="courses-heading" className="mt-4 text-[1.25rem] font-semibold">
        Courses
      </h2>
      {syncing && (
        <p role="status" className="mt-4">
          {courses.length
            ? "Checking for course updates..."
            : "Loading courses..."}
        </p>
      )}
      {error && (
        <>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => setErrorDialogOpen(true)}
          >
            Course loading unavailable
          </Button>
          <AppAlertDialog
            open={active && !syncing && errorDialogOpen}
            onOpenChange={setErrorDialogOpen}
            title={
              error === "desktop-only"
                ? "Course loading requires the desktop app"
                : courses.length > 0
                  ? "Could not update courses"
                  : "Could not load courses"
            }
            description={
              error === "desktop-only" ? (
                <>
                  Course loading is only available in the ZTM desktop app. Open
                  the desktop app to continue.
                  {import.meta.env.DEV && (
                    <>
                      {" "}
                      For development, run npm run tauri dev and use the desktop
                      window, not the browser preview.
                    </>
                  )}
                </>
              ) : (
                errorMessage(courses.length > 0)
              )
            }
            action={
              error === "sync-failed"
                ? { label: "Retry", onClick: onRetry }
                : undefined
            }
          />
        </>
      )}
      {courses.length > 0 && visibleCourses.length === 0 && (
        <p className="mt-4 text-muted-foreground [overflow-wrap:anywhere]">
          No courses match &quot;{filter.trim()}&quot;.
        </p>
      )}
      {visibleCourses.length > 0 && (
        <CourseGrid
          courses={visibleCourses}
          favourites={favourites}
          onToggleFavourite={onToggleFavourite}
          onOpenCourse={onOpenCourse}
          canOpenCourse={canOpenCourse}
          animations={animations}
          labelledBy="courses-heading"
        />
      )}
    </main>
  );
}

export default Dashboard;
