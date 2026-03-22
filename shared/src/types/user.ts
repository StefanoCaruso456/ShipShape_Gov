export const WORK_PERSONAS = [
  'product_manager',
  'engineer',
  'engineering_manager',
  'designer',
  'qa',
  'ops_platform',
  'stakeholder',
  'other',
] as const;

export type WorkPersona = (typeof WORK_PERSONAS)[number];

export const WORK_PERSONA_LABELS: Record<WorkPersona, string> = {
  product_manager: 'Product Manager',
  engineer: 'Engineer',
  engineering_manager: 'Engineering Manager',
  designer: 'Designer',
  qa: 'QA',
  ops_platform: 'Ops / Platform',
  stakeholder: 'Stakeholder',
  other: 'Other',
};

// User types
export interface User {
  id: string;
  email: string;
  name: string;
  workPersona: WorkPersona | null;
  isSuperAdmin: boolean;
  lastWorkspaceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
