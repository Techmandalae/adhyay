const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://api.adhyay.techmandalae.com";

export const loadSubjects = (classId: string) => {
  const url = `${API_URL}/academic/subjects/${classId}`;
  console.log("Calling API:", url);
  return fetch(url);
};
