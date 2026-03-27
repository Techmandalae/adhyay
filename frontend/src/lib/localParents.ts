const KEY = "exam_buddy_parent_students";

export type LinkedStudent = {
  studentId: string;
  name?: string;
};

export function loadLinkedStudents(): LinkedStudent[] {
  if (typeof window === "undefined") {
    return [];
  }
  const raw = window.localStorage.getItem(KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as LinkedStudent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

export function saveLinkedStudents(students: LinkedStudent[]) {
  window.localStorage.setItem(KEY, JSON.stringify(students));
}
