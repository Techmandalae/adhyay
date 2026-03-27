const KEY = "exam_buddy_submissions";

export type StoredSubmission = {
  submissionId: string;
  evaluationId: string;
  examId: string;
  createdAt: string;
};

export function loadSubmissions(): StoredSubmission[] {
  if (typeof window === "undefined") {
    return [];
  }
  const raw = window.localStorage.getItem(KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as StoredSubmission[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

export function saveSubmission(entry: StoredSubmission) {
  const existing = loadSubmissions();
  const updated = [entry, ...existing.filter((item) => item.submissionId !== entry.submissionId)];
  window.localStorage.setItem(KEY, JSON.stringify(updated));
}
