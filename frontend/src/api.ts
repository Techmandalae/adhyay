export const loadSubjects = (classId: string) => {
  return fetch(`/api/academic/subjects/${classId}`);
};
