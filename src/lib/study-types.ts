export type MindmapBranch = { title: string; children: string[] };
export type Mindmap = { topic: string; branches: MindmapBranch[] };
export type Flashcard = { front: string; back: string; subtopic: string };
export type Mcq = { question: string; options: string[]; correct_index: number; explanation: string; subtopic: string };
export type GuidingQA = { question: string; answer: string; ai_explanation?: string | null };
export type ClinicalCase = { id?: string; scenario: string; guiding_questions: GuidingQA[]; case_explanation: string };

export type GeneratedMaterial = {
  summary: string;
  mindmap: Mindmap;
  flashcards: Flashcard[];
  mcq: Mcq[];
  clinical_case: ClinicalCase;
  review_questions: string[];
};

export type McqRow = {
  id: string;
  topic_id: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  subtopic: string | null;
  ai_explanation: string | null;
  seen_at: string | null;
};

export type FlashcardRow = {
  id: string;
  topic_id: string;
  front: string;
  back: string;
  subtopic: string | null;
  seen_at: string | null;
};

export type ClinicalCaseRow = {
  id: string;
  topic_id: string;
  scenario: string;
  guiding_questions: GuidingQA[];
  case_explanation: string | null;
  created_at: string;
};