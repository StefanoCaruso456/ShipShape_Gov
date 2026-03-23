import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, queryPersister } from '@/lib/queryClient';
import { WorkspaceProvider } from '@/contexts/WorkspaceContext';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { RealtimeEventsProvider } from '@/hooks/useRealtimeEvents';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { DocumentsProvider } from '@/contexts/DocumentsContext';
import { ProgramsProvider } from '@/contexts/ProgramsContext';
import { IssuesProvider } from '@/contexts/IssuesContext';
import { ProjectsProvider } from '@/contexts/ProjectsContext';
import { ArchivedPersonsProvider } from '@/contexts/ArchivedPersonsContext';
import { CurrentDocumentProvider } from '@/contexts/CurrentDocumentContext';
import { CurrentViewProvider } from '@/contexts/CurrentViewContext';
import { UploadProvider } from '@/contexts/UploadContext';
import { ReviewQueueProvider } from '@/contexts/ReviewQueueContext';
import { ToastProvider } from '@/components/ui/Toast';
import { MutationErrorToast } from '@/components/MutationErrorToast';
import './index.css';

const LazyReactQueryDevtools = lazy(async () => {
  const module = await import('@tanstack/react-query-devtools');
  return { default: module.ReactQueryDevtools };
});

const PublicFeedbackPage = lazy(async () => {
  const module = await import('@/pages/PublicFeedback');
  return { default: module.PublicFeedbackPage };
});

const SetupPage = lazy(async () => {
  const module = await import('@/pages/Setup');
  return { default: module.SetupPage };
});

const LoginPage = lazy(async () => {
  const module = await import('@/pages/Login');
  return { default: module.LoginPage };
});

const InviteAcceptPage = lazy(async () => {
  const module = await import('@/pages/InviteAccept');
  return { default: module.InviteAcceptPage };
});

const AdminDashboardPage = lazy(async () => {
  const module = await import('@/pages/AdminDashboard');
  return { default: module.AdminDashboardPage };
});

const AdminWorkspaceDetailPage = lazy(async () => {
  const module = await import('@/pages/AdminWorkspaceDetail');
  return { default: module.AdminWorkspaceDetailPage };
});

const AppLayout = lazy(async () => {
  const module = await import('@/pages/App');
  return { default: module.AppLayout };
});

const DashboardPage = lazy(async () => {
  const module = await import('@/pages/Dashboard');
  return { default: module.DashboardPage };
});

const MyWeekPage = lazy(async () => {
  const module = await import('@/pages/MyWeekPage');
  return { default: module.MyWeekPage };
});

const AnalyticsPage = lazy(async () => {
  const module = await import('@/pages/AnalyticsPage');
  return { default: module.AnalyticsPage };
});

const DocumentsPage = lazy(async () => {
  const module = await import('@/pages/Documents');
  return { default: module.DocumentsPage };
});

const UnifiedDocumentPage = lazy(async () => {
  const module = await import('@/pages/UnifiedDocumentPage');
  return { default: module.UnifiedDocumentPage };
});

const IssuesPage = lazy(async () => {
  const module = await import('@/pages/Issues');
  return { default: module.IssuesPage };
});

const ProjectsPage = lazy(async () => {
  const module = await import('@/pages/Projects');
  return { default: module.ProjectsPage };
});

const ProgramsPage = lazy(async () => {
  const module = await import('@/pages/Programs');
  return { default: module.ProgramsPage };
});

const TeamModePage = lazy(async () => {
  const module = await import('@/pages/TeamMode');
  return { default: module.TeamModePage };
});

const TeamDirectoryPage = lazy(async () => {
  const module = await import('@/pages/TeamDirectory');
  return { default: module.TeamDirectoryPage };
});

const StatusOverviewPage = lazy(async () => {
  const module = await import('@/pages/StatusOverviewPage');
  return { default: module.StatusOverviewPage };
});

const ReviewsPage = lazy(async () => {
  const module = await import('@/pages/ReviewsPage');
  return { default: module.ReviewsPage };
});

const OrgChartPage = lazy(async () => {
  const module = await import('@/pages/OrgChartPage');
  return { default: module.OrgChartPage };
});

const PersonEditorPage = lazy(async () => {
  const module = await import('@/pages/PersonEditor');
  return { default: module.PersonEditorPage };
});

const FeedbackEditorPage = lazy(async () => {
  const module = await import('@/pages/FeedbackEditor');
  return { default: module.FeedbackEditorPage };
});

const WorkspaceSettingsPage = lazy(async () => {
  const module = await import('@/pages/WorkspaceSettings');
  return { default: module.WorkspaceSettingsPage };
});

const ConvertedDocumentsPage = lazy(async () => {
  const module = await import('@/pages/ConvertedDocuments');
  return { default: module.ConvertedDocumentsPage };
});

/**
 * Redirect component for type-specific routes to canonical /documents/:id
 * Uses replace to ensure browser history only has one entry
 */
function DocumentRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/documents/${id}`} replace />;
}

/**
 * Redirect component for /programs/:id/* routes to /documents/:id/*
 * Preserves the tab portion of the path and maps legacy "sprints" to "weeks".
 */
function ProgramTabRedirect() {
  const { id, '*': splat } = useParams<{ id: string; '*': string }>();
  const tab = splat?.startsWith('sprints')
    ? splat.replace(/^sprints\b/, 'weeks')
    : splat || '';
  const targetPath = tab ? `/documents/${id}/${tab}` : `/documents/${id}`;
  return <Navigate to={targetPath} replace />;
}

/**
 * Redirect component for /sprints/:id/* routes to /documents/:id/*
 * Maps old sprint sub-routes to new unified document tab routes
 */
function SprintTabRedirect({ tab }: { tab?: string }) {
  const { id } = useParams<{ id: string }>();
  // Map 'planning' to 'plan' for consistency
  const mappedTab = tab === 'planning' ? 'plan' : tab;
  // 'view' maps to root (overview tab)
  const targetPath = mappedTab && mappedTab !== 'view'
    ? `/documents/${id}/${mappedTab}`
    : `/documents/${id}`;
  return <Navigate to={targetPath} replace />;
}

function PlaceholderPage({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <h1 className="text-xl font-medium text-foreground">{title}</h1>
      <p className="mt-1 text-sm text-muted">{subtitle}</p>
    </div>
  );
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/docs" replace />;
  }

  return <>{children}</>;
}

function RouteFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="text-muted">Loading...</div>
    </div>
  );
}

function LazyRoute({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isSuperAdmin } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isSuperAdmin) {
    return <Navigate to="/docs" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      {/* Truly public routes - no AuthProvider wrapper */}
      <Route
        path="/feedback/:programId"
        element={
          <LazyRoute>
            <PublicFeedbackPage />
          </LazyRoute>
        }
      />
      {/* Routes that need AuthProvider (even if some are public) */}
      <Route
        path="/*"
        element={
          <WorkspaceProvider>
            <AuthProvider>
              <RealtimeEventsProvider>
                <AppRoutes />
              </RealtimeEventsProvider>
            </AuthProvider>
          </WorkspaceProvider>
        }
      />
    </Routes>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/setup"
        element={
          <LazyRoute>
            <SetupPage />
          </LazyRoute>
        }
      />
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LazyRoute>
              <LoginPage />
            </LazyRoute>
          </PublicRoute>
        }
      />
      <Route
        path="/invite/:token"
        element={
          <LazyRoute>
            <InviteAcceptPage />
          </LazyRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <SuperAdminRoute>
            <LazyRoute>
              <AdminDashboardPage />
            </LazyRoute>
          </SuperAdminRoute>
        }
      />
      <Route
        path="/admin/workspaces/:id"
        element={
          <SuperAdminRoute>
            <LazyRoute>
              <AdminWorkspaceDetailPage />
            </LazyRoute>
          </SuperAdminRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <CurrentViewProvider>
              <CurrentDocumentProvider>
                <ArchivedPersonsProvider>
                  <DocumentsProvider>
                    <ProgramsProvider>
                      <ProjectsProvider>
                        <IssuesProvider>
                          <UploadProvider>
                            <LazyRoute>
                              <AppLayout />
                            </LazyRoute>
                          </UploadProvider>
                        </IssuesProvider>
                      </ProjectsProvider>
                    </ProgramsProvider>
                  </DocumentsProvider>
                </ArchivedPersonsProvider>
              </CurrentDocumentProvider>
            </CurrentViewProvider>
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/my-week" replace />} />
        <Route path="dashboard" element={<LazyRoute><DashboardPage /></LazyRoute>} />
        <Route path="my-week" element={<LazyRoute><MyWeekPage /></LazyRoute>} />
        <Route path="analytics" element={<LazyRoute><AnalyticsPage /></LazyRoute>} />
        <Route path="docs" element={<LazyRoute><DocumentsPage /></LazyRoute>} />
        <Route path="docs/:id" element={<DocumentRedirect />} />
        <Route path="documents/:id/*" element={<LazyRoute><UnifiedDocumentPage /></LazyRoute>} />
        <Route path="issues" element={<LazyRoute><IssuesPage /></LazyRoute>} />
        <Route path="issues/:id" element={<DocumentRedirect />} />
        <Route path="projects" element={<LazyRoute><ProjectsPage /></LazyRoute>} />
        <Route path="projects/:id" element={<DocumentRedirect />} />
        <Route path="programs" element={<LazyRoute><ProgramsPage /></LazyRoute>} />
        <Route path="programs/:programId/sprints/:id" element={<DocumentRedirect />} />
        <Route path="programs/:id/*" element={<ProgramTabRedirect />} />
        <Route path="sprints" element={<Navigate to="/team/allocation" replace />} />
        {/* Sprint routes - redirect legacy views to /documents/:id, keep planning workflow */}
        <Route path="sprints/:id" element={<DocumentRedirect />} />
        <Route path="sprints/:id/view" element={<SprintTabRedirect tab="view" />} />
        <Route path="sprints/:id/plan" element={<SprintTabRedirect tab="plan" />} />
        <Route path="sprints/:id/planning" element={<SprintTabRedirect tab="planning" />} />
        <Route path="sprints/:id/standups" element={<SprintTabRedirect tab="standups" />} />
        <Route path="sprints/:id/review" element={<SprintTabRedirect tab="review" />} />
        <Route path="team" element={<Navigate to="/team/allocation" replace />} />
        <Route path="team/allocation" element={<LazyRoute><TeamModePage /></LazyRoute>} />
        <Route path="team/directory" element={<LazyRoute><TeamDirectoryPage /></LazyRoute>} />
        <Route path="team/status" element={<LazyRoute><StatusOverviewPage /></LazyRoute>} />
        <Route path="team/reviews" element={<LazyRoute><ReviewsPage /></LazyRoute>} />
        <Route path="team/org-chart" element={<LazyRoute><OrgChartPage /></LazyRoute>} />
        {/* Person profile stays in Teams context - no redirect to /documents */}
        <Route path="team/:id" element={<LazyRoute><PersonEditorPage /></LazyRoute>} />
        <Route path="feedback/:id" element={<LazyRoute><FeedbackEditorPage /></LazyRoute>} />
        <Route path="settings" element={<LazyRoute><WorkspaceSettingsPage /></LazyRoute>} />
        <Route path="settings/conversions" element={<LazyRoute><ConvertedDocumentsPage /></LazyRoute>} />
      </Route>
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: queryPersister }}
    >
      <ToastProvider>
        <MutationErrorToast />
        <BrowserRouter>
          <ReviewQueueProvider>
            <App />
          </ReviewQueueProvider>
        </BrowserRouter>
      </ToastProvider>
      {import.meta.env.DEV ? (
        <Suspense fallback={null}>
          <LazyReactQueryDevtools initialIsOpen={false} />
        </Suspense>
      ) : null}
    </PersistQueryClientProvider>
  </React.StrictMode>
);
