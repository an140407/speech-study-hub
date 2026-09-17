export type MindmapBranch = { title: string; children: string[] };
export type Mindmap = { topic: string; branches: MindmapBranch[] };
export type Flashcard = { front: string; back: string };
export type Mcq = { question: string; options: string[]; correct_index: number; explanation: string };
export type ClinicalCase = { scenario: string; guiding_questions: string[] };

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
};
