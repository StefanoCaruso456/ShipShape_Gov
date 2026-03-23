export interface DemoProgramTemplate {
  prefix: string;
  name: string;
  color: string;
}

export interface DemoProjectTemplate {
  name: string;
  color: string;
  emoji: string;
  impact: number;
  confidence: number;
  ease: number;
  plan: string;
  monetaryImpactExpected: number;
  hasDesignReview?: boolean;
  designReviewNotes?: string | null;
}

export const DEMO_PROGRAM_TEMPLATES: DemoProgramTemplate[] = [
  { prefix: 'SHIP', name: 'Ship Core', color: '#3B82F6' },
  { prefix: 'AUTH', name: 'Authentication', color: '#8B5CF6' },
  { prefix: 'API', name: 'API Platform', color: '#10B981' },
  { prefix: 'UI', name: 'Design System', color: '#F59E0B' },
  { prefix: 'INFRA', name: 'Infrastructure', color: '#EF4444' },
];

export const DEMO_PROJECT_TEMPLATES: DemoProjectTemplate[] = [
  {
    name: 'Core Features',
    color: '#6366f1',
    emoji: '🚀',
    impact: 5,
    confidence: 4,
    ease: 3,
    plan: 'Building core features will establish the product foundation and attract early adopters.',
    monetaryImpactExpected: 50000,
    hasDesignReview: true,
    designReviewNotes: 'Design approved after review session on 2025-01-15. UI mockups finalized.',
  },
  {
    name: 'Bug Fixes',
    color: '#ef4444',
    emoji: '🐛',
    impact: 4,
    confidence: 5,
    ease: 4,
    plan: 'Fixing bugs will improve user retention and reduce support costs.',
    monetaryImpactExpected: 15000,
    hasDesignReview: false,
    designReviewNotes: null,
  },
  {
    name: 'Performance',
    color: '#22c55e',
    emoji: '⚡',
    impact: 4,
    confidence: 3,
    ease: 2,
    plan: 'Performance improvements will increase user satisfaction and enable scale.',
    monetaryImpactExpected: 25000,
  },
];
