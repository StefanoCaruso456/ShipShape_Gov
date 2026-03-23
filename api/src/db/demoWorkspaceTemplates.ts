export interface DemoProgramTemplate {
  prefix: string;
  name: string;
  color: string;
  description: string;
  goals: string;
}

export interface DemoProjectTemplate {
  name: string;
  color: string;
  emoji: string;
  description: string;
  impact: number;
  confidence: number;
  ease: number;
  plan: string;
  successCriteria: string[];
  monetaryImpactExpected: number;
  hasDesignReview?: boolean;
  designReviewNotes?: string | null;
}

export const DEMO_PROGRAM_TEMPLATES: DemoProgramTemplate[] = [
  {
    prefix: 'SHIP',
    name: 'Ship Core',
    color: '#3B82F6',
    description: 'Core product workspace for the main planning, document, and execution surfaces in Ship.',
    goals: 'Keep the core planning and execution experience fast, legible, and dependable across daily workflows.',
  },
  {
    prefix: 'AUTH',
    name: 'Authentication',
    color: '#8B5CF6',
    description: 'Authentication and access-management program covering login, session, and permission workflows.',
    goals: 'Reduce auth friction while keeping workspace access, session handling, and approval flows secure.',
  },
  {
    prefix: 'API',
    name: 'API Platform',
    color: '#10B981',
    description: 'Platform API program covering backend endpoints, contracts, and service reliability.',
    goals: 'Keep API surfaces consistent, observable, and ready for product teams shipping new workflow features.',
  },
  {
    prefix: 'UI',
    name: 'Design System',
    color: '#F59E0B',
    description: 'Design system program focused on shared UI components, patterns, and accessibility coverage.',
    goals: 'Make shared UI primitives reusable, accessible, and visually consistent across Ship surfaces.',
  },
  {
    prefix: 'INFRA',
    name: 'Infrastructure',
    color: '#EF4444',
    description: 'Infrastructure program for deployment, worker, data, and environment reliability work.',
    goals: 'Improve delivery confidence, operational resilience, and scaling readiness for the platform.',
  },
];

export const DEMO_PROJECT_TEMPLATES: DemoProjectTemplate[] = [
  {
    name: 'Core Features',
    color: '#6366f1',
    emoji: '🚀',
    description: 'Primary roadmap slice for the highest-value product capabilities the team is actively shipping.',
    impact: 5,
    confidence: 4,
    ease: 3,
    plan: 'Building core features will establish the product foundation and attract early adopters.',
    successCriteria: [
      'Ship the highest-priority feature slice with visible user value.',
      'Resolve critical regressions before the work is marked complete.',
    ],
    monetaryImpactExpected: 50000,
    hasDesignReview: true,
    designReviewNotes: 'Design approved after review session on 2025-01-15. UI mockups finalized.',
  },
  {
    name: 'Bug Fixes',
    color: '#ef4444',
    emoji: '🐛',
    description: 'Quality slice for fixing the most painful defects, regressions, and workflow interruptions.',
    impact: 4,
    confidence: 5,
    ease: 4,
    plan: 'Fixing bugs will improve user retention and reduce support costs.',
    successCriteria: [
      'Close the most user-visible defects.',
      'Reduce repeated support pain without destabilizing active work.',
    ],
    monetaryImpactExpected: 15000,
    hasDesignReview: false,
    designReviewNotes: null,
  },
  {
    name: 'Performance',
    color: '#22c55e',
    emoji: '⚡',
    description: 'Performance and scalability slice for improving latency, throughput, and operational efficiency.',
    impact: 4,
    confidence: 3,
    ease: 2,
    plan: 'Performance improvements will increase user satisfaction and enable scale.',
    successCriteria: [
      'Reduce noticeable latency in the highest-traffic flows.',
      'Make the core experience feel faster and more stable under load.',
    ],
    monetaryImpactExpected: 25000,
  },
];
