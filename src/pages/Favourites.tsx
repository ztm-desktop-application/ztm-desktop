import CourseGrid from "@/components/CourseGrid";
import { matchesFilter, type Course } from "@/lib/course";

type FavouritesProps = {
  filter: string;
  courses: Course[];
  favourites: ReadonlySet<string>;
  onToggleFavourite: (uuid: string) => void;
  onOpenCourse: (course: Course) => void;
  canOpenCourse: (course: Course) => boolean;
  animations: boolean;
};

function Favourites({
  filter,
  courses,
  favourites,
  onToggleFavourite,
  onOpenCourse,
  canOpenCourse,
  animations,
}: FavouritesProps) {
  const favouriteCourses = courses.filter((course) =>
    favourites.has(course.uuid),
  );
  const visibleCourses = favouriteCourses.filter((course) =>
    matchesFilter(course, filter),
  );

  return (
    <main className="p-6">
      <h1 id="favourites-heading" className="text-[1.75rem] font-semibold">
        Favourites
      </h1>
      {favouriteCourses.length === 0 && (
        <p className="mt-4 text-muted-foreground">
          No favourites yet. Star a course on the Dashboard to add it here.
        </p>
      )}
      {favouriteCourses.length > 0 && visibleCourses.length === 0 && (
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
          labelledBy="favourites-heading"
        />
      )}
    </main>
  );
}

export default Favourites;
