export interface TemplateResult {
  kind: "stage" | "check" | "verify-claim" | "adc" | "high-risk-confirmation" | "execution-mode";
  name: string;
  content: string;
  meta?: {
    complexity?: "low" | "medium" | "high";
    fileCount?: number;
    taskCount?: number;
    behaviorChange?: boolean;
    recommendedSkills?: string[];
  };
}
